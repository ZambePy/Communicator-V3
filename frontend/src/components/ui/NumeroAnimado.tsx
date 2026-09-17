import React, { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

/**
 * Um número que CHEGA no valor, em vez de já estar nele.
 *
 * O erro de calibração e a deriva são a resposta de uma medida que acabou de
 * acontecer. Trocados secos, eles parecem ter estado ali o tempo todo;
 * contando até o valor, eles se leem como resultado.
 *
 * ── Por que sem `setState` ──────────────────────────────────────────────────
 *
 * A contagem escreve DIRETO no nó, dentro do `requestAnimationFrame`. Um
 * `setState` por quadro reconciliaria a árvore 60×/s durante meio segundo — e
 * meio segundo de reconciliação é meio segundo disputando quadro com o cursor
 * do olhar, que é a única coisa nestas telas que não pode engasgar.
 *
 * ── Por que `formatar` e não só o número ────────────────────────────────────
 *
 * A frase inteira sai de um único nó de texto. Quebrar "Erro médio: 123 px" em
 * `<span>Erro médio: </span><span>123</span><span> px</span>` exigiria
 * fatiar a chave de tradução em três — e uma frase fatiada não sobrevive ao
 * primeiro idioma que põe o número em outro lugar. Aqui o `formatar` recebe o
 * valor corrente e devolve a frase pronta, com o `t()` do chamador dentro.
 */
export interface NumeroAnimadoProps {
  /** Valor final. */
  valor: number;
  /** Casas decimais do formato padrão. Ignorado quando `formatar` é passado. */
  casas?: number;
  /** Duração da contagem. */
  duracaoMs?: number;
  /** Texto a exibir para um valor intermediário. Por padrão, só o número. */
  formatar?: (valor: number) => string;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
}

const DURACAO_PADRAO_MS = 600;

/** Desacelera no fim: o número assenta no valor em vez de bater nele. */
function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** A preferência do sistema por menos movimento. */
function prefereMenosMovimento(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const NumeroAnimado: React.FC<NumeroAnimadoProps> = ({
  valor,
  casas = 0,
  duracaoMs = DURACAO_PADRAO_MS,
  formatar,
  className,
  style,
  'data-testid': testId,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  /** De onde a contagem parte — o último valor efetivamente mostrado. */
  const valorAnteriorRef = useRef(0);
  /** Lido de dentro do rAF: refazer a animação a cada render seria pior. */
  const formatarRef = useRef(formatar);
  formatarRef.current = formatar;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const texto = (n: number) => formatarRef.current?.(n) ?? n.toFixed(casas);
    const de = valorAnteriorRef.current;
    valorAnteriorRef.current = valor;

    // Sem `requestAnimationFrame` (ambiente sem janela) ou com menos movimento
    // pedido: o valor final, direto. A informação é a mesma; só a chegada muda.
    if (de === valor || prefereMenosMovimento() || typeof requestAnimationFrame !== 'function') {
      el.textContent = texto(valor);
      return;
    }

    const inicio = performance.now();
    let quadro = requestAnimationFrame(function passo(agora: number) {
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      el.textContent = texto(de + (valor - de) * suavizar(t));
      if (t < 1) quadro = requestAnimationFrame(passo);
    });
    return () => cancelAnimationFrame(quadro);
  }, [valor, casas, duracaoMs]);

  return (
    // O valor final também vai no HTML inicial: quem lê por leitor de tela, ou
    // quem consulta a árvore antes do primeiro quadro, recebe o número certo.
    <span ref={ref} className={className} style={style} data-testid={testId}>
      {formatar?.(valor) ?? valor.toFixed(casas)}
    </span>
  );
};
