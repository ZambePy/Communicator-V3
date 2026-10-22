import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hand } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import {
  limitarPasso, nomeDoAcionador, teclaPodeSerAcionador, PASSO_MIN_MS, PASSO_MAX_MS, type EntradaDoAcionador,
} from '@tracker/interaction/varreduraPorAcionador';
import { limitarPressaoLonga, textoDosSegundos } from '@tracker/interaction/varreduraPorAcionador';
import { limitarPiscadaMin, PISCADA_MIN_MS, PISCADA_MAX_MS } from '@tracker/interaction/simNaoPorPiscada';

/** Quanto tempo a tela espera o aperto do acionador ao configurar. */
const ESPERA_DO_ACIONADOR_MS = 10_000;

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
 * Configurações → Plano B (19/10/2026): o que usar quando o olhar piora.
 * Tela do cuidador (mouse e teclado). Cada controle diz em palavras o que faz.
 */
export const AjustesDoPlanoB: React.FC<{ estiloDoCartao: React.CSSProperties }> = ({ estiloDoCartao }) => {
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();
  const [esperando, setEsperando] = useState(false);

  // Configurar o acionador: a próxima tecla ou botão do mouse vira o acionador.
  useEffect(() => {
    if (!esperando) return;
    let primeiroMouseUp = true;
    const terminar = (a: EntradaDoAcionador) => {
      updateSettings({ acionador: a });
      setEsperando(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { setEsperando(false); return; }
      if (!teclaPodeSerAcionador(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      terminar({ tipo: 'tecla', codigo: e.code });
    };
    const aoMouse = (e: MouseEvent) => {
      // O mouseup do próprio clique em "Configurar" não conta.
      if (e.type === 'mouseup' && primeiroMouseUp) { primeiroMouseUp = false; return; }
      if (e.type !== 'mousedown') return;
      e.preventDefault();
      e.stopPropagation();
      terminar({ tipo: 'mouse', botao: e.button });
    };
    window.addEventListener('keydown', aoTeclar, true);
    window.addEventListener('mousedown', aoMouse, true);
    window.addEventListener('mouseup', aoMouse, true);
    const t = setTimeout(() => setEsperando(false), ESPERA_DO_ACIONADOR_MS);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', aoTeclar, true);
      window.removeEventListener('mousedown', aoMouse, true);
      window.removeEventListener('mouseup', aoMouse, true);
    };
  }, [esperando, updateSettings]);

  const passoS = (limitarPasso(settings.acionadorPassoMs) / 1000).toFixed(1).replace('.', ',');
  const piscadaS = (limitarPiscadaMin(settings.piscadaLongaMs) / 1000).toFixed(1).replace('.', ',');
  const acionadorLigado = settings.modoDeEntrada === 'acionador';

  return (
    <section aria-labelledby="planob-title" style={estiloDoCartao}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <Hand size={28} color="var(--color-primary)" aria-hidden="true" />
        <h2 id="planob-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
          Plano B: quando o olhar piora
        </h2>
      </div>
      <p style={{ margin: '0 0 1.25rem 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Com um <strong>acionador</strong> (um botão grande ligado ao computador por USB), a tela é percorrida
        sozinha, um botão por vez, e apertar escolhe o que está destacado. Segurar por{' '}
        {textoDosSegundos(limitarPressaoLonga(settings.acionadorPressaoLongaMs))} chama a emergência (o tempo se
        ajusta logo abaixo). Para o cuidador usar o mouse, a tecla Esc pausa a varredura por até 2 minutos.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <button
          type="button"
          role="switch"
          aria-checked={acionadorLigado}
          onClick={() => updateSettings({ modoDeEntrada: acionadorLigado ? 'olhar' : 'acionador' })}
          style={botao(acionadorLigado)}
        >
          {acionadorLigado ? 'Varredura com acionador: ligada' : 'Varredura com acionador: desligada'}
        </button>
        <button type="button" onClick={() => setEsperando(true)} style={botao(false)} disabled={esperando}>
          {esperando ? 'Aperte o acionador agora… (Esc cancela)' : 'Configurar o acionador'}
        </button>
        <span style={{ color: 'var(--color-text-muted)' }}>Acionador: <strong>{nomeDoAcionador(settings.acionador)}</strong></span>
        {settings.acionador && (
          <button type="button" onClick={() => updateSettings({ acionador: null })} style={botao(false)}>
            Voltar ao padrão
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ color: 'var(--color-text-base)', fontWeight: 600 }}>Tempo em cada botão: {passoS} s</span>
        <button type="button" aria-label="Mais rápido" onClick={() => updateSettings({ acionadorPassoMs: limitarPasso(settings.acionadorPassoMs - 250) })} disabled={settings.acionadorPassoMs <= PASSO_MIN_MS} style={botao(false)}>− mais rápido</button>
        <button type="button" aria-label="Mais devagar" onClick={() => updateSettings({ acionadorPassoMs: limitarPasso(settings.acionadorPassoMs + 250) })} disabled={settings.acionadorPassoMs >= PASSO_MAX_MS} style={botao(false)}>+ mais devagar</button>
        <button
          type="button"
          role="switch"
          aria-checked={settings.acionadorDesligaOlhar}
          onClick={() => updateSettings({ acionadorDesligaOlhar: !settings.acionadorDesligaOlhar })}
          style={botao(settings.acionadorDesligaOlhar)}
        >
          {settings.acionadorDesligaOlhar ? 'O olhar não clica enquanto o acionador está ligado' : 'O olhar continua clicando junto com o acionador'}
        </button>
      </div>

      {/* Varredura falada (rodada 3, 21/10/2026). Desligada por padrão: quem
          enxerga bem não precisa dela, e uma voz repetindo cada botão cansa. */}
      <p style={{ margin: '1.25rem 0 0.75rem 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Com a <strong>varredura falada</strong>, a voz do computador diz o nome de cada botão, baixinho, enquanto a
        varredura passa por ele. Ela nunca fala por cima da voz do paciente, da mensagem do cuidador nem do alarme:
        espera terminarem.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <button
          type="button"
          role="switch"
          aria-checked={settings.varreduraFalada}
          onClick={() => updateSettings({ varreduraFalada: !settings.varreduraFalada })}
          style={botao(settings.varreduraFalada)}
        >
          {settings.varreduraFalada ? 'Varredura falada: ligada' : 'Varredura falada: desligada'}
        </button>
      </div>

      <p style={{ margin: '1.25rem 0 0.75rem 0', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        Na tela <strong>Sim · Não</strong> a pessoa responde olhando para o lado da resposta. Com a piscada longa
        ligada, também vale piscar: <strong>uma piscada longa = SIM, duas = NÃO</strong>.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <button
          type="button"
          role="switch"
          aria-checked={settings.simNaoPorPiscada}
          onClick={() => updateSettings({ simNaoPorPiscada: !settings.simNaoPorPiscada })}
          style={botao(settings.simNaoPorPiscada)}
        >
          {settings.simNaoPorPiscada ? 'Sim/Não por piscada longa: ligado' : 'Sim/Não por piscada longa: desligado'}
        </button>
        <span style={{ color: 'var(--color-text-base)', fontWeight: 600 }}>Piscada longa a partir de {piscadaS} s</span>
        <button type="button" aria-label="Piscada mais curta" onClick={() => updateSettings({ piscadaLongaMs: limitarPiscadaMin(settings.piscadaLongaMs - 100) })} disabled={settings.piscadaLongaMs <= PISCADA_MIN_MS} style={botao(false)}>−</button>
        <button type="button" aria-label="Piscada mais longa" onClick={() => updateSettings({ piscadaLongaMs: limitarPiscadaMin(settings.piscadaLongaMs + 100) })} disabled={settings.piscadaLongaMs >= PISCADA_MAX_MS - 500} style={botao(false)}>+</button>
        <button type="button" onClick={() => navigate('/sim-nao')} style={botao(false)}>Abrir a tela Sim · Não</button>
      </div>
    </section>
  );
};
