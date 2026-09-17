import React, { useEffect, useState } from 'react';

/**
 * Reajuste rápido: um alvo no CENTRO da tela, por 2 segundos.
 *
 * É o "alvo único" que substitui os nove pontos quando o que saiu do lugar foi
 * a GEOMETRIA, não o modelo: a pessoa sentou mais perto, escorregou na cadeira,
 * apoiou a cabeça de outro jeito. Durante estes 2 s o engine acumula os quadros
 * válidos e, ao fim, adota a mediana da distância câmera→rosto como nova base
 * da correção aditiva e recomeça as referências de pose e de centro.
 *
 * O Ridge NÃO é retreinado. O mapeamento íris→tela continua exatamente o mesmo;
 * só muda o "zero" contra o qual as compensações medem. É por isso que isto
 * cabe em 2 segundos e os nove pontos não — e é por isso que ele aparece como
 * botão num aviso, e não como uma tela à parte que interrompe a conversa.
 *
 * Deliberadamente sem botão de cancelar: 2 s é menos tempo do que levaria para
 * encontrar o botão com o olhar, e um cancelamento no meio produziria uma
 * coleta parcial — que é pior que nenhuma.
 */

/** Duração padrão do reajuste, em ms. A mesma que o engine acumula. */
export const DURACAO_DO_REAJUSTE_MS = 2000;

export interface Props {
  /** Duração da coleta que está acontecendo no engine, só para animar o anel. */
  duracaoMs?: number;
}

/**
 * Puramente visual: quem manda na coleta e em quando ela acaba é o engine
 * (`reancorarReferencias`). Este componente só desenha o alvo e o anel que
 * fecha, e some quando o provider o desmonta.
 */
export const ReancoragemOverlay: React.FC<Props> = ({ duracaoMs = DURACAO_DO_REAJUSTE_MS }) => {
  const [restanteMs, setRestanteMs] = useState(duracaoMs);

  useEffect(() => {
    const inicio = Date.now();
    const id = setInterval(() => {
      setRestanteMs(Math.max(0, duracaoMs - (Date.now() - inicio)));
    }, 60);
    return () => clearInterval(id);
  }, [duracaoMs]);

  const progresso = duracaoMs > 0 ? 1 - restanteMs / duracaoMs : 1;
  const raio = 46;
  const circunferencia = 2 * Math.PI * raio;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reajuste rápido: olhe o ponto no centro da tela"
      data-testid="reancoragem-overlay"
      data-no-dwell="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000001,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2.2rem',
        // Sem `pointerEvents: none`: durante a coleta nada mais na tela deve
        // receber clique ou dwell — um clique acidental aqui viraria uma ação
        // na tela de baixo, que a pessoa nem está vendo.
      }}
    >
      <svg width={120} height={120} viewBox="0 0 120 120" aria-hidden="true">
        <circle cx={60} cy={60} r={raio} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={6} />
        <circle
          cx={60}
          cy={60}
          r={raio}
          fill="none"
          stroke="#4da3ff"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - progresso)}
          transform="rotate(-90 60 60)"
        />
        <circle cx={60} cy={60} r={13} fill="#4da3ff" />
      </svg>
      <p
        style={{
          color: '#e8eefc',
          fontSize: '1.35rem',
          margin: 0,
          textAlign: 'center',
          maxWidth: '26ch',
          lineHeight: 1.4,
        }}
      >
        Olhe o ponto azul até ele fechar.
      </p>
    </div>
  );
};
