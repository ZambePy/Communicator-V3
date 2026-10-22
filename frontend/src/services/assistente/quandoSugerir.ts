/**
 * Quando uma sugestão de resposta pode aparecer.
 *
 * A regra do roadmap (item 1, rodada 3) é curta e não tem exceção: "sugestão
 * nunca aparece em emergência nem em dor". Escrita aqui uma vez, e consultada
 * pela própria faixa — e não só pela tela que a desenha —, para que quem
 * reaproveitar a faixa em outra tela não precise lembrar da regra.
 *
 * A dor tem dois lados: a TELA da dor (rota, aqui) e a PERGUNTA de dor, que
 * é decidida no motor — `sugerirRespostas` (`src/assistente/respostas.ts`)
 * devolve lista vazia para qualquer pergunta com palavra de dor, e a faixa
 * vazia não é desenhada (decisão de 21/10/2026, rodada de correção 1 da Task 7).
 */

/**
 * Prefixos de rota sem sugestão. A dor e a emergência são os dois casos da
 * regra; a calibração entra porque ninguém responde ao cuidador ali (o olhar
 * está sendo medido e qualquer coisa nova na tela atrapalha a coleta).
 */
export const ROTAS_SEM_SUGESTAO: readonly string[] = ['/dor', '/emergency', '/calibration-check', '/calibration'];

export function rotaPermiteSugestao(caminho: string): boolean {
  const limpo = caminho.length > 1 && caminho.endsWith('/') ? caminho.slice(0, -1) : caminho;
  return !ROTAS_SEM_SUGESTAO.some((rota) => limpo === rota || limpo.startsWith(rota + '/'));
}

/**
 * Tipos de mensagem do cuidador que não ganham faixa: o Sim/Não tem a tela
 * própria da Task 5, e as mensagens do sistema vêm do servidor, não de uma
 * pessoa esperando resposta.
 */
export function kindPermiteSugestao(kind: string | undefined): boolean {
  return kind !== 'simnao' && kind !== 'sistema';
}

export function sugestoesPermitidas({
  pathname,
  emergencia,
  kind,
}: {
  pathname: string;
  /** Há uma emergência em curso (`emergenciaAtiva()`). */
  emergencia: boolean;
  kind?: string;
}): boolean {
  if (emergencia) return false;
  return rotaPermiteSugestao(pathname) && kindPermiteSugestao(kind);
}
