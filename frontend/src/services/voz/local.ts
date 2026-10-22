/**
 * Voz CLONADA local: pede o WAV ao processo principal (que fala com o motor
 * Python) e toca com Web Audio.
 *
 * O renderer nunca vê o modelo nem o áudio de referência — só o WAV da frase
 * pedida. Tocar com `AudioContext` em vez de `<audio src=blob:>` evita criar
 * URLs de blob que ficariam vivas até o `revokeObjectURL`, e dá um `stop()`
 * imediato quando o paciente manda outra frase no meio da anterior.
 */

import type {
  EstadoDoMotorDeVoz, MotivoSemVoz, OpcoesDeSintese, ResultadoDaImportacao, ResultadoDaRemocaoDoPerfil, ResultadoDaSintese,
} from '@tracker/voz/protocolo';
import { definirSaidaDaVoz, esperaDaTrocaDeSaida, registrarAlvoDaVoz, saidaDaVozEscolhida } from './saida';

export interface PonteDaVoz {
  estado: () => Promise<EstadoDoMotorDeVoz>;
  onEstado: (cb: (e: EstadoDoMotorDeVoz) => void) => () => void;
  importar: (consentimento: { texto: string; aceitoEm: string; perfilId: string | null }) => Promise<ResultadoDaImportacao>;
  remover: () => Promise<void>;
  /**
   * Remover o paciente (N1, 21/10/2026): o processo principal apaga a voz clonada importada SÓ se o
   * termo dela for deste perfil. Opcional porque um preload antigo não o tem (ver `removerVozClonadaDoPerfil`).
   */
  removerDoPerfil?: (perfilId: string) => Promise<ResultadoDaRemocaoDoPerfil>;
  baixarModelo: () => Promise<{ ok: boolean; erro?: string }>;
  sintetizar: (texto: string, opcoes?: OpcoesDeSintese) => Promise<ResultadoDaSintese>;
  sondar: () => Promise<EstadoDoMotorDeVoz>;
  ativar: (ligado: boolean) => Promise<void>;
}

/** `null` fora do Electron. */
export function ponteDaVoz(w: Window | undefined = typeof window === 'undefined' ? undefined : window): PonteDaVoz | null {
  if (!w) return null;
  return (w as unknown as { irisflowVoz?: PonteDaVoz }).irisflowVoz ?? null;
}

let contexto: AudioContext | null = null;
let tocando: AudioBufferSourceNode | null = null;
/** Resolve a promessa da fala em curso quando ela é interrompida. */
let encerrarTocando: (() => void) | null = null;
/**
 * Geração da voz clonada: sobe a cada `pararVozClonada()`.
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 14): o
 * `pararVozClonada()` de uma fala nova rodava ANTES de a anterior terminar de
 * decodificar. Sem nada em `tocando` para parar, a frase anterior chegava ao
 * `start()` depois — e as duas tocavam por cima uma da outra. Uma frase que
 * termina de decodificar numa geração que já passou não toca.
 */
let geracao = 0;

function contextoDeAudio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!contexto) {
    contexto = new AudioContext();
    // A voz clonada e a voz guardada tocam por este contexto, e é nele que vale
    // a saída escolhida para as chamadas (o cabo de áudio virtual): ele já
    // nasce seguindo o ajuste. Na saída padrão isto não faz nada.
    registrarAlvoDaVoz(contexto);
  }
  return contexto;
}

/**
 * Põe em vigor o ajuste "saída da voz" (`null` = a saída padrão). Chamado ao
 * abrir o app e a cada mudança do ajuste — nunca no caminho da fala, para a
 * troca de aparelho (alguns milissegundos) terminar bem antes da primeira
 * frase. Com uma saída escolhida, o contexto é criado já aqui, pelo mesmo
 * motivo. Nunca lança.
 */
export function usarSaidaDaVoz(id: string | null): void {
  definirSaidaDaVoz(id);
  if (saidaDaVozEscolhida() === null) return;
  try {
    contextoDeAudio();
  } catch (e) {
    // Sem contexto agora; a primeira fala tenta de novo e, se também falhar,
    // o próprio `falar()` cai para a voz do sistema.
    console.warn('[voz] não consegui preparar o áudio da voz para a saída escolhida:', e);
  }
}

export function pararVozClonada(): void {
  geracao++;
  const fim = encerrarTocando;
  encerrarTocando = null;
  if (tocando) {
    try {
      tocando.onended = null;
      tocando.stop();
    } catch { /* já parou */ }
    tocando = null;
  }
  // Quem estava esperando a fala terminar não pode ficar pendurado: uma
  // interrupção é um fim como outro qualquer para o chamador.
  fim?.();
}

/**
 * Toca um WAV (ArrayBuffer) e resolve quando termina.
 *
 * Resolve `true` quando o áudio chegou a tocar (até o fim, ou até ser
 * interrompido no meio) e `false` quando foi parado ou substituído ANTES de
 * começar — durante a decodificação. Quem precisa dizer "falou" (as telas do
 * paciente) só pode dizer isso com `true`.
 *
 * `aoComecar` é chamado no instante em que o som sai (depois do `start()`).
 */
export function tocarWav(wav: ArrayBuffer, aoComecar?: () => void): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const ctx = contextoDeAudio();
    if (!ctx) { reject(new Error('Web Audio indisponível.')); return; }
    pararVozClonada();
    const minhaGeracao = geracao;
    let comecou = false;
    let encerrada = false;
    const terminar = () => {
      if (encerrada) return;
      encerrada = true;
      if (encerrarTocando === terminar) encerrarTocando = null;
      resolve(comecou);
    };
    // Já durante a decodificação: um `pararVozClonada()` agora encerra ESTA
    // fala (sem tocar), em vez de deixá-la pendurada até o `decode` acabar.
    encerrarTocando = terminar;
    const iniciar = (buffer: AudioBuffer) => {
      const fonte = ctx.createBufferSource();
      fonte.buffer = buffer;
      fonte.connect(ctx.destination);
      fonte.onended = () => {
        if (tocando === fonte) tocando = null;
        terminar();
      };
      fonte.start();
      tocando = fonte;
      comecou = true;
      try { aoComecar?.(); } catch (e) { console.warn('[voz] aoComecar lançou:', e); }
    };
    const retomar = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    void retomar
      .then(() => ctx.decodeAudioData(wav.slice(0)))
      .then((buffer) => {
        if (encerrada || geracao !== minhaGeracao) {
          terminar();
          return;
        }
        // Latência: sem troca de saída em andamento (o caminho comum) a fala
        // parte aqui mesmo, na mesma microtarefa de sempre. Só a primeira fala
        // depois de abrir o app ou de trocar o ajuste pode pegar a troca no
        // meio — e então espera por ela (com teto), para a primeira frase de
        // uma chamada não sair pelo alto-falante da sala em vez de ir ao cabo.
        const espera = esperaDaTrocaDeSaida();
        if (espera === null) {
          iniciar(buffer);
          return;
        }
        return espera.then(() => {
          if (encerrada || geracao !== minhaGeracao) {
            terminar();
            return;
          }
          iniciar(buffer);
        });
      })
      .catch((e) => {
        if (encerrarTocando === terminar) encerrarTocando = null;
        if (encerrada) return;
        encerrada = true;
        reject(e);
      });
  });
}

export type FalaClonada =
  | { ok: true; deCache: boolean; ms: number }
  | { ok: false; motivo: MotivoSemVoz; erro?: string };

/** Sintetiza e toca. Não cai para a voz do sistema: quem decide isso é `index.ts`. */
export async function falarComVozClonada(texto: string, ponte: PonteDaVoz | null = ponteDaVoz()): Promise<FalaClonada> {
  if (!ponte) return { ok: false, motivo: 'indisponivel' };
  try {
    const r = await ponte.sintetizar(texto);
    if (!r.ok) return { ok: false, motivo: r.motivo, erro: r.erro };
    const tocou = await tocarWav(r.wav);
    if (!tocou) return { ok: false, motivo: 'motor', erro: 'A fala foi interrompida antes de começar.' };
    return { ok: true, deCache: r.deCache, ms: r.ms };
  } catch (e) {
    return { ok: false, motivo: 'motor', erro: e instanceof Error ? e.message : String(e) };
  }
}
