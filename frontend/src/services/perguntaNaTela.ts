/**
 * Há uma pergunta do cuidador à vista? (revisão de 21/10/2026, Minor 3)
 *
 * A pergunta abre POR CIMA da tela. O olhar não chega às telas de baixo (a
 * sobreposição as cobre), mas a piscada do Sim · Não não olha para o que está
 * na tela: uma piscada longa sob a pergunta respondia um "Sim" solto no
 * Sim · Não de baixo. `PerguntaDoCuidador` liga este sinal enquanto está
 * visível, e quem reage a gestos sem alvo (a piscada) pausa enquanto ele vale.
 *
 * Um valor de módulo, como o `estadoDeEmergencia`: quem lê está num callback
 * de 30 Hz que não deve re-renderizar nada para ler um bit.
 */

let naTela = false;

export function definirPerguntaNaTela(v: boolean): void {
  naTela = v;
}

export function perguntaNaTela(): boolean {
  return naTela;
}
