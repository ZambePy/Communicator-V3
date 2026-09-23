/**
 * Cliente da Edge Function `desktop-sync` — o canal de ESCRITA do desktop.
 *
 * Por que uma função e não escrever direto nas tabelas? Porque o mesmo usuário
 * (a conta da família) é o cuidador no celular e o paciente no computador. O
 * banco não tem como saber quem está falando pela sessão; a chave do
 * computador (`x-device-key`, obtida em `pair_device()`) é o que identifica
 * "isto veio do desktop do paciente". A função força `sender = 'paciente'`,
 * amarra a sessão ao `device_id` e dispara o push do cuidador.
 *
 * Contrato (espelho de supabase/functions/desktop-sync/index.ts):
 *   heartbeat, session.upsert, session.end, calibration.result, message.send,
 *   message.spoken, messages.pending, help.create, settings.get, voice.status,
 *   report.send, device.info
 *
 * Fila offline: com o computador vinculado, o que não puder ser enviado (sem
 * rede, função fora) fica em `irisflow.fila` e é reenviado na ordem quando a
 * conexão volta. Pedidos de socorro e mensagens não são descartados (o teto é
 * de 200 itens); heartbeat não entra na fila (o próximo substitui).
 *
 * Sem destinatário — nuvem não configurada ou computador sem vínculo — nada é
 * guardado: uma fala ou um socorro gravados no disco iriam, no próximo
 * vínculo, para quem entrasse, talvez outra conta e horas depois. Pelo mesmo
 * motivo cada item da fila leva a marca do vínculo em que entrou (uma
 * impressão curta da chave, nunca a chave): chave recusada esvazia a fila, e
 * item de outro vínculo é descartado antes de qualquer envio.
 *
 * Horário original: cada evento enfileirável sai com `occurred_at`, o instante
 * em que aconteceu, carimbado aqui antes da primeira tentativa, e com
 * `sent_at`, o relógio deste computador em cada tentativa. A função grava a
 * hora do servidor menos o atraso (sent_at − occurred_at, até 24 h): um
 * socorro que esperou 3 h na fila chega com a hora real, e não como novo —
 * mesmo que o relógio do computador esteja errado.
 */
import { cloudConfig } from './config';
import { cofre, CHAVES } from './armazenamento';
import type { Message, PatientSettings, QuickPhrase, SessaoRemota, HelpKind, MessageKind } from './types';

/**
 * `occurred_at`: instante em que o evento aconteceu (ISO), carimbado por
 * `DesktopSync.enviar` nas ações enfileiráveis. `sent_at`: o relógio deste
 * computador no envio, acrescentado a cada tentativa. Quem chama não
 * preenche nenhum dos dois.
 */
type ComHorario = { occurred_at?: string; sent_at?: string };

export type AcaoSync =
  | { action: 'heartbeat'; app_version: string; camera_ok: boolean; tracker_ok: boolean; calibrated: boolean }
  | { action: 'session.upsert'; session: SessaoRemota }
  | ({ action: 'session.end'; session_id: string; utterances?: number; chars_typed?: number; modules_used?: string[] } & ComHorario)
  | ({ action: 'calibration.result'; session_id?: string; calibration: SessaoRemota; report: SessaoRemota['accuracy_report'] } & ComHorario)
  | ({ action: 'message.send'; text: string; kind: MessageKind } & ComHorario)
  | ({ action: 'message.spoken'; message_id: string } & ComHorario)
  | { action: 'messages.pending' }
  | ({ action: 'help.create'; kind: HelpKind; message: string; session_id?: string | null } & ComHorario)
  | { action: 'settings.get' }
  /** Rótulo da voz em uso, para o app do cuidador mostrar em Ajustes → Voz. */
  | ({ action: 'voice.status'; voice: string } & ComHorario)
  /**
   * Relatório de suporte (opt-in, desligado por padrão). Só números e erros
   * do aplicativo — `montarRelatorio()` garante que nenhuma frase do paciente
   * entra. `motivo: 'erro'` é o envio automático após uma falha; `'manual'` é
   * o botão em Ajustes.
   */
  | { action: 'report.send'; report: unknown; motivo: 'erro' | 'manual'; resumo?: string }
  /**
   * Verificação periódica da licença. NÃO passa por `DesktopSync.enviar`:
   * quem chama é `supabaseLicenseService.verify()` com `fetch` direto,
   * porque a resposta precisa chegar AGORA (decide se o app abre) e nunca
   * pode ir para a fila offline. O tipo fica aqui para o contrato com a
   * Edge Function ser um só; `RespostaSync` abaixo tem os campos dela.
   */
  | { action: 'device.info' };

export interface RespostaSync {
  ok?: boolean;
  id?: string;
  error?: string;
  /** `voice.status` e `report.send`: o servidor gravou de fato? */
  stored?: boolean;
  pending_messages?: number;
  messages?: Message[];
  settings?: PatientSettings | null;
  phrases?: QuickPhrase[];
  device?: { id: string; name: string; os: string; app_version: string };
  beneficiary?: { id: string; user_name: string } | null;
  /** `device.info`: resultado de `license_for_profile()` e computadores ativos. */
  license?: unknown;
  devices_active?: number;
}

export class ErroDeSync extends Error {
  readonly status: number;
  readonly codigo?: string;
  constructor(status: number, message: string, codigo?: string) {
    super(message);
    this.name = 'ErroDeSync';
    this.status = status;
    this.codigo = codigo;
  }
  /**
   * A chave não vale mais (revogada ou apagada) — não adianta reenviar. Só os
   * códigos que a PRÓPRIA função devolve contam: um 401 do gateway do Supabase
   * ("Missing authorization header", função publicada com verify_jwt) é
   * problema de implantação, não de credencial, e vai para a fila.
   */
  get credencialInvalida(): boolean {
    return (this.status === 401 || this.status === 403)
      && (this.codigo === 'unauthorized' || this.codigo === 'device_revoked');
  }
  /** Erro do nosso payload (400, 404, 413…): reenviar igual não resolve. 401/403/429 não são definitivos. */
  get definitivo(): boolean {
    return this.status >= 400 && this.status < 500
      && this.status !== 401 && this.status !== 403 && this.status !== 429;
  }
}

interface ItemDaFila {
  acao: AcaoSync;
  criadoEm: string;
  tentativas: number;
  /**
   * Vínculo em que o item entrou na fila: `impressaoDaChave(chave)`. Itens sem
   * a marca foram gravados por versões anteriores, que enfileiravam até sem
   * computador vinculado e regravavam a fila depois de a chave ser recusada:
   * não há como saber a quem se destinavam, então são descartados.
   */
  vinculo?: string;
}

/**
 * Impressão curta da chave do computador (FNV-1a, 32 bits): distingue um
 * vínculo de outro sem gravar a chave junto da fila.
 */
export function impressaoDaChave(chave: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Ações que valem a pena guardar para depois. `session.upsert` fica de fora:
 * a resposta (o id da sessão) é o que importa, e uma abertura reenviada horas
 * depois só criaria uma sessão órfã — quem reabre é o CloudProvider quando a
 * rede volta.
 */
const ENFILEIRAVEIS = new Set<AcaoSync['action']>([
  'session.end', 'calibration.result', 'message.send', 'message.spoken', 'help.create', 'voice.status',
]);
const MAX_FILA = 200;

export interface OpcoesSync {
  url?: string;
  chave: () => string | null;
  /** Chave anônima do projeto: o gateway do Supabase exige um JWT válido antes de entregar à função. */
  anonKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Chamado quando a chave é recusada (dispositivo revogado). */
  aoPerderCredencial?: () => void;
  /** Relógio (testes). */
  agora?: () => number;
}

export class DesktopSync {
  private fila: ItemDaFila[] = [];
  private filaCarregada = false;
  private drenando = false;
  private readonly op: OpcoesSync;
  private readonly url: string;
  private readonly anonKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly agora: () => number;

  constructor(op: OpcoesSync) {
    this.op = op;
    this.url = op.url ?? cloudConfig.desktopSyncUrl;
    this.anonKey = op.anonKey ?? cloudConfig.anonKey;
    this.fetchImpl = op.fetchImpl ?? ((...a) => fetch(...a));
    this.timeoutMs = op.timeoutMs ?? 10_000;
    this.agora = op.agora ?? Date.now;
  }

  get tamanhoDaFila(): number {
    return this.fila.length;
  }

  /**
   * Envia agora. Se falhar por rede/servidor e a ação for enfileirável, guarda
   * e resolve com `{ ok: false, error }` em vez de lançar: a tela do paciente
   * não deve saber que a internet caiu.
   */
  async enviar(acao: AcaoSync): Promise<RespostaSync> {
    const chave = this.op.chave();
    if (!chave || !this.url) {
      // Sem nuvem configurada ou sem computador vinculado não há para quem
      // mandar, e NADA vai para o disco (ver o cabeçalho).
      return { ok: false, error: 'sem_vinculo' };
    }
    const comHorario = this.carimbar(acao);
    try {
      const resposta = await this.chamar(comHorario, chave);
      // conexão está boa: aproveita para drenar o que ficou pendente
      if (this.fila.length) void this.drenar();
      return resposta;
    } catch (e) {
      if (e instanceof ErroDeSync && e.credencialInvalida) {
        await this.perderCredencial();
        return { ok: false, error: e.codigo ?? 'unauthorized' };
      }
      if (e instanceof ErroDeSync && e.definitivo) {
        // erro de payload: reenviar não resolve
        console.warn(`[cloud] ${acao.action} rejeitada: ${e.message}`);
        return { ok: false, error: e.message };
      }
      // rede, servidor fora, gateway sem JWT, limite de taxa: tenta depois
      if (ENFILEIRAVEIS.has(acao.action)) await this.enfileirar(comHorario, chave).catch(() => undefined);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Ações enfileiráveis saem com o instante em que aconteceram: o mesmo
   * carimbo vale para a primeira tentativa e para o reenvio da fila.
   */
  private carimbar(acao: AcaoSync): AcaoSync {
    if (!ENFILEIRAVEIS.has(acao.action) || ('occurred_at' in acao && acao.occurred_at)) return acao;
    return { ...acao, occurred_at: new Date(this.agora()).toISOString() } as AcaoSync;
  }

  /** Esvazia a fila (ao sair da conta: o que ficou não pode ir parar em outra). */
  async limparFila(): Promise<void> {
    this.fila = [];
    this.filaCarregada = true;
    await cofre.remover(CHAVES.filaDeEnvio);
  }

  /** Cabeçalhos de toda chamada: JWT anônimo para o gateway + chave do computador para a função. */
  cabecalhos(chave: string): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-device-key': chave,
      ...(this.anonKey ? { apikey: this.anonKey, authorization: `Bearer ${this.anonKey}` } : {}),
    };
  }

  /** Reenvia a fila na ordem. Para na primeira falha de rede. */
  async drenar(): Promise<number> {
    if (this.drenando) return 0;
    const chave = this.op.chave();
    if (!chave || !this.url) return 0;
    this.drenando = true;
    let enviados = 0;
    try {
      await this.carregarFila();
      this.descartarDeOutroVinculo(chave);
      while (this.fila.length) {
        const item = this.fila[0];
        try {
          await this.chamar(item.acao, chave);
          this.fila.shift();
          enviados++;
        } catch (e) {
          if (e instanceof ErroDeSync && e.credencialInvalida) {
            await this.perderCredencial();
            break;
          }
          if (e instanceof ErroDeSync && e.definitivo) {
            // payload inválido: descarta para não travar a fila inteira
            console.warn(`[cloud] descartando ${item.acao.action} da fila: ${e.message}`);
            this.fila.shift();
            continue;
          }
          item.tentativas++;
          break;
        }
      }
      await this.persistirFila();
      return enviados;
    } finally {
      this.drenando = false;
    }
  }

  /**
   * Evento com `occurred_at` sai com `sent_at` (o relógio deste computador
   * agora): a Edge Function usa a diferença entre os dois — quanto o evento
   * esperou —, e não o relógio em si, que pode estar errado.
   */
  private comEnvio(acao: AcaoSync): AcaoSync {
    if (!('occurred_at' in acao) || !acao.occurred_at) return acao;
    return { ...acao, sent_at: new Date(this.agora()).toISOString() } as AcaoSync;
  }

  private async chamar(acao: AcaoSync, chave: string): Promise<RespostaSync> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: this.cabecalhos(chave),
        body: JSON.stringify(this.comEnvio(acao)),
        signal: controller.signal,
      });
      let corpo: RespostaSync = {};
      try { corpo = (await res.json()) as RespostaSync; } catch { /* sem corpo */ }
      if (!res.ok) throw new ErroDeSync(res.status, corpo.error ?? `HTTP ${res.status}`, corpo.error);
      return corpo;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * A chave foi recusada (computador desvinculado): o que estava na fila não
   * tem mais para quem ir e não pode seguir para o próximo vínculo.
   */
  private async perderCredencial(): Promise<void> {
    this.fila = [];
    this.filaCarregada = true;
    await cofre.remover(CHAVES.filaDeEnvio).catch(() => undefined);
    this.op.aoPerderCredencial?.();
  }

  /** Tira da fila o que entrou em outro vínculo (ou numa versão sem a marca). */
  private descartarDeOutroVinculo(chave: string): void {
    const vinculo = impressaoDaChave(chave);
    const antes = this.fila.length;
    this.fila = this.fila.filter((it) => it.vinculo === vinculo);
    const fora = antes - this.fila.length;
    if (fora) console.warn(`[cloud] ${fora} item(ns) da fila descartado(s): não eram deste vínculo`);
  }

  private async enfileirar(acao: AcaoSync, chave: string): Promise<void> {
    await this.carregarFila();
    this.descartarDeOutroVinculo(chave);
    this.fila.push({ acao, criadoEm: new Date(this.agora()).toISOString(), tentativas: 0, vinculo: impressaoDaChave(chave) });
    if (this.fila.length > MAX_FILA) {
      // nunca descarta socorro nem mensagens: tira o item mais antigo que não seja um deles
      const i = this.fila.findIndex((it) => it.acao.action !== 'help.create' && it.acao.action !== 'message.send');
      this.fila.splice(i >= 0 ? i : 0, 1);
    }
    await this.persistirFila();
  }

  private async carregarFila(): Promise<void> {
    if (this.filaCarregada) return;
    this.filaCarregada = true;
    const salva = await cofre.lerJson<ItemDaFila[]>(CHAVES.filaDeEnvio);
    if (Array.isArray(salva)) this.fila = [...salva, ...this.fila];
  }

  private async persistirFila(): Promise<void> {
    if (this.fila.length) await cofre.gravarJson(CHAVES.filaDeEnvio, this.fila);
    else await cofre.remover(CHAVES.filaDeEnvio);
  }

  /** Só para testes. */
  _fila(): readonly ItemDaFila[] {
    return this.fila;
  }
}
