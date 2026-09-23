/**
 * Política de EXIBIÇÃO do vigia de recalibração.
 *
 * O vigia (`vigiaDeRecalibracao.ts`) responde "precisa ou não" a cada
 * consulta. Mostrar isso ao paciente na primeira resposta positiva seria
 * errado por dois motivos: a BCEA recente é uma mediana de 20 fixações e
 * oscila em torno do limiar quando a pessoa está no limite; e um aviso que
 * volta a cada 15 s depois de "agora não" ensina a pessoa a ignorá-lo — que
 * é o fim de qualquer aviso.
 *
 * Então: só acusa depois de `CONSULTAS_SEGUIDAS` positivas consecutivas, e
 * depois de dispensado dorme por `SONECA_MS`. Pura e sem relógio próprio —
 * quem chama passa `agoraMs` — para o teste não precisar de timers falsos.
 */

import type { MotivoDeRecalibracao, VeredictoDeRecalibracao } from './vigiaDeRecalibracao';

/** Consultas positivas seguidas antes de mostrar o aviso. A 15 s cada, ~30 s. */
export const CONSULTAS_SEGUIDAS = 2;
/** Depois de "agora não", quanto tempo sem acusar de novo. */
export const SONECA_MS = 10 * 60 * 1000;
/** Cadência de consulta ao vigia, em ms. Não é por quadro: a BCEA muda em minutos. */
export const INTERVALO_DE_CONSULTA_MS = 15 * 1000;

export interface EstadoDoAviso {
  seguidas: number;
  /** Instante até o qual o aviso dorme; `null` = acordado. */
  dormindoAteMs: number | null;
  /** O que está sendo mostrado agora. */
  motivoExibido: MotivoDeRecalibracao;
}

export function estadoInicialDoAviso(): EstadoDoAviso {
  return { seguidas: 0, dormindoAteMs: null, motivoExibido: null };
}

/** Uma consulta ao vigia. Devolve o novo estado; `motivoExibido` é o que a UI mostra. */
export function consultar(
  estado: EstadoDoAviso,
  veredicto: VeredictoDeRecalibracao,
  agoraMs: number,
): EstadoDoAviso {
  const dormindo = estado.dormindoAteMs !== null && agoraMs < estado.dormindoAteMs;
  if (!veredicto.precisa) {
    // Voltou ao normal (recalibrou, ou era oscilação): zera tudo, inclusive a
    // soneca — o próximo episódio real merece um aviso novo.
    return { seguidas: 0, dormindoAteMs: dormindo ? estado.dormindoAteMs : null, motivoExibido: null };
  }
  const seguidas = Math.min(CONSULTAS_SEGUIDAS, estado.seguidas + 1);
  if (dormindo) return { ...estado, seguidas, motivoExibido: null };
  return {
    seguidas,
    dormindoAteMs: null,
    motivoExibido: seguidas >= CONSULTAS_SEGUIDAS ? veredicto.motivo : estado.motivoExibido,
  };
}

/** "Agora não": esconde e dorme. */
export function dispensar(estado: EstadoDoAviso, agoraMs: number): EstadoDoAviso {
  return { ...estado, motivoExibido: null, dormindoAteMs: agoraMs + SONECA_MS };
}

/** A pessoa foi recalibrar: some e recomeça do zero. */
export function resolvido(): EstadoDoAviso {
  return estadoInicialDoAviso();
}

/** Texto para o paciente, por motivo. */
export function detalheDoMotivo(motivo: MotivoDeRecalibracao): string {
  switch (motivo) {
    case 'bcea':
      return 'O olhar está tremendo mais do que na última medição: o cursor deve estar oscilando ' +
        'mesmo com você parado. Calibrar de novo (nove pontos) costuma resolver.';
    case 'vies':
      return 'O cursor está caindo sempre para o mesmo lado dos botões, além do que a correção ' +
        'automática consegue compensar. Calibrar de novo (nove pontos) resolve.';
    default:
      return '';
  }
}
