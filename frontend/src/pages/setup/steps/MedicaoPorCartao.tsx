import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, Minus, Plus, Check, X } from 'lucide-react';
import { PrimaryButton } from '../../../components/ui/PrimaryButton';
import {
  LARGURA_INICIAL_CSS_PX,
  PROPORCAO_DO_CARTAO,
  arredondarPolegadas,
  limitarLarguraDoCartao,
  medirMonitorPorCartao,
  resolucaoFisica,
  type InfoDaTela,
} from '../medidaPorCartao';

/** `irisflowSystem.getDisplayInfo()` do preload, quando existe (só no Electron). */
async function lerInfoDaTela(): Promise<InfoDaTela | null> {
  try {
    const sys = (window as unknown as { irisflowSystem?: { getDisplayInfo?: () => Promise<InfoDaTela> } })
      .irisflowSystem;
    if (!sys?.getDisplayInfo) return null;
    return (await sys.getDisplayInfo()) ?? null;
  } catch {
    return null;
  }
}

const fmt = (n: number, casas = 1) => n.toFixed(casas).replace('.', ',');

/**
 * "Medir com um cartão": o cuidador encosta um cartão de crédito ou documento
 * (tamanho ID-1) na tela e ajusta o contorno até coincidir.
 *
 * Painel em tela cheia (abaixo da Emergência, que continua visível e
 * acionável): o contorno precisa ser desenhado em tamanho REAL, sem caber
 * numa coluna de 640 px — num monitor 4K em 100 % o cartão passa de 550 px.
 *
 * Duas formas de ajustar, as duas do cuidador: botões grandes de −/+ (1 px e
 * 10 px) e arrastar o canto do contorno com o mouse.
 */
export const MedicaoPorCartao: React.FC<{
  aoUsar: (polegadas: number) => void;
  aoCancelar: () => void;
}> = ({ aoUsar, aoCancelar }) => {
  const [largura, setLargura] = useState(LARGURA_INICIAL_CSS_PX);
  const [info, setInfo] = useState<InfoDaTela | null>(null);
  const arrasto = useRef<{ x0: number; l0: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    void lerInfoDaTela().then((i) => {
      if (vivo) setInfo(i);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const tela = resolucaoFisica(
    info,
    typeof window !== 'undefined' ? window.screen : { width: 0, height: 0 },
    dpr
  );
  const medida = medirMonitorPorCartao(largura, dpr, tela);
  const ajustar = (delta: number) => setLargura((l) => limitarLarguraDoCartao(l + delta));

  const botaoGrande: React.CSSProperties = {
    minWidth: 96,
    minHeight: 72,
    fontSize: '1.15rem',
    fontWeight: 800,
    justifyContent: 'center',
  };

  // Portal no <body>: o passo mora num `.glass-card`, que tem
  // `backdrop-filter` — e isso faz um `position: fixed` descendente ficar
  // preso à caixa do cartão em vez de cobrir a tela.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cartao-titulo"
      data-testid="medicao-por-cartao"
      style={{
        position: 'fixed',
        inset: 0,
        // Abaixo da Emergência (99990): o botão continua visível e acionável.
        zIndex: 99950,
        background: 'var(--settings-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'calc(var(--reserva-emergencia-y)) 1.5rem 1.5rem',
        gap: '1rem',
        overflow: 'auto',
      }}
    >
      <div
        className="coluna-livre-da-emergencia"
        style={{ '--coluna-largura': '720px', maxWidth: 720, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
      >
        <h2 id="cartao-titulo" className="t-h2" style={{ margin: 0, color: 'var(--color-text-base)', display: 'flex', gap: '0.6rem', justifyContent: 'center', alignItems: 'center' }}>
          <CreditCard size={26} color="var(--color-primary)" aria-hidden="true" /> Medir com um cartão
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
          Encoste um cartão de crédito, de banco ou um documento no tamanho padrão (como a CNH nova ou
          o RG em cartão) na tela, dentro do contorno. Use − e + — ou arraste o canto — até o contorno
          ficar exatamente do tamanho do cartão.
        </p>
      </div>

      {/* O contorno, em tamanho real. `flexShrink: 0` para nunca ser
          espremido pelo layout — encolher aqui mudaria a medida. */}
      <div
        data-testid="contorno-do-cartao"
        aria-label={`Contorno do cartão: ${largura} pixels de largura`}
        style={{
          position: 'relative',
          flexShrink: 0,
          width: largura,
          height: Math.round(largura * PROPORCAO_DO_CARTAO),
          border: '3px dashed var(--color-primary)',
          borderRadius: Math.round(largura * 0.037),
          background: 'var(--tint-info-bg)',
          boxSizing: 'border-box',
        }}
      >
        <span
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontWeight: 700 }}
        >
          85,60 × 53,98 mm
        </span>
        {/* Alça de arrasto (mouse do cuidador). */}
        <span
          role="presentation"
          data-testid="alca-do-cartao"
          onPointerDown={(e) => {
            arrasto.current = { x0: e.clientX, l0: largura };
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!arrasto.current) return;
            setLargura(limitarLarguraDoCartao(arrasto.current.l0 + (e.clientX - arrasto.current.x0)));
          }}
          onPointerUp={() => {
            arrasto.current = null;
          }}
          style={{
            position: 'absolute',
            right: -18,
            bottom: -18,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--color-primary)',
            border: '3px solid var(--color-bg-base)',
            cursor: 'nwse-resize',
            touchAction: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <PrimaryButton type="button" variant="secondary" style={botaoGrande} onClick={() => ajustar(-10)} aria-label="Diminuir bastante">
            <Minus size={20} aria-hidden="true" />
            <Minus size={20} aria-hidden="true" style={{ marginLeft: -12 }} />
          </PrimaryButton>
          <PrimaryButton type="button" variant="secondary" style={botaoGrande} onClick={() => ajustar(-1)} aria-label="Diminuir um pouco">
            <Minus size={20} aria-hidden="true" />
          </PrimaryButton>
          <PrimaryButton type="button" variant="secondary" style={botaoGrande} onClick={() => ajustar(1)} aria-label="Aumentar um pouco">
            <Plus size={20} aria-hidden="true" />
          </PrimaryButton>
          <PrimaryButton type="button" variant="secondary" style={botaoGrande} onClick={() => ajustar(10)} aria-label="Aumentar bastante">
            <Plus size={20} aria-hidden="true" />
            <Plus size={20} aria-hidden="true" style={{ marginLeft: -12 }} />
          </PrimaryButton>
        </div>

        <p role="status" aria-live="polite" data-testid="medida-do-cartao" style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem', color: 'var(--color-text-base)', textAlign: 'center' }}>
          {medida
            ? `Monitor de ≈ ${fmt(medida.diagonalPol)} polegadas (${fmt(medida.larguraMm / 10)} × ${fmt(medida.alturaMm / 10)} cm)`
            : 'Não foi possível ler a resolução desta tela.'}
          {medida && !medida.plausivel && (
            <span style={{ display: 'block', fontWeight: 600, fontSize: '0.95rem', color: 'var(--tint-danger-text)' }}>
              Fora da faixa de monitor (10 a 60 polegadas) — confira o ajuste do contorno.
            </span>
          )}
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <PrimaryButton type="button" variant="ghost" style={{ minHeight: 64 }} onClick={aoCancelar}>
            <X size={18} aria-hidden="true" /> Cancelar
          </PrimaryButton>
          <PrimaryButton
            type="button"
            style={{ minHeight: 64, fontSize: '1.05rem' }}
            disabled={!medida || !medida.plausivel}
            onClick={() => medida && aoUsar(arredondarPolegadas(medida.diagonalPol))}
          >
            <Check size={18} aria-hidden="true" /> Usar esta medida
          </PrimaryButton>
        </div>
      </div>
    </div>,
    document.body
  );
};
