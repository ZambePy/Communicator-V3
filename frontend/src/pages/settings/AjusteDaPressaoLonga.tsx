import React from 'react';
import { Timer } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import {
  limitarPressaoLonga, textoDosSegundos, PRESSAO_LONGA_MAX_MS, PRESSAO_LONGA_MIN_MS,
} from '@tracker/interaction/varreduraPorAcionador';

/** De meio em meio segundo: diferença que o cuidador percebe ao testar. */
const PASSO_DO_AJUSTE_MS = 500;

const botao: React.CSSProperties = {
  padding: '0.9rem 1.25rem',
  borderRadius: '1rem',
  border: '2px solid var(--color-card-border)',
  background: 'var(--color-card-bg)',
  color: 'var(--color-text-base)',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '1rem',
};

/**
 * Configurações → quanto tempo SEGURAR o acionador chama a emergência
 * (revisão de UX de 19/10/2026, item 7: era fixo em 2 s). Quem solta o botão
 * devagar abria a emergência sem querer; quem cansa ao segurar não conseguia
 * chamá-la. Tela do cuidador: mouse e teclado. A faixa (1 a 4 s) está em
 * `limitarPressaoLonga`.
 *
 * Com a contagem aberta ou o alarme tocando, segurar não escolhe nada: o
 * texto dizia que segurar escolhia o CANCELAR, e quem segurava de novo "para
 * garantir" cancelava o próprio socorro (revisão de UX de 20/10/2026, achado 1).
 */
export const AjusteDaPressaoLonga: React.FC<{ estiloDoCartao: React.CSSProperties }> = ({ estiloDoCartao }) => {
  const { settings, updateSettings } = useSettings();
  const ms = limitarPressaoLonga(settings.acionadorPressaoLongaMs);
  const mudar = (delta: number) => updateSettings({ acionadorPressaoLongaMs: limitarPressaoLonga(ms + delta) });

  return (
    <section aria-labelledby="pressao-longa-title" style={estiloDoCartao}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <Timer size={28} color="var(--color-primary)" aria-hidden="true" />
        <h2 id="pressao-longa-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
          Plano B: segurar o acionador para a emergência
        </h2>
      </div>
      <p style={{ margin: '0 0 1.25rem 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Segurar o acionador por este tempo abre a contagem da emergência, que ainda pode ser cancelada. Se a
        emergência abre sem querer porque a pessoa solta o botão devagar, aumente. Se segurar cansa, diminua. Com
        a contagem aberta ou o alarme tocando, segurar não escolhe nada: para cancelar ou parar o alarme, a pessoa
        aperta rápido (solta antes deste tempo).
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-text-base)', fontWeight: 600 }}>Segurar por {textoDosSegundos(ms)}</span>
        <button
          type="button"
          aria-label="Segurar por menos tempo"
          onClick={() => mudar(-PASSO_DO_AJUSTE_MS)}
          disabled={ms <= PRESSAO_LONGA_MIN_MS}
          style={botao}
        >
          − menos tempo
        </button>
        <button
          type="button"
          aria-label="Segurar por mais tempo"
          onClick={() => mudar(PASSO_DO_AJUSTE_MS)}
          disabled={ms >= PRESSAO_LONGA_MAX_MS}
          style={botao}
        >
          + mais tempo
        </button>
      </div>
    </section>
  );
};
