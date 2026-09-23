import React from 'react';
import { Maximize } from 'lucide-react';
import { POR_QUE_TELA_CHEIA, detectarPlataforma, instrucaoDeSaida } from '../services/telaCheia';

/**
 * Nota curta sobre a tela cheia: por que ela existe e como o cuidador sai.
 *
 * Aparece na primeira abertura (boas-vindas), no primeiro passo do tutorial e
 * em Configurações → Sobre. Não é alvo de olhar: é texto para ler, e quem
 * executa a saída é o cuidador, no teclado físico.
 */
export const AvisoDeTelaCheia: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const saida = instrucaoDeSaida(detectarPlataforma());
  return (
    <aside
      aria-label="Tela cheia"
      data-no-dwell="true"
      data-testid="aviso-tela-cheia"
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-start',
        padding: '0.85rem 1.1rem',
        borderRadius: 'var(--radius-md)',
        background: 'var(--tint-info-bg)',
        border: '1px solid var(--tint-info-border)',
        color: 'var(--color-text-base)',
        fontSize: '0.95rem',
        lineHeight: 1.5,
        textAlign: 'left',
        maxWidth: 640,
        ...style,
      }}
    >
      <Maximize size={20} color="var(--color-primary)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>
        {POR_QUE_TELA_CHEIA} <span style={{ opacity: 0.8 }}>{saida.texto}</span>
      </span>
    </aside>
  );
};
