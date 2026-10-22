/**
 * Um sinal global, minúsculo: há uma emergência em curso?
 *
 * Existe porque o dispatcher de dwell (`GazeContext`) precisa saber disso e não
 * pode consumir o `EmergencyContext` — o provedor de olhar está ACIMA do de
 * emergência na árvore, e inverter a ordem criaria a dependência circular que a
 * arquitetura evita de propósito.
 *
 * O primeiro consumidor foi a correção por dwell (sprint S3), que não pode
 * aprender durante um alarme: é o momento em que o paciente olha para
 * qualquer coisa menos para o botão que acabou de acionar, e é o momento em que
 * um erro custa mais caro. Desde 20/10/2026 também a varredura do acionador
 * (segurar não escolhe nada com o socorro em curso) e a calibração (a
 * contagem aberta interrompe a coleta) leem as fontes uma a uma.
 *
 * Um conjunto de FONTES, e não um booleano só (19/10/2026): a contagem
 * regressiva, a tela de emergência e o pedido em andamento
 * (`services/emergencia/pedidoDeSocorro.ts`) ligam e desligam o sinal cada um
 * no seu tempo. Com um booleano, a contagem terminando (`false`) apagava o
 * sinal que o pedido acabara de acender. A emergência está ativa enquanto
 * qualquer fonte estiver ligada.
 *
 * Um valor de módulo, e não um `Context`, porque o consumidor está dentro de
 * um callback de 30 Hz que não deve re-renderizar nada para ler um bit.
 */

export type FonteDaEmergencia = 'confirmacao' | 'tela' | 'pedido';

const ativas = new Set<FonteDaEmergencia>();
const ouvintes = new Set<() => void>();

function avisarOuvintes(): void {
  for (const o of ouvintes) {
    try {
      o();
    } catch (e) {
      // Um ouvinte com defeito não pode impedir os outros de saberem da emergência.
      console.warn('[emergencia] ouvinte do estado falhou', e);
    }
  }
}

export function definirEmergenciaAtiva(v: boolean, fonte: FonteDaEmergencia = 'tela'): void {
  const antes = ativas.has(fonte);
  if (v) ativas.add(fonte);
  else ativas.delete(fonte);
  if (antes !== v) avisarOuvintes();
}

export function emergenciaAtiva(): boolean {
  return ativas.size > 0;
}

/**
 * Uma fonte só (revisão de UX de 20/10/2026, achados 1 e 7): a varredura do
 * acionador precisa distinguir o socorro EM CURSO — a contagem aberta
 * (`confirmacao`) ou o pedido em andamento (`pedido`) — da tela de emergência
 * aberta para escolher o tipo (`tela`); e a calibração, a contagem aberta por
 * cima da coleta.
 */
export function emergenciaPorFonte(fonte: FonteDaEmergencia): boolean {
  return ativas.has(fonte);
}

/** Avisa quando alguma fonte liga ou desliga (para `useSyncExternalStore`). */
export function ouvirEstadoDaEmergencia(o: () => void): () => void {
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
  };
}

/** Só para teste: devolve o módulo ao estado inicial. */
export function _reiniciarParaTeste(): void {
  const havia = ativas.size > 0;
  ativas.clear();
  if (havia) avisarOuvintes();
}
