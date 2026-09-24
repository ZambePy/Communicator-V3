import React, { useMemo } from 'react';

/**
 * Partículas à deriva atrás da Home — o mesmo efeito do fundo do site
 * (`AmbientBackground`), só a parte das partículas: mesma quantidade, mesmos
 * tamanhos, trajetórias, durações e cores.
 *
 * Por que isto cabe numa tela de paciente:
 *  - só `transform` e `opacity` animam, e isso o compositor resolve sozinho,
 *    sem passar pela thread principal — onde roda o rastreamento do olhar;
 *  - `pointer-events: none` e `aria-hidden`: o `elementFromPoint` do olhar
 *    atravessa a camada, e o leitor de tela não a anuncia;
 *  - a camada fica ATRÁS do conteúdo (a Home sobe para `z-index: 1`), e os
 *    cartões são quase opacos: o movimento aparece nas margens e nos vãos,
 *    não em cima do alvo que a pessoa está fixando;
 *  - com "reduzir movimento" ligado no sistema não há partícula nenhuma
 *    (aqui na montagem e, se a preferência mudar depois, no CSS).
 */
export const ParticulasDeFundo: React.FC<{ quantidade?: number }> = ({ quantidade = 18 }) => {
  const n = prefereMenosMovimento() ? 0 : quantidade;

  const pontos = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        tamanho: 1.5 + Math.random() * 3.5,
        dx: `${(Math.random() - 0.5) * 120}px`,
        dy: `${-80 - Math.random() * 220}px`,
        duracao: 14 + Math.random() * 20,
        atraso: -Math.random() * 30,
        opacidade: 0.18 + Math.random() * 0.42,
        teal: Math.random() > 0.65,
      })),
    [n]
  );

  return (
    <div className="particulas-de-fundo" aria-hidden="true" data-testid="particulas-de-fundo">
      {pontos.map((p) => (
        <span
          key={p.id}
          className={`particulas-de-fundo__ponto${p.teal ? ' particulas-de-fundo__ponto--teal' : ''}`}
          style={
            {
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.tamanho,
              height: p.tamanho,
              '--p-dx': p.dx,
              '--p-dy': p.dy,
              '--p-opacity': p.opacidade,
              animationDuration: `${p.duracao}s`,
              animationDelay: `${p.atraso}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};

function prefereMenosMovimento(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}
