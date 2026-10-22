// Feedback sonoro da emergência.
//
// Um único `AudioContext` de módulo, criado sob demanda e reutilizado. O
// chromium limita ~50 contextos por documento: criar um por bipe fazia
// `new AudioContext()` passar a lançar depois de alguns acionamentos e o som
// da emergência sumir em silêncio pelo resto da sessão. Os osciladores
// continuam sendo criados por bipe — são baratos; o contexto é que é escasso.

let ctxCompartilhado: AudioContext | null = null;

type AudioCtxCtor = typeof AudioContext;

function resolverCtor(): AudioCtxCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.AudioContext ?? w.webkitAudioContext ?? null) as AudioCtxCtor | null;
}

/**
 * Devolve o `AudioContext` compartilhado, criando-o na primeira chamada.
 *
 * `null` quando o WebAudio não existe ou a criação falhou — o chamador
 * simplesmente não toca som. Nunca lança: um bipe que não sai não pode
 * derrubar o fluxo de emergência.
 */
export function getSharedAudioContext(): AudioContext | null {
  if (ctxCompartilhado && ctxCompartilhado.state !== 'closed') return ctxCompartilhado;
  const Ctor = resolverCtor();
  if (!Ctor) return null;
  try {
    ctxCompartilhado = new Ctor();
    return ctxCompartilhado;
  } catch {
    // Autoplay policy, limite de contextos, ou WebAudio indisponível.
    ctxCompartilhado = null;
    return null;
  }
}

/**
 * Toca um tom simples. Sem efeito quando o WebAudio está indisponível.
 *
 * @param freq      frequência em Hz
 * @param atrasoSec quando começar, em segundos a partir de agora
 * @param duracaoSec duração
 * @param volume    ganho inicial (o envelope decai exponencialmente)
 */
export function playTone(freq: number, atrasoSec = 0, duracaoSec = 0.1, volume = 0.2): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  try {
    // O contexto pode estar suspenso pela política de autoplay até o primeiro
    // gesto do usuário. Retomar é barato e idempotente.
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    const inicio = ctx.currentTime + atrasoSec;
    gain.gain.setValueAtTime(volume, inicio);
    gain.gain.exponentialRampToValueAtTime(0.01, inicio + duracaoSec);
    osc.start(inicio);
    osc.stop(inicio + duracaoSec);
    // Solta os nós assim que o som termina. Sem isto eles ficam pendurados no
    // grafo do contexto — que agora vive pela sessão inteira, e não mais por
    // um bipe.
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* já desconectado */
      }
    };
  } catch {
    // Idem: som é feedback, não pode quebrar o acionamento da emergência.
  }
}

/**
 * "Som ao selecionar" (Configurações e Acessibilidade): um toque curto e baixo
 * quando o olhar, a piscada ou o acionador escolhem um botão. O ajuste existia
 * desde a primeira versão e não tocava nada (achado de 19/10/2026).
 */
export function tocarSomDaSelecao(): void {
  playTone(740, 0, 0.07, 0.1);
}

/** Bipe de tick da contagem regressiva. */
export function playTickSound(): void {
  playTone(600, 0, 0.1, 0.2);
}

/** Bipe duplo descendente de cancelamento. */
export function playCancelSound(): void {
  playTone(400, 0, 0.1, 0.15);
  playTone(300, 0.12, 0.1, 0.15);
}

/** Bipe duplo ascendente de confirmação (alerta enviado, ação concluída). */
export function playConfirmSound(): void {
  playTone(520, 0, 0.1, 0.15);
  playTone(780, 0.12, 0.14, 0.15);
}

/**
 * Sirene curta de alarme: dois tons alternados, `ciclos` vezes. Usada pela
 * tela de escalonamento da emergência; reutiliza o mesmo contexto.
 */
export function playAlarmSound(ciclos = 3): void {
  for (let i = 0; i < ciclos; i++) {
    const t = i * 0.5;
    playTone(880, t, 0.22, 0.25);
    playTone(660, t + 0.25, 0.22, 0.25);
  }
}

/** Compressor da sirene, ligado ao contexto compartilhado (um por contexto). */
let compressorDaSirene: DynamicsCompressorNode | null = null;

/**
 * Saída alta e sem distorção para a sirene: um compressor entre a sirene e os
 * alto-falantes. Com ganho perto de 1 a onda quadrada estoura (clipping) e o
 * som fica áspero e mais baixo do que deveria; o compressor segura os picos e
 * deixa o volume médio subir.
 */
function saidaDaSirene(ctx: AudioContext): AudioNode {
  if (compressorDaSirene && compressorDaSirene.context === ctx) return compressorDaSirene;
  try {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -12;
    c.knee.value = 6;
    c.ratio.value = 8;
    c.attack.value = 0.003;
    c.release.value = 0.12;
    c.connect(ctx.destination);
    compressorDaSirene = c;
    return c;
  } catch {
    return ctx.destination;
  }
}

/**
 * Sirene do alarme de emergência (pedido de 18/10/2026: "alarme alto no
 * computador").
 *
 * Antes eram dois bipes senoidais de 0,25 s com ganho 0,35 — audíveis ao lado
 * do computador, não do outro cômodo à noite. Agora é uma varredura de onda
 * quadrada entre 650 e 1450 Hz (sobe e desce duas vezes), a faixa em que o
 * ouvido é mais sensível e que atravessa portas, com ganho 0,7 pelo
 * compressor. O volume do sistema é outra coisa: no Electron, quem o sobe é o
 * processo principal (`electron/alarme.ts`), se o ajuste permitir.
 *
 * Nunca lança, como o resto deste módulo.
 */
export function tocarSirene(duracaoSec = 3): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    const t0 = ctx.currentTime;
    const d = Math.max(0.4, duracaoSec);
    osc.frequency.setValueAtTime(650, t0);
    osc.frequency.linearRampToValueAtTime(1450, t0 + d * 0.25);
    osc.frequency.linearRampToValueAtTime(650, t0 + d * 0.5);
    osc.frequency.linearRampToValueAtTime(1450, t0 + d * 0.75);
    osc.frequency.linearRampToValueAtTime(650, t0 + d);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.7, t0 + 0.02);
    gain.gain.setValueAtTime(0.7, t0 + d - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(gain);
    gain.connect(saidaDaSirene(ctx));
    osc.start(t0);
    osc.stop(t0 + d);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* já desconectado */
      }
    };
  } catch {
    // som é aviso, não pode quebrar o fluxo da emergência
  }
}

/**
 * Fecha o contexto compartilhado.
 *
 * Só faz sentido no teardown da aplicação (ou entre testes). Em uso normal o
 * contexto vive pela sessão inteira — é exatamente isso que corrige o
 * vazamento.
 */
export function disposeSharedAudioContext(): void {
  if (ctxCompartilhado) {
    try {
      void ctxCompartilhado.close();
    } catch {
      /* já fechado */
    }
  }
  ctxCompartilhado = null;
  compressorDaSirene = null;
}
