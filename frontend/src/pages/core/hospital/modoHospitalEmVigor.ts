/**
 * O modo hospital só vale quando o modo só horizontal está desligado (revisão
 * final, rodada 1, M8, 21/10/2026).
 *
 * A tela do quarto é uma grade de dez alvos acionados pelo ponto do olhar: quem
 * perdeu o olhar vertical não a opera, e o chamado da enfermagem ficava fora de
 * alcance (só a faixa da Emergência funcionava). O modo só horizontal existe para
 * essa pessoa, então com os dois ligados ele vale — e a tela inicial segue o menu
 * de sempre, o mesmo de quem liga só o horizontal. Não se desvia para uma tela
 * lateral: elas voltam para `/menu`, e o cuidador ficaria sem caminho até as
 * Configurações.
 *
 * Uma função só, para a tela inicial, o Voltar do menu e a saída do mapa da dor
 * concordarem: um deles esquecer a regra mandaria a pessoa de volta à grade.
 */
export function modoHospitalEmVigor(ajustes: { modoHospital?: boolean; modoHorizontal?: boolean } | null | undefined): boolean {
  return ajustes?.modoHospital === true && ajustes?.modoHorizontal !== true;
}
