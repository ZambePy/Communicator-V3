import React, { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Entrada de tela: um fade com deslize curto de 10 px.
 *
 * ── Por que uma classe e não uma `key` ──────────────────────────────────────
 *
 * Trocar a `key` do contêiner reiniciaria a animação de graça, mas também
 * DESMONTARIA e remontaria a rota a cada mudança de `location` — inclusive
 * quando só a query muda. Numa tela que está falando, medindo ou coletando,
 * remontar é perder o estado no meio. A classe é reaplicada à mão e o React
 * não sabe de nada.
 *
 * ── Por que `useLayoutEffect` ───────────────────────────────────────────────
 *
 * Num `useEffect` o navegador já teria pintado a rota nova no estado final
 * antes de a animação reiniciar: um quadro da tela inteira opaca, e só então
 * ela apagaria para reaparecer. O piscar é pior que a ausência da transição.
 *
 * ── O que a animação pode e não pode tocar ──────────────────────────────────
 *
 * Termina em `transform: none` de propósito. Um `transform` diferente de
 * `none` (inclusive `translate3d(0,0,0)`) faz deste nó o bloco de contenção de
 * qualquer `position: fixed` descendente — os botões flutuantes das telas
 * passariam a se ancorar nele em vez de na janela. Assim, isso só vale
 * enquanto a animação roda, e não sobra nada depois.
 *
 * `will-change` está fora pelo mesmo motivo: ele cria o mesmo bloco de
 * contenção e ficaria de pé entre navegações.
 *
 * O botão de emergência, as faixas de aviso e o cursor do olhar ficam FORA
 * deste contêiner (são irmãos das rotas, montados pelos providers), então
 * nenhum deles é afetado nem mesmo durante a animação.
 */
export const TransicaoDeRota: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A classe já está no nó desde o render anterior: removê-la, forçar o
    // reflow e recolocá-la é o que faz o navegador considerar a animação nova.
    el.classList.remove('rota-entrando');
    void el.offsetWidth;
    el.classList.add('rota-entrando');
  }, [pathname]);

  return (
    <div ref={ref} className="rota-entrando" data-testid="container-de-rota">
      {children}
    </div>
  );
};
