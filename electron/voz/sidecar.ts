/**
 * Processo auxiliar do motor de voz: início, RPC por linha JSON, reinício.
 *
 * O Electron é o único cliente do sidecar. Um pedido por vez (o modelo não
 * ganha nada com concorrência em CPU, e serializar evita dois textos
 * disputando a mesma referência). Se o processo cair no meio, os pedidos
 * DAQUELE processo falham com erro claro e o próximo pedido o sobe de novo —
 * até três quedas seguidas; depois disso fica em `erro` até o app reabrir.
 *
 * Cada pedido pertence ao processo que o recebeu. Antes o mapa de pedidos e o
 * contador de quedas eram da classe: a saída de um processo ANTIGO (encerrado
 * por prazo vencido ou por ociosidade, ainda terminando) derrubava o pedido
 * que já estava no processo NOVO e contava uma "queda" que não houve — e três
 * delas desligavam a voz até reabrir o app. Agora:
 *   - só a saída do processo que recebeu o pedido o derruba;
 *   - encerrar de propósito (ociosidade, prazo vencido, remover a voz, fechar
 *     o app) não conta como queda;
 *   - um processo novo só sobe depois que o anterior saiu;
 *   - o prazo de cada pedido conta desde a entrada na fila: um pedido que
 *     espera atrás de um download não fica esperando para sempre.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ehEvento,
  ehResposta,
  separarLinhasJson,
  type EventoDoMotor,
  type PedidoSemId,
  type RespostaDoMotor,
} from '../../src/voz/protocolo';

export interface LocalizacaoDoMotor {
  comando: string;
  args: string[];
  cwd?: string;
  /** Como o motor foi achado, para o log e para a tela. */
  origem: 'executavel' | 'python';
}

/**
 * Onde está o motor neste build.
 *
 *  - Empacotado: `resources/voice-engine/irisflow-voz(.exe)`, gerado por
 *    `voice-engine/build-voice-engine.ps1`.
 *  - Em desenvolvimento: `python -m irisflow_voz` dentro de `voice-engine/`,
 *    de preferência o `.venv` da pasta; `IRISFLOW_PYTHON` sobrepõe.
 */
export function localizarMotor(opcoes: { empacotado: boolean; resourcesPath: string; raizDoProjeto: string }): LocalizacaoDoMotor | null {
  const exe = process.platform === 'win32' ? 'irisflow-voz.exe' : 'irisflow-voz';
  const candidatosExe = [
    path.join(opcoes.resourcesPath, 'voice-engine', exe),
    path.join(opcoes.raizDoProjeto, 'voice-engine', 'dist', 'irisflow-voz', exe),
  ];
  for (const c of candidatosExe) {
    if (fs.existsSync(c)) return { comando: c, args: [], cwd: path.dirname(c), origem: 'executavel' };
  }
  if (opcoes.empacotado) return null;

  const pasta = path.join(opcoes.raizDoProjeto, 'voice-engine');
  if (!fs.existsSync(path.join(pasta, 'irisflow_voz', '__main__.py'))) return null;
  const venvPy = process.platform === 'win32'
    ? path.join(pasta, '.venv', 'Scripts', 'python.exe')
    : path.join(pasta, '.venv', 'bin', 'python');
  const python = process.env.IRISFLOW_PYTHON || (fs.existsSync(venvPy) ? venvPy : process.platform === 'win32' ? 'python' : 'python3');
  return { comando: python, args: ['-m', 'irisflow_voz'], cwd: pasta, origem: 'python' };
}

type Processo = ChildProcessWithoutNullStreams;

interface Pendente {
  /** Processo que recebeu o pedido: só a saída DELE derruba o pedido. */
  processo: Processo;
  resolver: (r: RespostaDoMotor) => void;
  rejeitar: (e: Error) => void;
}

export class Sidecar {
  private processo: Processo | null = null;
  /** Encerrados de propósito que ainda não saíram. Um processo novo espera por eles. */
  private saindo = new Set<Processo>();
  /** Quem espera a saída de cada processo (a fila e o `encerrarEAguardar`). */
  private esperasDeSaida = new Map<Processo, Array<() => void>>();
  /** Processos cuja saída já foi tratada (`error` e `exit` podem vir os dois). */
  private finalizados = new WeakSet<Processo>();
  private pendentes = new Map<number, Pendente>();
  private proximoId = 1;
  private quedas = 0;
  private fila: Promise<unknown> = Promise.resolve();
  private ocioso: NodeJS.Timeout | null = null;
  ultimoErro: string | null = null;

  /**
   * Depois deste tempo sem pedidos o processo é encerrado e o modelo sai da
   * memória (1–3 GB em CPU). O próximo pedido o sobe de novo — paga a carga
   * outra vez, mas o computador do paciente não fica com 3 GB presos por um
   * módulo que ele usou de manhã.
   */
  static readonly OCIOSO_MS = 15 * 60_000;

  /**
   * Cortesia entre o `sair` e o kill. O motor Python é síncrono: o `sair` só é
   * lido depois do comando em curso (uma síntese em CPU, a carga do modelo, um
   * download), então esperar por ele não tem teto — este é o teto.
   */
  static readonly CORTESIA_MS = 1500;

  /** Teto de espera pela saída de um processo, além da cortesia (kill que não pegou). */
  private static readonly TETO_DA_ESPERA_MS = 5000;

  constructor(
    private readonly onde: LocalizacaoDoMotor,
    private readonly ambiente: Record<string, string>,
    private readonly aoEvento: (e: EventoDoMotor) => void,
    private readonly aoMudar: () => void,
  ) {}

  get vivo(): boolean {
    return this.processo !== null && this.processo.exitCode === null;
  }

  get emErro(): boolean {
    return this.quedas >= 3;
  }

  /** Processos do motor ainda vivos (o corrente e os que estão saindo). Diagnóstico e testes. */
  get processosVivos(): number {
    let n = 0;
    for (const p of [this.processo, ...this.saindo]) if (p && p.exitCode === null && p.signalCode === null) n++;
    return n;
  }

  private subir(): Processo {
    if (this.vivo) return this.processo!;
    if (this.emErro) throw new Error(this.ultimoErro ?? 'O motor de voz caiu repetidamente.');
    const p = spawn(this.onde.comando, this.onde.args, {
      cwd: this.onde.cwd,
      // PYTHONUTF8: no Windows o stdin/stdout de um processo com pipes usa a
      // página de código ANSI; "ção" chegaria como lixo e "Á" derrubaria o
      // leitor. O motor também reconfigura o stdin, mas cinto e suspensório.
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...this.ambiente },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.processo = p;
    // Prioridade abaixo do normal (o motor também se rebaixa por dentro):
    // a síntese pode esperar; o rastreamento ocular e a interface, não. Sem
    // isto, carregar o modelo num computador de poucos núcleos congelava o
    // cursor de olhar por dezenas de segundos.
    if (p.pid) {
      try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* sem permissão: segue */ }
    }
    // EPIPE entre a morte do filho e o `exit`: sem ouvinte, vira exceção não
    // tratada no processo principal.
    p.stdin.on('error', (e) => console.warn('[voz] stdin do motor:', e.message));
    // Buffer de linhas POR PROCESSO: com um só para a classe, a saída de dois
    // processos vivos ao mesmo tempo se misturava no parser.
    let resto = '';
    p.stdout.setEncoding('utf-8');
    p.stdout.on('data', (chunk: string) => {
      const separadas = separarLinhasJson(resto + chunk);
      resto = separadas.resto;
      for (const m of separadas.mensagens) this.aoReceber(p, m);
    });
    p.stderr.setEncoding('utf-8');
    p.stderr.on('data', (chunk: string) => {
      const linhas = chunk.split(/\r?\n/).filter((l) => l.trim());
      for (const l of linhas) console.log(`[voz:py] ${l.slice(0, 400)}`);
    });
    p.on('error', (e) => {
      // `error` com o processo de pé (um kill que falhou) não é queda; sem pid,
      // o processo nem chegou a existir — isso é.
      if (p.pid !== undefined && p.exitCode === null) {
        console.warn('[voz] erro no processo do motor:', e.message);
        return;
      }
      const msg = `Não foi possível iniciar o motor de voz (${e.message}).`;
      console.error('[voz]', msg);
      this.aoSair(p, msg, true);
    });
    p.on('exit', (code, signal) => this.aoSair(p, `O motor de voz encerrou (código ${code ?? signal ?? '?'}).`, false));
    console.log(`[voz] motor iniciado via ${this.onde.origem}: ${this.onde.comando} ${this.onde.args.join(' ')}`);
    this.aoMudar();
    return p;
  }

  /**
   * O processo `p` terminou (ou nem começou). Derruba só os pedidos DELE; a
   * queda só conta se ninguém pediu para ele sair e ele levou pedidos junto
   * (ou se o processo nem chegou a iniciar).
   */
  private aoSair(p: Processo, msg: string, falhaAoIniciar: boolean): void {
    if (this.finalizados.has(p)) return;
    this.finalizados.add(p);
    if (this.processo === p) this.processo = null;
    const deProposito = this.saindo.delete(p);
    const meus = [...this.pendentes].filter(([, pend]) => pend.processo === p);
    if (falhaAoIniciar || (meus.length > 0 && !deProposito)) {
      this.ultimoErro = msg;
      this.quedas++;
    }
    const erro = new Error(deProposito ? 'O motor de voz foi encerrado.' : msg);
    for (const [id, pend] of meus) {
      this.pendentes.delete(id);
      pend.rejeitar(erro);
    }
    const esperas = this.esperasDeSaida.get(p) ?? [];
    this.esperasDeSaida.delete(p);
    for (const pronto of esperas) pronto();
    this.aoMudar();
  }

  private aoReceber(p: Processo, m: unknown): void {
    if (ehResposta(m)) {
      const pend = this.pendentes.get(m.id);
      // Resposta atrasada (prazo vencido) ou de outro processo: não é de ninguém.
      if (!pend || pend.processo !== p) return;
      this.pendentes.delete(m.id);
      this.quedas = 0;
      pend.resolver(m);
    } else if (ehEvento(m)) {
      // Progresso de um processo que está saindo não descreve o motor atual.
      if (p === this.processo) this.aoEvento(m);
    }
  }

  /** Resolve quando todos os processos em saída terminaram (com teto de segurança). */
  private aguardarSaidas(): Promise<void> {
    const esperas: Promise<void>[] = [];
    for (const p of this.saindo) {
      if (p.exitCode !== null || p.signalCode !== null) continue;
      esperas.push(new Promise<void>((pronto) => {
        const lista = this.esperasDeSaida.get(p) ?? [];
        lista.push(pronto);
        this.esperasDeSaida.set(p, lista);
        setTimeout(pronto, Sidecar.CORTESIA_MS + Sidecar.TETO_DA_ESPERA_MS).unref();
      }));
    }
    return Promise.all(esperas).then(() => undefined);
  }

  private rearmarOcioso(): void {
    if (this.ocioso) clearTimeout(this.ocioso);
    this.ocioso = setTimeout(() => {
      if (this.pendentes.size === 0) {
        console.log('[voz] motor ocioso: encerrando para liberar memória');
        this.encerrar();
      }
    }, Sidecar.OCIOSO_MS);
    this.ocioso.unref();
  }

  /**
   * Enfileira um pedido (um por vez) e devolve a resposta.
   *
   * `timeoutMs` conta desde AGORA, não desde a saída da fila. Vencido ainda na
   * fila, o pedido falha sem ser enviado e o processo em uso segue (ele não
   * está travado, está ocupado com outro pedido). Vencido no motor, o processo
   * é encerrado: um pedido sem resposta o deixa em estado desconhecido.
   */
  pedir(pedido: PedidoSemId, timeoutMs: number): Promise<RespostaDoMotor> {
    let resolverResultado!: (r: RespostaDoMotor) => void;
    let rejeitarResultado!: (e: Error) => void;
    const resultado = new Promise<RespostaDoMotor>((res, rej) => { resolverResultado = res; rejeitarResultado = rej; });
    let fase: 'fila' | 'motor' | 'fim' = 'fila';
    let id: number | null = null;
    const concluir = (fazer: () => void) => {
      if (fase === 'fim') return;
      fase = 'fim';
      clearTimeout(prazo);
      if (id !== null) this.pendentes.delete(id);
      fazer();
    };
    const prazo = setTimeout(() => {
      const noMotor = fase === 'motor';
      const s = Math.round(timeoutMs / 1000);
      concluir(() => rejeitarResultado(new Error(noMotor
        ? `O motor de voz não respondeu em ${s} s (${pedido.cmd}).`
        : `O motor de voz estava ocupado e não atendeu em ${s} s (${pedido.cmd}).`)));
      if (noMotor) this.encerrar();
    }, timeoutMs);

    const executar = async (): Promise<void> => {
      if (fase !== 'fila') return;
      // Um processo encerrado ainda terminando: o novo só sobe depois que ele
      // sair (dois motores vivos disputariam memória e a mesma referência).
      await this.aguardarSaidas();
      if (fase !== 'fila') return;
      let p: Processo;
      try {
        p = this.subir();
        this.rearmarOcioso();
      } catch (e) {
        concluir(() => rejeitarResultado(e instanceof Error ? e : new Error(String(e))));
        return;
      }
      const meuId = this.proximoId++;
      id = meuId;
      fase = 'motor';
      this.pendentes.set(meuId, {
        processo: p,
        resolver: (r) => concluir(() => resolverResultado(r)),
        rejeitar: (e) => concluir(() => rejeitarResultado(e)),
      });
      p.stdin.write(JSON.stringify({ id: meuId, ...pedido }) + '\n', (err) => {
        if (err) concluir(() => rejeitarResultado(err));
      });
      // A fila anda quando ESTE pedido termina (resposta, erro ou prazo).
      await resultado.then(() => undefined, () => undefined);
    };
    const proximo = this.fila.then(executar, executar);
    this.fila = proximo.catch(() => undefined);
    return resultado;
  }

  /**
   * Pede ao motor que saia: `sair` + fecha o stdin e, passada a cortesia,
   * mata. Não conta como queda. Os pedidos em curso nesse processo falham com
   * "O motor de voz foi encerrado."
   */
  encerrar(): void {
    if (this.ocioso) { clearTimeout(this.ocioso); this.ocioso = null; }
    const p = this.processo;
    if (!p) return;
    this.processo = null;
    this.saindo.add(p);
    try {
      p.stdin.write(JSON.stringify({ id: 0, cmd: 'sair' }) + '\n');
      p.stdin.end();
    } catch { /* já morreu */ }
    setTimeout(() => {
      if (p.exitCode === null && p.signalCode === null) {
        try { p.kill('SIGKILL'); } catch { /* já saiu */ }
      }
    }, Sidecar.CORTESIA_MS).unref();
    this.aoMudar();
  }

  /**
   * `encerrar()` e espera o processo sair de fato (no máximo a cortesia e o
   * kill). É o que o `before-quit` usa: sem esperar, o Electron saía antes do
   * kill e o motor seguia vivo, órfão, até o fim do comando em curso.
   */
  encerrarEAguardar(): Promise<void> {
    this.encerrar();
    return this.aguardarSaidas();
  }

  /** Mata JÁ todo processo do motor que ainda exista. Último recurso do `quit`. */
  matarAgora(): void {
    if (this.ocioso) { clearTimeout(this.ocioso); this.ocioso = null; }
    for (const p of [this.processo, ...this.saindo]) {
      if (p && p.exitCode === null && p.signalCode === null) {
        try { p.kill('SIGKILL'); } catch { /* já saiu */ }
      }
    }
  }
}

/**
 * Segura o fechamento do app até o motor de voz sair.
 *
 * No `before-quit` o fechamento é adiado UMA vez: o motor recebe o `sair` e,
 * quando sai (ou é morto ao fim da cortesia), o app fecha de novo — agora sem
 * ser segurado, então não há laço. No `quit`, o que ainda estiver vivo morre.
 */
export function segurarSaidaAteOMotorSair(
  app: { on(evento: 'before-quit', ouvinte: (e: { preventDefault(): void }) => void): unknown; on(evento: 'quit', ouvinte: () => void): unknown; quit(): void },
  motor: { encerrarEAguardar(): Promise<void>; matarAgora(): void },
): void {
  let liberado = false;
  let aguardando = false;
  app.on('before-quit', (e) => {
    if (liberado) return;
    e.preventDefault();
    if (aguardando) return;
    aguardando = true;
    void motor.encerrarEAguardar()
      .catch((erro) => console.warn('[voz] encerramento do motor falhou:', erro))
      .finally(() => {
        liberado = true;
        app.quit();
      });
  });
  app.on('quit', () => motor.matarAgora());
}
