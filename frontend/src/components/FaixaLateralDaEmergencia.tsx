import React, { forwardRef, useEffect, useId, useState } from 'react';
import { AlertOctagon, X } from 'lucide-react';
import { EVENTO_DE_ACURACIA_MEDIDA } from '@tracker/accuracy';
import { EVENTO_DE_CALIBRACAO_EM_USO } from '@tracker/calibration';
import { FOLGA_DE_INTRUSAO_DEG } from '@tracker/interaction/dwell';
import { GazeButton } from './ui/GazeButton';
import { registrarZonaLateral } from './ui/zonasLaterais';
import { ID_DA_EMERGENCIA } from './ReancoragemOverlay';
import { alvoMinimoPx, grausEmPxDaTela } from '../design/gazeMetrics';

/**
 * A Emergência e o CANCELAR dela no modo só horizontal (pedido de 21/10/2026).
 *
 * O botão de sempre fica no canto de cima: quem perdeu o olhar vertical não
 * chega nele. Aqui ele vira uma FAIXA na borda direita da tela, da altura toda,
 * acionada pela coluna do olhar — ver `zonasLaterais.ts`. O tempo é o da
 * Emergência de sempre: os mesmos `data-dwell-ms` e `data-dwell-mult` do botão
 * do topo.
 *
 * A largura é 8 % da janela (o `x ≥ 92 %` do pedido), mas nunca menos que o
 * alvo mínimo de 5° (decisão de 21/10/2026, revisão Minor 1): numa janela de
 * 1024 px, 8 % são 82 px, menos da metade dos 5° de um posto comum. A zona
 * começa em largura da janela − essa largura, e as telas reservam a mesma
 * medida (`--faixa-da-emergencia-largura`, escrita aqui no `<html>`).
 *
 * Na contagem, o CANCELAR também ganha uma faixa, na borda ESQUERDA: o
 * paciente acabou de olhar para a direita para acionar, e desfazer um
 * acionamento sem querer é olhar para o lado oposto, longe do texto da
 * contagem (que fica no meio e é lido sem cancelar nada — o CANCELAR do meio,
 * no modo horizontal, não tem dwell).
 *
 * "Longe" é medido (revisão final, rodada 1, I1, 21/10/2026): a faixa vai de 5°
 * a 6,6° e o título centrado na janela inteira começava dentro dela a 1024 px, e
 * a menos de 1° dela a 1280 e 1366 px — fixar o começo do título por 1 s
 * cancelava o próprio socorro. O texto da contagem agora só ocupa a coluna do
 * meio (`useColunaDaContagem`), com 1,5° de folga além da folga de intrusão do
 * dwell (1°) dos dois lados.
 */

/** Registra o elemento de `id` como faixa lateral enquanto ele está na tela. */
function useFaixaLateral(id: string): void {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return undefined;
    return registrarZonaLateral(el, 'faixa');
  }, [id]);
}

/** A parte da largura da janela que a faixa ocupa (o `x ≥ 92 %` do pedido). */
export const FRACAO_DA_FAIXA = 0.08;

/** A largura da faixa, em px: 8 % da janela, nunca menos que o alvo mínimo. */
export function larguraDaFaixaPx(larguraDaJanela: number, alvoMinimo: number): number {
  return Math.ceil(Math.max(larguraDaJanela * FRACAO_DA_FAIXA, alvoMinimo));
}

const medirAFaixa = () => larguraDaFaixaPx(window.innerWidth, alvoMinimoPx());

/**
 * A largura em vigor, refeita quando a janela muda ou o alvo mínimo muda (uma
 * medição nova, outra calibração em uso). Depois do recálculo dos tokens: o
 * `SettingsProvider` também espera o quadro, e foi registrado antes.
 */
function useLarguraDaFaixa(): number {
  const [largura, setLargura] = useState(medirAFaixa);
  useEffect(() => {
    let pendente = 0;
    const aoMudar = () => {
      if (pendente) return;
      pendente = requestAnimationFrame(() => {
        pendente = 0;
        setLargura(medirAFaixa());
      });
    };
    window.addEventListener('resize', aoMudar);
    window.addEventListener(EVENTO_DE_ACURACIA_MEDIDA, aoMudar);
    window.addEventListener(EVENTO_DE_CALIBRACAO_EM_USO, aoMudar);
    return () => {
      window.removeEventListener('resize', aoMudar);
      window.removeEventListener(EVENTO_DE_ACURACIA_MEDIDA, aoMudar);
      window.removeEventListener(EVENTO_DE_CALIBRACAO_EM_USO, aoMudar);
      if (pendente) cancelAnimationFrame(pendente);
    };
  }, []);
  return largura;
}

/**
 * Quanto o texto da contagem fica longe das faixas, ALÉM da folga de intrusão do
 * dwell (`FOLGA_DE_INTRUSAO_DEG`, 1°): a faixa mantém um dwell já começado até 1°
 * para fora dela, e o olhar do paciente erra ~1,5° — o texto tem de ficar além
 * dos dois (pedido da revisão final, rodada 1, 21/10/2026).
 */
export const AFASTAMENTO_DO_TEXTO_DEG = 1.5;

/**
 * A maior palavra do título da contagem ("EMERGÊNCIA", 6,8 em em Arial negrito)
 * com folga para uma fonte mais larga que a medida (o Inter não vem no app).
 */
const LARGURA_DA_MAIOR_PALAVRA_EM = 7.4;

/** A margem de cada lado da coluna do meio: a faixa, a folga de intrusão e o afastamento. */
export function margemDaColunaDoMeioPx(larguraDaFaixa: number, graus: (g: number) => number): number {
  return Math.ceil(larguraDaFaixa + graus(FOLGA_DE_INTRUSAO_DEG + AFASTAMENTO_DO_TEXTO_DEG));
}

/**
 * O título cabe na coluna: o de sempre (8 % da altura, entre 36 e 72 px) até onde
 * a maior palavra cabe, e nunca menos que 22 px — abaixo disso a quebra de linha
 * por letra do `overflowWrap` assume (melhor ilegível que dentro da faixa).
 */
export function tamanhoDoTituloDaContagemPx(colunaPx: number, alturaDaJanelaPx: number): number {
  const doVh = Math.min(72, Math.max(36, alturaDaJanelaPx * 0.08));
  return Math.max(22, Math.min(doVh, colunaPx / LARGURA_DA_MAIOR_PALAVRA_EM));
}

export interface ColunaDaContagem {
  /** Margem de cada lado, em px: o texto não chega mais perto das faixas que isto. */
  margemPx: number;
  /** A largura da coluna do meio, em px. */
  colunaPx: number;
  /** O tamanho do título "EMERGÊNCIA ACIONADA", em px. */
  tituloPx: number;
}

/**
 * A coluna do meio da contagem (modo só horizontal). `ativa` falso devolve
 * `null` e não escuta a janela. Acompanha a janela e o alvo mínimo, como a faixa.
 */
export function useColunaDaContagem(ativa: boolean): ColunaDaContagem | null {
  const faixa = useLarguraDaFaixa();
  const [janela, setJanela] = useState(() => ({ largura: window.innerWidth, altura: window.innerHeight }));
  useEffect(() => {
    if (!ativa) return undefined;
    const medir = () => setJanela({ largura: window.innerWidth, altura: window.innerHeight });
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [ativa]);
  if (!ativa) return null;
  const margemPx = margemDaColunaDoMeioPx(faixa, grausEmPxDaTela);
  const colunaPx = Math.max(0, janela.largura - 2 * margemPx);
  return { margemPx, colunaPx, tituloPx: tamanhoDoTituloDaContagemPx(colunaPx, janela.altura) };
}

interface FaixaDaEmergenciaProps {
  aoAcionar: () => void;
  degradado: boolean;
  pedidoAtivo: boolean;
  zIndex: number;
}

export const FaixaLateralDaEmergencia = forwardRef<HTMLDivElement, FaixaDaEmergenciaProps>(
  ({ aoAcionar, degradado, pedidoAtivo, zIndex }, ref) => {
    useFaixaLateral(ID_DA_EMERGENCIA);
    const largura = useLarguraDaFaixa();
    // As telas laterais e a pergunta do cuidador param antes da faixa (index.css).
    useEffect(() => {
      const html = document.documentElement;
      html.style.setProperty('--faixa-da-emergencia-largura', `${largura}px`);
      return () => {
        html.style.removeProperty('--faixa-da-emergencia-largura');
      };
    }, [largura]);
    return (
      <div
        ref={ref}
        className="faixa-da-emergencia"
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: `${largura}px`, zIndex }}
      >
        <GazeButton
          emergency
          // O diálogo do reajuste rápido adota este botão pelo `aria-owns`, como o do topo.
          id={ID_DA_EMERGENCIA}
          type="button"
          data-dwell-eixo="x"
          data-dwell-ms={degradado ? 3600 : 2000}
          data-dwell-mult={1.3}
          aria-label={pedidoAtivo ? 'Ver o pedido de socorro em andamento' : 'Disparar Emergência Médica'}
          onClick={aoAcionar}
          // Da altura toda e encostada na borda (o olhar que passa da borda é
          // preso nela pelo núcleo). A largura declarada é a de verdade: o
          // aviso de alvo pequeno do GazeButton confere os 5°.
          width={largura}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '1.25rem 0 0 1.25rem',
            border: 'none',
            background: '#B42318',
            color: '#ffffff',
            padding: 0,
          }}
        >
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: 'clamp(1.1rem, 2.6vw, 1.8rem)',
              fontWeight: 900,
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}
          >
            <AlertOctagon size={34} aria-hidden="true" style={{ transform: 'rotate(180deg)' }} />
            {pedidoAtivo ? 'SOCORRO EM ANDAMENTO' : 'EMERGÊNCIA'}
          </span>
        </GazeButton>
      </div>
    );
  },
);
FaixaLateralDaEmergencia.displayName = 'FaixaLateralDaEmergencia';

/** O CANCELAR da contagem, como faixa na borda esquerda (dentro da confirmação). */
export const CancelarPelaLateral: React.FC<{ aoCancelar: () => void }> = ({ aoCancelar }) => {
  const id = `${useId()}-cancelar-lateral`;
  useFaixaLateral(id);
  const largura = useLarguraDaFaixa();
  return (
    <GazeButton
      id={id}
      type="button"
      data-dwell-eixo="x"
      // O mesmo dwell curto do CANCELAR do meio, e acionável na calibração e
      // com o rastreamento degradado pela mesma marca.
      data-dwell-ms={1000}
      data-cancelar-emergencia="true"
      aria-label="Cancelar a emergência (olhe para a esquerda)"
      onClick={aoCancelar}
      // A mesma largura da faixa da Emergência (nunca menos que 5°).
      width={largura}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: `${largura}px`,
        height: '100%',
        borderRadius: '0 1.25rem 1.25rem 0',
        border: 'none',
        background: '#ffffff',
        color: '#dc2626',
        padding: 0,
      }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: 'clamp(1.1rem, 2.6vw, 1.8rem)',
          fontWeight: 900,
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        }}
      >
        <X size={34} aria-hidden="true" />
        CANCELAR
      </span>
    </GazeButton>
  );
};
