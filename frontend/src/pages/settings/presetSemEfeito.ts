import type { ResultadoDoPreset } from '@tracker/tracker/engine';

/** Como a tela chama cada filtro que pode estar governando o cursor. */
const NOME_DO_FILTRO: Record<Exclude<ResultadoDoPreset['emVigor'], 'oneEuro'>, string> = {
  fixacao: 'o estimador de fixação (M9), ajustado pela calibração',
  kalman: 'o filtro de Kalman',
  kalmanEma: 'o filtro de Kalman com média móvel',
};

/**
 * A nota de "este preset não muda o cursor agora" (auditoria A2, 19/10/2026).
 *
 * Com o estimador de fixação (M9) ou a cadeia Kalman em vigor, o preset fica
 * guardado no One Euro, que está fora do caminho do cursor. Antes a tela
 * marcava o botão como se valesse. `null` quando o preset passou a governar
 * (ou sem engine, quando não há o que dizer).
 */
export function textoDoPresetSemEfeito(r: ResultadoDoPreset | null | undefined): string | null {
  if (!r || r.aplicado || r.emVigor === 'oneEuro') return null;
  return (
    `Agora quem suaviza o cursor é ${NOME_DO_FILTRO[r.emVigor]}: este preset fica guardado ` +
    'e não muda o cursor enquanto ele estiver em uso.'
  );
}
