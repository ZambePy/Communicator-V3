/**
 * Gravar do microfone para a voz guardada.
 *
 * `MediaRecorder` grava; o `AudioContext` compartilhado do app decodifica o
 * resultado em amostras (para a checagem de qualidade e o WAV) e mede o nível
 * ao vivo, para a pessoa VER que o microfone está ouvindo enquanto fala.
 *
 * Sem cancelamento de eco, supressão de ruído nem ganho automático: esses
 * filtros deformam a voz (é ela que se quer guardar, e é ela que a voz do
 * computador vai imitar). Se o som sair baixo ou com ruído, a checagem diz, em
 * palavras, o que fazer.
 */

import { getSharedAudioContext } from '../../../utils/emergencyAudio';
import { paraMono } from './wav';

export type FalhaDoMicrofone = 'sem_suporte' | 'negado' | 'sem_microfone' | 'ocupado' | 'outro';

export const MENSAGEM_DA_FALHA: Readonly<Record<FalhaDoMicrofone, string>> = {
  sem_suporte: 'Este computador não deixa gravar áudio por aqui.',
  negado: 'O microfone está bloqueado para o IrisFlow. Libere o microfone nas configurações do sistema e tente de novo.',
  sem_microfone: 'Não encontrei nenhum microfone. Ligue um microfone e tente de novo.',
  ocupado: 'O microfone está sendo usado por outro programa. Feche o outro programa e tente de novo.',
  outro: 'Não consegui abrir o microfone agora. Tente de novo em instantes.',
};

export const RESTRICOES_DO_MICROFONE: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  video: false,
};

export function motivoDaFalha(e: unknown): FalhaDoMicrofone {
  const nome = (e as { name?: string } | null)?.name ?? '';
  if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'negado';
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'sem_microfone';
  if (nome === 'NotReadableError' || nome === 'AbortError') return 'ocupado';
  return 'outro';
}

export async function abrirMicrofone(
  md: Pick<MediaDevices, 'getUserMedia'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
): Promise<{ ok: true; stream: MediaStream } | { ok: false; motivo: FalhaDoMicrofone }> {
  if (!md?.getUserMedia || typeof MediaRecorder === 'undefined') return { ok: false, motivo: 'sem_suporte' };
  try {
    return { ok: true, stream: await md.getUserMedia(RESTRICOES_DO_MICROFONE) };
  } catch (e) {
    console.warn('[voz-guardada] microfone indisponível:', e);
    return { ok: false, motivo: motivoDaFalha(e) };
  }
}

export function fecharMicrofone(stream: MediaStream | null): void {
  for (const t of stream?.getTracks() ?? []) {
    try { t.stop(); } catch { /* já parado */ }
  }
}

export interface AudioGravado {
  amostras: Float32Array;
  taxa: number;
}

export interface GravacaoEmCurso {
  /** Para e entrega as amostras; `null` se a gravação não pôde ser lida. */
  parar: () => Promise<AudioGravado | null>;
  /** Descarta sem ler nada. */
  cancelar: () => void;
}

function tipoSuportado(): string | undefined {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return candidatos.find((t) => MediaRecorder.isTypeSupported(t));
}

export function iniciarGravacao(
  stream: MediaStream,
  opcoes: { maxMs: number; aoNivel?: (rms: number) => void; aoLimite?: () => void },
): GravacaoEmCurso {
  const tipo = tipoSuportado();
  const gravador = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
  const pedacos: Blob[] = [];
  gravador.ondataavailable = (e) => { if (e.data && e.data.size > 0) pedacos.push(e.data); };

  // Nível ao vivo: só o que a barra precisa, a ~15 quadros por segundo.
  const ctx = getSharedAudioContext();
  let fonte: MediaStreamAudioSourceNode | null = null;
  let analisador: AnalyserNode | null = null;
  let quadro: number | null = null;
  let ultimoNivel = 0;
  if (ctx && opcoes.aoNivel) {
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      fonte = ctx.createMediaStreamSource(stream);
      analisador = ctx.createAnalyser();
      analisador.fftSize = 1024;
      fonte.connect(analisador);
      const buffer = new Float32Array(analisador.fftSize);
      const medir = (agora: number) => {
        if (!analisador) return;
        if (agora - ultimoNivel > 66) {
          ultimoNivel = agora;
          analisador.getFloatTimeDomainData(buffer);
          let soma = 0;
          for (let i = 0; i < buffer.length; i++) soma += buffer[i] * buffer[i];
          opcoes.aoNivel?.(Math.sqrt(soma / buffer.length));
        }
        quadro = requestAnimationFrame(medir);
      };
      quadro = requestAnimationFrame(medir);
    } catch (e) {
      // Sem medidor a gravação continua: a checagem no fim diz como ficou.
      console.warn('[voz-guardada] medidor de nível indisponível:', e);
    }
  }

  const limite = setTimeout(() => opcoes.aoLimite?.(), opcoes.maxMs);
  const desligarMedidor = () => {
    clearTimeout(limite);
    if (quadro !== null) cancelAnimationFrame(quadro);
    quadro = null;
    try { fonte?.disconnect(); } catch { /* já solto */ }
    fonte = null;
    analisador = null;
  };

  gravador.start(250);

  return {
    parar: () =>
      new Promise<AudioGravado | null>((resolve) => {
        desligarMedidor();
        const terminar = async () => {
          try {
            const blob = new Blob(pedacos, { type: gravador.mimeType || tipo || 'audio/webm' });
            const contexto = getSharedAudioContext();
            if (!contexto || blob.size === 0) { resolve(null); return; }
            const audio = await contexto.decodeAudioData(await blob.arrayBuffer());
            const canais = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
            resolve({ amostras: paraMono(canais), taxa: audio.sampleRate });
          } catch (e) {
            console.warn('[voz-guardada] não foi possível ler a gravação:', e);
            resolve(null);
          }
        };
        if (gravador.state === 'inactive') { void terminar(); return; }
        gravador.onstop = () => { void terminar(); };
        try { gravador.stop(); } catch { void terminar(); }
      }),
    cancelar: () => {
      desligarMedidor();
      gravador.ondataavailable = null;
      gravador.onstop = null;
      try { if (gravador.state !== 'inactive') gravador.stop(); } catch { /* já parou */ }
    },
  };
}
