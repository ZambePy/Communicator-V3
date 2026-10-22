import { useCallback, useEffect, useRef } from 'react';
import { registrarDigitacao } from './registroDeUso';

/**
 * Rede de segurança: quanto o texto pode crescer de uma vez, SEM aviso, para
 * ainda ser DIGITAÇÃO (uma letra, um espaço, uma palavra sugerida que entra
 * inteira). Um salto maior que isto, que ninguém marcou, é texto que veio de
 * outro lugar, e contá-lo faria a velocidade subir sem a pessoa ter escrito
 * mais depressa.
 *
 * Este teto NÃO é o critério da frase pronta. Era, e foi o erro apontado na
 * revisão de 21/10/2026: as frases curtas ("Preciso de ajuda", "Quero água",
 * as que o assistente mais oferece) cabem no teto e entravam como digitação —
 * um toque, 17 caracteres, e a velocidade de quem mal escreveu disparava. A
 * frase pronta é excluída pelo JEITO como entra: a tela avisa o medidor antes
 * (a função que o hook devolve), seja qual for o tamanho.
 */
export const MAX_CARACTERES_POR_SELECAO = 24;

const INTERVALO_DO_AVISO_MS = 60_000;
let ultimoAviso = -Infinity;
function avisarNoConsole(erro: unknown): void {
  const agora = Date.now();
  if (agora - ultimoAviso < INTERVALO_DO_AVISO_MS) return;
  ultimoAviso = agora;
  console.warn('[uso] não foi possível contar a digitação na evolução', erro);
}

/**
 * Mede a digitação do teclado do olhar (21/10/2026) olhando para o texto: cada
 * AUMENTO dele é uma seleção — uma letra, um espaço, uma palavra sugerida. Não
 * entram: apagar e limpar (são "desfazer", contados pelo ouvinte de cliques,
 * `RegistroDeUso`), o texto com que a tela abre (o rascunho da sessão) e a
 * FRASE PRONTA, que o paciente escolheu inteira em um toque.
 *
 * Devolve uma função estável: quem vai inserir uma frase pronta a chama com o
 * texto que passará a valer, ANTES de mudá-lo. A marca vale só para aquele
 * texto e uma vez: se ele não chegar a entrar (já era o atual) ou se entrar
 * outro, a marca cai e o que vier depois é medido como sempre. Olhar o texto, em
 * vez de ligar a contagem em cada tecla, mantém a tela intacta: uma tecla nova
 * passa a ser medida sem ninguém lembrar de ligar nada — e só o que NÃO é
 * digitação precisa de aviso.
 */
export function useMedidorDeDigitacao(texto: string): (textoPronto: string) => void {
  const anterior = useRef(texto);
  const pronto = useRef<string | null>(null);

  useEffect(() => {
    const avanco = texto.length - anterior.current.length;
    anterior.current = texto;
    const marcado = pronto.current;
    pronto.current = null;
    if (marcado !== null && marcado === texto) return;
    if (avanco < 1 || avanco > MAX_CARACTERES_POR_SELECAO) return;
    try {
      registrarDigitacao(avanco, Date.now());
    } catch (e) {
      avisarNoConsole(e);
    }
  }, [texto]);

  return useCallback((textoPronto: string) => {
    pronto.current = textoPronto;
  }, []);
}
