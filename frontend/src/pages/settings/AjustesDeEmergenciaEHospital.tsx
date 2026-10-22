import React from 'react';
import { AlarmClock, Hospital } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import {
  CONTAGEM_MAX_S, CONTAGEM_MIN_S, CONTAGEM_PADRAO_S, limitarContagemDaEmergencia,
} from '../../services/emergencia/contagemDaEmergencia';

const botao = (ligado = false): React.CSSProperties => ({
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
 * Configurações → a contagem da Emergência e o modo hospital (rodada 3,
 * 21/10/2026). Dois cartões num componente só, para a tela de Configurações
 * ganhar uma linha apenas. Tela do cuidador: mouse e teclado.
 *
 * Contagem (decisão 5): quem tem o olhar muito lento precisa de mais tempo para
 * alcançar o CANCELAR; quem está num quarto de hospital, com a enfermagem a um
 * grito, quer o socorro mais depressa. A faixa (3 a 10 s) está em
 * `limitarContagemDaEmergencia`.
 */
export const AjustesDeEmergenciaEHospital: React.FC<{ estiloDoCartao: React.CSSProperties }> = ({ estiloDoCartao }) => {
  const { settings, updateSettings } = useSettings();
  const contagem = limitarContagemDaEmergencia(settings.contagemDaEmergenciaS);
  const mudar = (delta: number) => updateSettings({ contagemDaEmergenciaS: limitarContagemDaEmergencia(contagem + delta) });

  return (
    <>
      <section aria-labelledby="contagem-emergencia-title" style={estiloDoCartao}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <AlarmClock size={28} color="var(--color-primary)" aria-hidden="true" />
          <h2 id="contagem-emergencia-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
            Contagem da Emergência
          </h2>
        </div>
        <p style={{ margin: '0 0 1.25rem 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Depois que a Emergência é acionada, o pedido de socorro só sai quando esta contagem acaba, e o botão
          CANCELAR desfaz um engano. Vale de {CONTAGEM_MIN_S} a {CONTAGEM_MAX_S} s; o padrão é {CONTAGEM_PADRAO_S} s.
          Aumente se o olhar é lento e o CANCELAR custa a ser alcançado; diminua se o socorro precisa sair mais
          depressa, como num quarto de hospital. Teste com quem vai usar: o CANCELAR precisa dar tempo de ser
          alcançado.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-base)', fontWeight: 600 }}>Contagem de {contagem} s</span>
          <button
            type="button"
            aria-label="Contagem mais curta"
            onClick={() => mudar(-1)}
            disabled={contagem <= CONTAGEM_MIN_S}
            style={botao()}
          >
            − mais curta
          </button>
          <button
            type="button"
            aria-label="Contagem mais longa"
            onClick={() => mudar(1)}
            disabled={contagem >= CONTAGEM_MAX_S}
            style={botao()}
          >
            + mais longa
          </button>
        </div>
      </section>

      <section aria-labelledby="modo-hospital-title" style={estiloDoCartao}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <Hospital size={28} color="var(--color-primary)" aria-hidden="true" />
          <h2 id="modo-hospital-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
            Modo hospital
          </h2>
        </div>
        <p style={{ margin: '0 0 1.25rem 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Para UTI e enfermaria: a tela inicial passa a ser a do quarto, com botões grandes para dor, sede, aspirar,
          posição, frio, calor, chamar a enfermagem, família e sim/não. O menu completo continua a um olhar, em
          &ldquo;Mais opções&rdquo;.
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={settings.modoHospital}
          onClick={() => updateSettings({ modoHospital: !settings.modoHospital })}
          style={botao(settings.modoHospital)}
        >
          {settings.modoHospital ? 'Modo hospital: ligado' : 'Modo hospital: desligado'}
        </button>
        {settings.modoHospital && settings.modoHorizontal === true && (
          // Os dois modos ligados: o horizontal vale (M8, 21/10/2026). Sem este aviso a tela do quarto
          // parece quebrada: o cuidador ligou o modo hospital e a tela inicial continua sendo o menu.
          <p role="note" style={{ margin: '1rem 0 0 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            O modo só horizontal está ligado, e ele vale: a tela inicial continua sendo o menu de sempre, e não a do
            quarto, porque a tela do quarto pede o olhar para cima e para baixo. Para usar a tela do quarto, desligue o
            modo só horizontal.
          </p>
        )}
      </section>
    </>
  );
};
