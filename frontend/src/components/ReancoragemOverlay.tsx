import React, { useEffect, useState } from 'react';

/**
 * Reajuste rápido: um alvo no CENTRO da tela, por 2 segundos — ou, com a
 * recalibração rápida afim (M20), 2 segundos em cada um de cinco pontos.
 *
 * É o que substitui a calibração inteira quando o que mudou foi pouco: a
 * pessoa sentou mais perto, escorregou na cadeira, apoiou a cabeça de outro
 * jeito. Durante a coleta o engine junta a predição dos quadros válidos e, ao
 * fim, corrige a deriva pela correção por dwell (`calibration.ts`,
 * `corrigirDerivaNoCentro` / `corrigirDerivaNosPontos`).
 *
 * O Ridge NÃO é retreinado e as referências da calibração não mudam. É por
 * isso que isto cabe em segundos e a calibração não — e é por isso que ele
 * aparece como botão num aviso, e não como uma tela à parte que interrompe a
 * conversa.
 *
 * Sem botão de cancelar próprio: um segundo alvo na tela disputaria o olhar
 * com o ponto, e a coleta mede justamente para onde a pessoa olha. A ÚNICA
 * saída no meio é a EMERGÊNCIA: o `EmergencyProvider` põe o botão dela por
 * cima deste overlay (`Z_DO_REAJUSTE`), e escolhê-la descarta a coleta e segue
 * o fluxo normal de socorro. O alvo fica exatamente onde o engine mede e a
 * Emergência no canto — o teste (`ReancoragemOverlay.emergencia.test.tsx`)
 * confere que um nunca cobre o outro, da menor janela (1024 px) ao 4K.
 */

/** Duração padrão do reajuste, em ms. A mesma que o engine acumula. */
export const DURACAO_DO_REAJUSTE_MS = 2000;

/**
 * Camada do overlay: acima de todo o app (inclusive do aviso de rastreamento,
 * 1000000, e da confirmação de Emergência, 999999) — com UMA exceção: o botão
 * de Emergência, que durante o reajuste sobe para `Z_DO_REAJUSTE + 1`.
 */
export const Z_DO_REAJUSTE = 1000001;

/** Lado do alvo (o SVG do anel), em px. */
export const LADO_DO_ALVO_PX = 120;

/** Onde fica o ponto do reajuste de sempre. */
const CENTRO = { x: 0.5, y: 0.5 } as const;

/**
 * Pontos da recalibração rápida afim (M20), em fração da tela: o centro
 * primeiro, onde o reajuste de sempre já punha o ponto, e quatro em cruz, a
 * 20/80 %. Cada eixo fica 60 % coberto, acima dos 40 % que o ganho precisa para
 * ser aprendido por inteiro (`kalmanDoDwell.ESPALHAMENTO_PLENO`).
 *
 * Em cruz, e não nos quatro quadrantes, por causa da Emergência no canto de
 * cima à direita: na menor janela (1024 × 640) um ponto em (75 %, 25 %) fica a
 * menos de 60 px do botão na altura máxima dele — menos que o erro médio
 * medido em 28/09 (68,6 px) —, e o olhar que colhe o ponto pode acabar
 * disparando o socorro. `ReancoragemOverlay.emergencia.test.tsx` confere a
 * distância em todas as janelas.
 */
export const PONTOS_DA_RECALIBRACAO_RAPIDA = [
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.2 },
  { x: 0.8, y: 0.5 },
  { x: 0.5, y: 0.8 },
  { x: 0.2, y: 0.5 },
] as const;

/** Espaço entre o alvo e a frase embaixo dele. */
const ESPACO_ATE_A_FRASE = '2.2rem';

export interface Props {
  /** Duração da coleta que está acontecendo no engine, só para animar o anel. */
  duracaoMs?: number;
  /**
   * Onde fica o ponto, em fração da tela. Padrão: o centro exato. A
   * recalibração rápida afim (M20) passa um ponto por vez.
   */
  alvo?: { x: number; y: number };
}

/**
 * Puramente visual: quem manda na coleta e em quando ela acaba é o engine
 * (`reancorarReferencias`, ou `medirPontoDaRecalibracao` ponto a ponto). Este
 * componente só desenha o alvo e o anel que fecha, e some quando o provider o
 * desmonta.
 */
export const ReancoragemOverlay: React.FC<Props> = ({ duracaoMs = DURACAO_DO_REAJUSTE_MS, alvo: pontoDado }) => {
  const [restanteMs, setRestanteMs] = useState(duracaoMs);
  const alvo = pontoDado ?? CENTRO;

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
    // Não é `aria-modal`: a Emergência continua acessível por cima dele — para
    // o leitor de tela e para o teclado, não só para o olhar e o mouse.
    <div
      role="dialog"
      aria-label={pontoDado
        ? 'Reajuste rápido: olhe o ponto azul em cada lugar da tela'
        : 'Reajuste rápido: olhe o ponto no centro da tela'}
      data-testid="reancoragem-overlay"
      data-no-dwell="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_DO_REAJUSTE,
        background: '#000',
        // Sem `pointerEvents: none`: durante a coleta nada da tela de baixo
        // deve receber clique ou dwell — um clique acidental aqui viraria uma
        // ação numa tela que a pessoa nem está vendo. A Emergência não é "a
        // tela de baixo": ela fica acima deste overlay.
      }}
    >
      {/* O PONTO exatamente onde o engine mede, posicionado sozinho. Antes
          era um flex em coluna que centrava o bloco ponto + frase: o ponto
          ficava ~40 px acima do meio, e o motor, que mede o viés contra
          (0,5; 0,5), aprendia esse deslocamento como correção — depois de
          cada "Reajustar" o cursor passava a cair abaixo de onde a pessoa
          olhava. */}
      <svg
        data-testid="reancoragem-alvo"
        width={LADO_DO_ALVO_PX}
        height={LADO_DO_ALVO_PX}
        viewBox="0 0 120 120"
        aria-hidden="true"
        style={{ position: 'absolute', left: `${alvo.x * 100}%`, top: `${alvo.y * 100}%`, transform: 'translate(-50%, -50%)' }}
      >
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
          position: 'absolute',
          left: `${alvo.x * 100}%`,
          // A frase fica embaixo do ponto na metade de cima da tela e em cima
          // dele na de baixo, para não sair da tela.
          top: alvo.y <= 0.5
            ? `calc(${alvo.y * 100}% + ${LADO_DO_ALVO_PX / 2}px + ${ESPACO_ATE_A_FRASE})`
            : `calc(${alvo.y * 100}% - ${LADO_DO_ALVO_PX / 2}px - ${ESPACO_ATE_A_FRASE} - 4em)`,
          transform: 'translateX(-50%)',
          width: 'min(26ch, 90vw)',
          color: '#e8eefc',
          fontSize: '1.35rem',
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      >
        Olhe o ponto azul até ele fechar.
      </p>
    </div>
  );
};
