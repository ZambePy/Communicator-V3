/**
 * Tocar uma mensagem guardada — a voz da própria pessoa.
 *
 * Pelo MESMO canal de áudio da voz clonada (`tocarWav`): uma frase nova, de
 * qualquer tela, interrompe a mensagem que estava tocando, e a mensagem
 * interrompe a frase anterior — nunca duas vozes ao mesmo tempo.
 *
 * Se a gravação não abrir (arquivo apagado por fora, disco ocupado), a frase
 * sai na voz do computador e a tela diz isso. Ficar mudo no lugar de uma
 * mensagem é o pior resultado para quem só tem esse jeito de falar.
 */

import type { GravacaoGuardada } from '@tracker/voz/vozGuardada';
import { falar, pararFala } from '../index';
import { comAFalaDoPacienteMarcada } from '../falaEmCurso';
import { tocarWav } from '../local';
import { armazemDaVozGuardada, type ArmazemDaVozGuardada } from './armazem';

export type ResultadoDoToque =
  | { como: 'gravacao' }
  | { como: 'voz_do_computador'; motivo: string }
  | { como: 'nada'; motivo: string };

let turno = 0;

/**
 * Toca a mensagem guardada. Do instante da chamada até o fim — a leitura da
 * gravação no disco e a volta para a voz do computador inclusive —, vale a
 * marca de "o paciente está falando" (`../falaEmCurso`): a varredura falada do
 * Plano B (rodada 3, 21/10/2026) não anuncia um botão por cima da voz dele.
 */
export function tocarMensagemGuardada(
  g: Pick<GravacaoGuardada, 'id' | 'texto'>,
  armazem: ArmazemDaVozGuardada = armazemDaVozGuardada(),
): Promise<ResultadoDoToque> {
  return comAFalaDoPacienteMarcada(() => tocarDeVerdade(g, armazem));
}

async function tocarDeVerdade(
  g: Pick<GravacaoGuardada, 'id' | 'texto'>,
  armazem: ArmazemDaVozGuardada,
): Promise<ResultadoDoToque> {
  const meu = ++turno;
  pararFala();
  const lida = await armazem.ler(g.id);
  // Outra mensagem foi escolhida enquanto esta abria: a última vence.
  if (meu !== turno) return { como: 'nada', motivo: 'substituida' };
  let motivo = lida.ok ? '' : lida.erro;
  if (lida.ok) {
    try {
      await tocarWav(lida.wav);
      return { como: 'gravacao' };
    } catch (e) {
      console.warn('[voz-guardada] a gravação não tocou; falando com a voz do computador:', e);
      motivo = 'a gravação não tocou';
    }
  } else {
    console.warn('[voz-guardada] gravação indisponível; falando com a voz do computador:', lida.erro);
  }
  if (meu !== turno) return { como: 'nada', motivo: 'substituida' };
  try {
    const r = await falar(g.texto, { rate: 0.9 });
    return r.origem === 'nenhuma' ? { como: 'nada', motivo: r.motivo ?? motivo } : { como: 'voz_do_computador', motivo };
  } catch (e) {
    console.warn('[voz-guardada] nem a voz do computador saiu:', e);
    return { como: 'nada', motivo };
  }
}

/** Interrompe o que estiver tocando (mensagem, voz clonada ou do sistema). */
export function pararMensagem(): void {
  turno++;
  pararFala();
}
