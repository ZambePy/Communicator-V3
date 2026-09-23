import React from 'react';
import type { MotivoDeRecalibracao } from '@tracker/vigiaDeRecalibracao';
import { detalheDoMotivo } from '@tracker/vigiaDeRecalibracao.aviso';

/**
 * Falhas que bloqueiam o controle por olhar precisam ser VISÍVEIS.
 *
 * `cameraError` era calculado no `GazeProvider` e exposto no contexto, mas
 * ninguém renderizava: a câmera podia falhar e o app seguia mudo. Uma webcam
 * desconectada deixa o cursor sumido e nada clicável — indistinguível de "o
 * programa travou", e o usuário-alvo não tem como diagnosticar isso sozinho.
 *
 * **"Ainda não há calibração" foi removido em definitivo, a pedido.** Era o
 * único que aparecia o tempo todo: bastava não haver calibração, e como este
 * componente mora no `GazeProvider` — que envolve o app inteiro — ele cobria o
 * topo de TODAS as telas, inclusive login e onboarding, que o cuidador opera
 * com mouse e teclado e onde não existe controle por olhar nenhum.
 *
 * Os demais continuam: falha de câmera, calibração invalidada, perda de rosto e
 * aviso de distância. Todos são reativos a um evento — só aparecem quando algo
 * de fato acontece — em vez de ficarem presos na tela por uma condição estável.
 *
 * O bloqueio que o aviso removido anunciava continua valendo: sem calibração o
 * dwell segue desligado, inclusive para emergência (ver
 * `GazeContext.dwell.test.tsx`). Saiu o aviso, não a proteção.
 *
 * Renderizado dentro do `GazeProvider`, que fica FORA do router: por isso não
 * navega, apenas instrui. Quem age é o cuidador, com mouse ou toque.
 */

interface Props {
  /** Estado corrente do engine. */
  state: string;
  cameraError: string | null;
  calibrationInvalidated: string | null;
  /**
   * gaze perdido além do hold de 2 s. `null` no caminho feliz.
   *
   * Vem pronto do `GazeFallback` (que já aplicou a histerese) em vez de ser
   * derivado aqui de `state === 'no_face'`: o banner não pode piscar a cada
   * quadro que o detector pula, senão o paciente aprende a ignorá-lo — e aí
   * ele não serve para a perda que importa.
   */
  gazeLostMessage?: string | null;
  /**
   * A câmera aberta não é a da última sessão e o campo de visão mudou por
   * causa disso (restaurado de uma medição anterior, ou de volta ao padrão).
   * Última prioridade: é informação de configuração, não de operação.
   */
  avisoDeCamera?: string | null;
  /**
   * Cursor parado na borda porque o olhar saiu da área da tela.
   *
   * Vem pronto do `DetectorDeOlharForaDaTela`, com histerese. É o sintoma que
   * o paciente relata como "o cursor travou": a predição saiu de [0,1], o
   * clamp devolve a borda em todo quadro e o cursor fica imóvel — sem nada na
   * tela dizendo o motivo.
   */
  avisoDeBorda?: string | null;
  /**
   * O vigia de recalibração acusou (BCEA ou viés além da última medição, por
   * duas consultas seguidas). `null` = nada. Abaixo de distância e postura na
   * precedência: aquelas se resolvem em 2 s; esta pede os nove pontos, e só
   * faz sentido pedir quando as duas primeiras não são a causa.
   */
  avisoDeRecalibracao?: MotivoDeRecalibracao;
  onRecalibrar?: (() => void) | null;
  onDispensarRecalibracao?: (() => void) | null;
  /**
   * Olhos fechados (ou pálpebra cobrindo a íris) por mais tempo que uma
   * piscada. O cursor congela com o rosto presente — o mesmo sintoma visual do
   * aviso de borda, causa diferente.
   */
  avisoDeOlhosFechados?: string | null;
  /**
   * Aviso de distância fora da faixa de calibração. `null` quando a
   * distância está na faixa ou não há medição.
   *
   * Fica ABAIXO dos outros na ordem de precedência de propósito: sem câmera ou
   * sem calibração, a distância não importa — e empilhar dois banners num
   * software assistivo é pior que mostrar só o mais grave.
   */
  distanceAdvice?: string | null;
  /**
   * Ação de reajuste rápido (2 s olhando o centro), quando ela resolve o que o
   * banner está dizendo. `null` some com o botão.
   *
   * Só aparece nos avisos em que reancorar É a saída — distância diferente da
   * calibração, ou postura que a referência lenta se recusou (corretamente) a
   * absorver. Nos erros de câmera e de calibração inválida não aparece: lá o
   * reajuste não conserta nada e o botão só ensinaria a apertá-lo por reflexo.
   */
  onReancorar?: (() => void) | null;
  /** Reajuste em curso: o botão vira rótulo e para de aceitar clique. */
  reancorando?: boolean;
  /**
   * A referência geométrica lenta está parada há tempo demais porque a pessoa
   * está numa postura que não é a da calibração (`sugereReancoragem`).
   * Precedência abaixo da distância: quando os dois valem, a distância explica
   * melhor.
   */
  avisoDePostura?: boolean;
}

const WRAP: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  // Acima de qualquer overlay do app: este aviso não pode ficar escondido.
  zIndex: 1000000,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  padding: '0.75rem',
};

const CARD: React.CSSProperties = {
  pointerEvents: 'auto',
  maxWidth: 760,
  width: '100%',
  padding: '1rem 1.4rem',
  borderRadius: '0.9rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.9rem',
  fontSize: '1.05rem',
  lineHeight: 1.45,
  boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
};

export const GazeStatusBanner: React.FC<Props> = ({
  cameraError,
  calibrationInvalidated,
  distanceAdvice = null,
  gazeLostMessage = null,
  avisoDeBorda = null,
  avisoDeOlhosFechados = null,
  avisoDeCamera = null,
  onReancorar = null,
  reancorando = false,
  avisoDePostura = false,
  avisoDeRecalibracao = null,
  onRecalibrar = null,
  onDispensarRecalibracao = null,
}) => {
  // `state` continua no contrato e e IGNORADO: era a entrada do unico aviso que
  // saiu ("Ainda nao ha calibracao"). Fica no tipo porque o `GazeProvider`
  // segue passando, e porque o teste precisa de um jeito de afirmar que
  // `state="uncalibrated"` nao produz banner nenhum.
  // Ordem de precedência = ordem de gravidade. Sem câmera, nada mais importa.
  let tom: 'erro' | 'aviso' | null = null;
  let titulo = '';
  let detalhe = '';
  /** O reajuste de 2 s resolve ESTE aviso? */
  let reajustavel = false;
  /** ESTE aviso pede os nove pontos (vigia de recalibração)? */
  let recalibravel = false;

  if (cameraError) {
    tom = 'erro';
    titulo = 'A câmera não está disponível';
    detalhe = `${cameraError} O controle por olhar está desligado até a câmera voltar.`;
  } else if (calibrationInvalidated) {
    tom = 'erro';
    titulo = 'A calibração deixou de valer';
    detalhe = `${calibrationInvalidated} É preciso calibrar de novo antes de usar o olhar.`;
  } else if (gazeLostMessage) {
    // acima do aviso de distância e abaixo dos erros de configuração.
    //
    // A ordem não é arbitrária: sem rosto na câmera, dizer que a distância
    // está diferente da calibração é responder a uma pergunta que ninguém
    // fez. E é 'aviso' e não 'erro' porque a situação é reversível pela
    // própria pessoa em um segundo — que é exatamente o que a mensagem pede.
    tom = 'aviso';
    titulo = gazeLostMessage;
    detalhe =
      'O rastreamento perdeu o rosto. O cursor volta assim que a câmera ' +
      'enxergar você de novo.';
  } else if (avisoDeOlhosFechados) {
    // Antes do aviso de borda: com o olho fechado a predição nem existe, então
    // falar da borda seria falar de um número que não foi medido neste quadro.
    tom = 'aviso';
    titulo = 'O cursor está parado';
    detalhe = avisoDeOlhosFechados;
  } else if (avisoDeBorda) {
    // Depois da perda de rosto e antes do aviso de distância. Com o rosto
    // perdido, falar da borda seria errado — a posição na tela nem está sendo
    // medida. E é 'aviso', não 'erro': nada quebrou, e a saída está a um
    // movimento de olho de distância, que é o que a mensagem diz como fazer.
    tom = 'aviso';
    titulo = 'O cursor parou na borda';
    detalhe = avisoDeBorda;
  } else if (distanceAdvice) {
    // o tom é 'aviso', não 'erro': o sistema continua funcionando, só
    // com precisão pior que a medida na calibração. Tratar isso como erro
    // ensinaria o cuidador a ignorar banners vermelhos.
    tom = 'aviso';
    titulo = 'Distância diferente da calibração';
    detalhe = distanceAdvice;
    // Aqui — e só aqui — reancorar é a saída: 2 s olhando o centro refazem a
    // base de distância e as referências geométricas sem retreinar o modelo.
    reajustavel = true;
  } else if (avisoDePostura) {
    // Abaixo da distância: os dois pedem o mesmo reajuste, e quando os dois
    // valem ao mesmo tempo a distância é a causa mais provável e a mais fácil
    // de entender ("você está mais perto do que quando calibrou").
    tom = 'aviso';
    titulo = 'Postura diferente da calibração';
    detalhe =
      'Você está há um tempo numa posição diferente da que calibrou. O cursor ' +
      'continua funcionando; um reajuste de 2 segundos deixa a mira no lugar.';
    reajustavel = true;
  } else if (avisoDeRecalibracao) {
    // Depois de distância e postura (que o reajuste de 2 s resolve) e antes
    // do aviso de câmera: é o vigia dizendo que o modelo deixou de descrever
    // a pessoa. 'aviso', não 'erro' — o cursor continua funcionando, só pior.
    tom = 'aviso';
    titulo = 'A mira piorou desde a última medição';
    detalhe = detalheDoMotivo(avisoDeRecalibracao);
    recalibravel = true;
  } else if (avisoDeCamera) {
    // Por último: é a situação mais benigna e a única que se resolve em
    // Configurações, não na cadeira. Só aparece quando a câmera mudou.
    tom = 'aviso';
    titulo = 'Câmera diferente da última sessão';
    detalhe = avisoDeCamera;
  }

  if (!tom) return null;

  const cores =
    tom === 'erro'
      ? { bg: '#7f1d1d', border: '#ef4444', fg: '#fee2e2' }
      : { bg: '#78350f', border: '#f59e0b', fg: '#fef3c7' };

  return (
    <div style={WRAP} role="status" aria-live="polite" data-testid="gaze-status-banner">
      {/* `coluna-livre-da-emergencia`: a 1024 px o cartão de 760 px,
          centralizado, alcançava a Emergência (fixa, canto superior direito)
          e a cobria — o z-index dele é maior. A classe estreita o cartão pelos
          dois lados só quando falta espaço, e ele continua centralizado. */}
      <div
        className="coluna-livre-da-emergencia"
        style={{
          ...CARD,
          '--coluna-largura': '760px',
          background: cores.bg,
          border: `2px solid ${cores.border}`,
          color: cores.fg,
        }}
        // O banner não é alvo de dwell: em `uncalibrated` nada é clicável, e
        // deixá-lo dwellável criaria a falsa impressão de que o olhar funciona.
        data-no-dwell="true"
      >
        <span aria-hidden="true" style={{ fontSize: '1.7rem', lineHeight: 1 }}>
          {tom === 'erro' ? '⛔' : '⚠️'}
        </span>
        <span style={{ flex: 1 }}>
          <strong style={{ display: 'block', fontSize: '1.15rem', marginBottom: '0.2rem' }}>
            {titulo}
          </strong>
          {detalhe}
        </span>
        {recalibravel && onRecalibrar && (
          <>
            <button
              type="button"
              onClick={onRecalibrar}
              data-testid="recalibrar-agora"
              // Dwellável de propósito, como o "Reajustar": quem precisa está
              // usando o olhar. Isolado do "Agora não" por espaço, não só por cor.
              style={{
                flexShrink: 0, minWidth: 200, minHeight: 72, padding: '0.6rem 1.1rem', borderRadius: '0.7rem',
                border: `2px solid ${cores.fg}`, background: cores.fg, color: cores.bg,
                fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              Calibrar de novo
            </button>
            {onDispensarRecalibracao && (
              <button
                type="button"
                onClick={onDispensarRecalibracao}
                data-testid="recalibrar-depois"
                data-dwell-ms="2000"
                style={{
                  flexShrink: 0, minWidth: 160, minHeight: 72, marginLeft: '1rem', padding: '0.6rem 1rem',
                  borderRadius: '0.7rem', border: `2px solid ${cores.fg}`, background: 'transparent',
                  color: cores.fg, fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Agora não
              </button>
            )}
          </>
        )}
        {reajustavel && onReancorar && (
          <button
            type="button"
            onClick={reancorando ? undefined : onReancorar}
            disabled={reancorando}
            // Sem `data-no-dwell`, ao contrário do cartão que o contém: o
            // dispatcher lê a marca no PRÓPRIO elemento, então este botão é
            // dwellável de propósito — quem precisa dele está usando o olhar e
            // não tem como alcançar um mouse. O alvo é grande pela mesma razão.
            style={{
              flexShrink: 0,
              minWidth: 148,
              minHeight: 56,
              padding: '0.6rem 1.1rem',
              borderRadius: '0.7rem',
              border: `2px solid ${cores.fg}`,
              background: reancorando ? 'transparent' : cores.fg,
              color: reancorando ? cores.fg : cores.bg,
              fontSize: '1.02rem',
              fontWeight: 700,
              cursor: reancorando ? 'default' : 'pointer',
            }}
          >
            {reancorando ? 'Olhe o centro…' : 'Reajustar (2 s)'}
          </button>
        )}
      </div>
    </div>
  );
};
