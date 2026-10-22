import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MoveHorizontal } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

const botao = (ligado: boolean): React.CSSProperties => ({
  padding: '0.9rem 1.25rem',
  borderRadius: '1rem',
  border: '2px solid var(--color-card-border)',
  background: ligado ? 'var(--color-primary)' : 'var(--color-card-bg)',
  color: ligado ? 'white' : 'var(--color-text-base)',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '1rem',
});

/**
 * Configurações → modo só horizontal (pedido de 21/10/2026). Tela do cuidador
 * (mouse e teclado): liga o modo e abre as telas laterais.
 */
export const ModoHorizontalSection: React.FC<{ estiloDoCartao: React.CSSProperties }> = ({ estiloDoCartao }) => {
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();
  const ligado = settings.modoHorizontal === true;

  return (
    <section aria-labelledby="modo-horizontal-title" style={estiloDoCartao}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <MoveHorizontal size={28} color="var(--color-primary)" aria-hidden="true" />
        <h2 id="modo-horizontal-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
          Modo só horizontal
        </h2>
      </div>
      <p style={{ margin: '0 0 0.75rem 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Na ELA, muitas pessoas perdem primeiro o olhar para cima e para baixo, e continuam olhando para os lados.
        Com este modo ligado, a tela <strong>Sim · Não</strong> e o <strong>teclado lateral</strong> respondem só ao
        olhar para a esquerda ou para a direita, e a Emergência vira uma faixa vermelha na borda direita da tela,
        da altura toda.
      </p>
      <p style={{ margin: '0 0 1.25rem 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        A pergunta de sim ou não que o cuidador manda pelo app aparece grande, com o NÃO à esquerda e o SIM à
        direita, com o modo ligado ou não.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label="Modo só horizontal"
          onClick={() => updateSettings({ modoHorizontal: !ligado })}
          style={botao(ligado)}
        >
          {ligado ? 'Modo só horizontal: ligado' : 'Modo só horizontal: desligado'}
        </button>
        <button type="button" onClick={() => navigate('/teclado-lateral')} style={botao(false)}>
          Abrir o teclado lateral
        </button>
        <button type="button" onClick={() => navigate('/sim-nao')} style={botao(false)}>
          Abrir a tela Sim · Não
        </button>
      </div>
    </section>
  );
};
