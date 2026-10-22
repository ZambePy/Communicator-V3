import React from 'react';
import type { MotivoDeRecalibracao } from '@tracker/vigiaDeRecalibracao';
import { detalheDoMotivo } from '@tracker/vigiaDeRecalibracao.aviso';
import { alvoMinimoPx } from '../design/gazeMetrics';

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
 * Os demais continuam: falha de câmera, câmera que parou de enviar imagem,
 * rastreamento parado (detector de rosto em falha), calibração invalidada ou
 * suspensa pela janela fora do tamanho, perda de rosto e aviso de distância.
 * Todos são reativos a um evento — só aparecem quando algo de fato acontece —
 * em vez de ficarem presos na tela por uma condição estável.
 *
 * O bloqueio que o aviso removido anunciava continua valendo: sem calibração o
 * dwell segue desligado, inclusive para emergência (ver
 * `GazeContext.dwell.test.tsx`). Saiu o aviso, não a proteção.
 *
 * Renderizado dentro do `GazeProvider`, que fica FORA do router: por isso não
 * navega, apenas instrui. Quem age é o cuidador, com mouse ou toque.
 */

interface Props {
  /**
   * Estado corrente do engine. Dois estados viram aviso por si: `sem_camera`
   * (a câmera parou de entregar quadros) e `error` (o detector de rosto falhou
   * e o engine está tentando recriá-lo). Sem eles, os dois ficavam só no
   * heartbeat — na tela, um cursor parado.
   */
  state: string;
  cameraError: string | null;
  calibrationInvalidated: string | null;
  /**
   * A janela não está do tamanho em que a calibração foi feita (saiu da tela
   * cheia, monitor rearranjado): a calibração está SUSPENSA — o olhar só aciona
   * a Emergência e os botões de recuperação — até a janela voltar. `null` no
   * caminho feliz. O texto vem pronto do `GazeProvider`.
   */
  avisoDeTela?: string | null;
  /**
   * A suspensão do `avisoDeTela` é pelo recorte do modelo do rosto (o modelo
   * reiniciou de outro jeito), e não pela janela: não volta sozinha. Só conta
   * para o problema persistente (aviso ao cuidador); o banner não muda.
   */
  suspensaoPeloRecorte?: boolean;
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
   * precedência: aquelas se resolvem com o reajuste rápido; esta pede a
   * calibração inteira, e só faz sentido pedir quando as duas primeiras não
   * são a causa.
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
   * Contraluz forte (relato de 19/10/2026): o texto da luz, vindo das amostras
   * com `motivo: 'contraluz'`. Vence o aviso de olhos fechados e o de rosto
   * perdido — sob contraluz o rosto some e o EAR mente, e a causa das duas
   * coisas é a janela.
   */
  avisoDeContraluz?: string | null;
  /**
   * Pouca luz no quadro inteiro, por mais de 10 s (pedido de 18/10/2026: a
   * emergência precisa funcionar à noite). Abaixo da contraluz e acima do
   * rosto perdido: no escuro o detector perde o rosto, e a causa é a luz.
   */
  avisoDePoucaLuz?: string | null;
  /**
   * A tela está escurecida (brilho reduzido ou filtro âmbar) enquanto falta
   * luz: o aviso de pouca luz oferece "Clarear a tela". `null` some com o botão.
   */
  onClarearTela?: (() => void) | null;
  /**
   * O despachante do olhar falhou seguidamente: o olhar não aciona nada, nem
   * a Emergência. Erro, logo abaixo do rastreamento parado.
   */
  avisoDeAcionamento?: string | null;
  /** O modelo do olhar (L2CS ou EyeNet) parou ou não carregou. */
  avisoDoModelo?: { titulo: string; detalhe: string } | null;
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
   * Ação de reajuste rápido, quando ela resolve o que o banner está dizendo.
   * `null` some com o botão.
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
   * Como é o reajuste: o alvo único no centro (2 s) ou a recalibração rápida
   * afim, com um ponto que anda pela tela (M20). O texto precisa dizer o que
   * vai acontecer e quanto tempo leva — "2 s" para dez segundos de alvo
   * seria uma promessa quebrada para quem tem pouca energia para gastar.
   */
  reajuste?: { segundos: number; seguirPonto: boolean };
  /**
   * A referência geométrica lenta está parada há tempo demais porque a pessoa
   * está numa postura que não é a da calibração (`sugereReancoragem`).
   * Precedência abaixo da distância: quando os dois valem, a distância explica
   * melhor.
   */
  avisoDePostura?: boolean;
}

/** O reajuste de sempre: 2 s olhando o ponto no centro. */
const REAJUSTE_NO_CENTRO = { segundos: 2, seguirPonto: false } as const;

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

/**
 * O problema de RASTREAMENTO que um aviso descreve — o que pode deixar o
 * paciente sem comunicação se durar. Os avisos de configuração (calibração
 * suspensa, borda, distância, postura, recalibração, câmera trocada) não têm
 * tipo. É a chave de `services/problemaDoRastreamento.ts`.
 *
 * `calibracao_perdida` (revisão de UX de 19/10/2026): a calibração deixou de
 * valer (o modelo do olhar reiniciou em outro tamanho, por exemplo) com o rosto
 * na câmera — nada aciona pelo olhar, nem a Emergência. Só aparece pela escolha
 * do problema persistente (`problemaPersistenteDoOlhar`), não pelo banner.
 *
 * `olhar_reduzido` (revisão do pipeline de 19/10/2026): a calibração ficou
 * SUSPENSA porque o modelo do rosto voltou de outro jeito — o olhar só aciona a
 * Emergência e a recuperação, e isso não volta sozinho. Também só pela escolha
 * do problema persistente.
 */
export type TipoDeProblemaDoRastreamento =
  | 'camera'
  | 'rastreamento_parado'
  | 'acionamento_falhou'
  | 'contraluz'
  | 'rosto_perdido'
  | 'olhos_fechados'
  | 'modelo_do_olhar'
  | 'pouca_luz'
  | 'calibracao_perdida'
  | 'olhar_reduzido';

/** O aviso em vigor: o que o banner mostra. */
export interface AvisoDoOlhar {
  tom: 'erro' | 'aviso';
  titulo: string;
  detalhe: string;
  /** O reajuste rápido resolve ESTE aviso? */
  reajustavel: boolean;
  /** ESTE aviso pede a calibração inteira (vigia de recalibração)? */
  recalibravel: boolean;
  /** Clarear a tela ajuda neste aviso (pouca luz com a tela escurecida)? */
  clareavel?: boolean;
  problema: TipoDeProblemaDoRastreamento | null;
}

/** O que decide o aviso: as props do banner menos as ações. */
export type EntradasDoAviso = Omit<
  Props,
  'onReancorar' | 'reancorando' | 'onRecalibrar' | 'onDispensarRecalibracao' | 'onClarearTela'
>;

/**
 * Qual aviso vale agora — um só. Pura, para o banner e para o serviço de
 * problema persistente decidirem pela MESMA regra (relato de 19/10/2026).
 *
 * `state` só vale para `sem_camera` e `error`. `state="uncalibrated"` não
 * produz aviso nenhum (o "Ainda não há calibração" saiu de vez). Ordem de
 * precedência = ordem de gravidade. Sem câmera, nada mais importa.
 *
 * Os textos de rastreamento são calmos e em primeira pessoa, sem culpar
 * ninguém (pedido do dono, 19/10/2026): dizem o que está acontecendo, que o
 * IrisFlow está tentando, e o que ajuda.
 */
export function escolherAvisoDoOlhar({
  state,
  cameraError,
  calibrationInvalidated,
  avisoDeTela = null,
  distanceAdvice = null,
  gazeLostMessage = null,
  avisoDeBorda = null,
  avisoDeOlhosFechados = null,
  avisoDeContraluz = null,
  avisoDePoucaLuz = null,
  avisoDeAcionamento = null,
  avisoDoModelo = null,
  avisoDeCamera = null,
  reajuste = REAJUSTE_NO_CENTRO,
  avisoDePostura = false,
  avisoDeRecalibracao = null,
}: EntradasDoAviso): AvisoDoOlhar | null {
  const aviso = (
    tom: AvisoDoOlhar['tom'],
    titulo: string,
    detalhe: string,
    problema: TipoDeProblemaDoRastreamento | null,
    extra: Partial<Pick<AvisoDoOlhar, 'reajustavel' | 'recalibravel' | 'clareavel'>> = {},
  ): AvisoDoOlhar => ({ tom, titulo, detalhe, problema, reajustavel: false, recalibravel: false, ...extra });

  if (cameraError) {
    return aviso(
      'erro',
      'Não estou conseguindo usar a câmera',
      `${cameraError} Enquanto ela não volta, o olhar não aciona os botões.`,
      'camera',
    );
  }
  if (state === 'sem_camera') {
    // A câmera abriu, mas parou de entregar quadros (cabo solto, hub USB que
    // reiniciou, driver travado, notebook que dormiu). Antes o engine seguia
    // em `tracking` sem emitir nada, e a tela não dizia coisa alguma.
    return aviso(
      'erro',
      'A câmera parou de enviar imagem',
      'Estou tentando reconectar a câmera sozinho, e o olhar volta junto com ela. Se demorar, ' +
        'vale conferir se o cabo USB está firme e se nenhum outro programa está usando a câmera.',
      'camera',
    );
  }
  if (state === 'error') {
    return aviso(
      'erro',
      'O rastreamento do olhar parou por um momento',
      'Estou tentando recuperar sozinho — em geral é a placa de vídeo. Se não voltar em ' +
        'alguns minutos, feche e abra o IrisFlow.',
      'rastreamento_parado',
    );
  }
  if (avisoDeAcionamento) {
    // Erro: o olhar está sendo lido, mas não aciona nada — nem a Emergência.
    return aviso('erro', 'O acionamento pelo olhar falhou', avisoDeAcionamento, 'acionamento_falhou');
  }
  if (calibrationInvalidated) {
    return aviso(
      'erro',
      'A calibração deixou de valer',
      `${calibrationInvalidated} É preciso calibrar de novo antes de usar o olhar.`,
      null,
    );
  }
  if (avisoDeTela) {
    // 'aviso', não 'erro': nada foi perdido — a calibração volta sozinha quando
    // a janela voltar ao tamanho dela, e a Emergência continua funcionando.
    return aviso('aviso', 'O olhar está em modo reduzido', avisoDeTela, null);
  }
  if (avisoDeContraluz) {
    // Antes do rosto perdido e dos olhos fechados: sob contraluz o detector
    // perde o rosto e o EAR mente, e a causa das duas coisas é a luz. Dizer
    // "olhos fechados" aqui mandava a pessoa fazer a coisa errada.
    return aviso('aviso', 'Luz forte atrás de você', avisoDeContraluz, 'contraluz');
  }
  if (avisoDePoucaLuz) {
    // Antes do rosto perdido: no escuro o detector perde o rosto, e dizer
    // "não estou vendo seu rosto" não diz o que fazer — a causa é a luz.
    return aviso('aviso', 'Está escuro para a câmera', avisoDePoucaLuz, 'pouca_luz', { clareavel: true });
  }
  if (gazeLostMessage) {
    // acima do aviso de distância e abaixo dos erros de configuração.
    //
    // A ordem não é arbitrária: sem rosto na câmera, dizer que a distância
    // está diferente da calibração é responder a uma pergunta que ninguém
    // fez. E é 'aviso' e não 'erro' porque a situação se resolve sozinha
    // assim que a câmera volta a ver o rosto.
    return aviso(
      'aviso',
      gazeLostMessage,
      'O cursor volta sozinho assim que a câmera enxergar você. Se puder, fique de frente para a câmera.',
      'rosto_perdido',
    );
  }
  if (avisoDeOlhosFechados) {
    // Antes do aviso de borda: com o olho fechado a predição nem existe, então
    // falar da borda seria falar de um número que não foi medido neste quadro.
    return aviso('aviso', 'Não estou vendo bem os seus olhos', avisoDeOlhosFechados, 'olhos_fechados');
  }
  if (avisoDoModelo) {
    // O cursor continua (com a íris), só com a mira pior: 'aviso', depois do
    // que impede o uso e antes do que é só configuração.
    return aviso('aviso', avisoDoModelo.titulo, avisoDoModelo.detalhe, 'modelo_do_olhar');
  }
  if (avisoDeBorda) {
    // Depois da perda de rosto e antes do aviso de distância. Com o rosto
    // perdido, falar da borda seria errado — a posição na tela nem está sendo
    // medida. E é 'aviso', não 'erro': nada quebrou, e a saída está a um
    // movimento de olho de distância, que é o que a mensagem diz como fazer.
    return aviso('aviso', 'O cursor parou na borda', avisoDeBorda, null);
  }
  if (distanceAdvice) {
    // o tom é 'aviso', não 'erro': o sistema continua funcionando, só
    // com precisão pior que a medida na calibração. Tratar isso como erro
    // ensinaria o cuidador a ignorar banners vermelhos.
    // A compensação de distância continua corrigindo; o que sobra de erro é
    // deriva, e o reajuste rápido a corrige sem retreinar o modelo (ver
    // `distanceAdvisory.ts`). O aviso continua enquanto a distância for outra:
    // ele informa a posição, não o erro.
    return aviso('aviso', 'Distância diferente da calibração', distanceAdvice, null, { reajustavel: true });
  }
  if (avisoDePostura) {
    // Abaixo da distância: os dois pedem o mesmo reajuste, e quando os dois
    // valem ao mesmo tempo a distância é a causa mais provável e a mais fácil
    // de entender ("você está mais perto do que quando calibrou").
    return aviso(
      'aviso',
      'Postura diferente da calibração',
      'Você está há um tempo numa posição diferente da que calibrou. O cursor ' +
        `continua funcionando; um reajuste de ${reajuste.segundos} segundos deixa a mira no lugar.`,
      null,
      { reajustavel: true },
    );
  }
  if (avisoDeRecalibracao) {
    // Depois de distância e postura (que o reajuste rápido resolve) e antes
    // do aviso de câmera: é o vigia dizendo que o modelo deixou de descrever
    // a pessoa. 'aviso', não 'erro' — o cursor continua funcionando, só pior.
    return aviso(
      'aviso',
      'A mira piorou desde a última medição',
      detalheDoMotivo(avisoDeRecalibracao),
      null,
      { recalibravel: true },
    );
  }
  if (avisoDeCamera) {
    // Por último: é a situação mais benigna e a única que se resolve em
    // Configurações, não na cadeira. Só aparece quando a câmera mudou.
    return aviso('aviso', 'Câmera diferente da última sessão', avisoDeCamera, null);
  }
  return null;
}

/**
 * O problema que conta para o aviso ao cuidador — separado do que o banner
 * mostra (revisão de UX de 19/10/2026).
 *
 * O banner põe na frente avisos de CONFIGURAÇÃO (a calibração que deixou de
 * valer, a janela fora do tamanho), que não têm tipo. Usar a escolha do banner
 * aqui calava o aviso ao cuidador justamente quando o paciente fica sem nada —
 * a WebGPU caiu de madrugada, o modelo voltou em outro tamanho e a calibração
 * deixou de valer — e ainda dava o problema anterior por resolvido ("O olhar
 * voltou a funcionar"). Aqui vale o problema de RASTREAMENTO mais grave, pela
 * mesma ordem do banner; sem nenhum, a calibração que deixou de valer vira
 * `calibracao_perdida` (o rosto está na câmera, de olhos abertos, e nada
 * aciona).
 */
export function problemaPersistenteDoOlhar(
  e: EntradasDoAviso,
): { tipo: TipoDeProblemaDoRastreamento; mensagem: string } | null {
  const doRastreamento = escolherAvisoDoOlhar({ ...e, calibrationInvalidated: null, avisoDeTela: null });
  if (doRastreamento?.problema) {
    return { tipo: doRastreamento.problema, mensagem: juntarFrasesDoAviso(doRastreamento.titulo, doRastreamento.detalhe) };
  }
  if (e.avisoDeTela && e.suspensaoPeloRecorte && !e.calibrationInvalidated) {
    // A janela fora do tamanho volta sozinha (e quase sempre é alguém mexendo
    // no computador); a suspensão pelo recorte, não.
    return { tipo: 'olhar_reduzido', mensagem: juntarFrasesDoAviso('O olhar está em modo reduzido', e.avisoDeTela) };
  }
  if (e.calibrationInvalidated) {
    return {
      tipo: 'calibracao_perdida',
      mensagem: juntarFrasesDoAviso(
        'A calibração deixou de valer',
        `${e.calibrationInvalidated} É preciso calibrar de novo antes de usar o olhar.`,
      ),
    };
  }
  return null;
}

/** "Título. Detalhe" — sem dobrar a pontuação quando o título já termina com ela. */
function juntarFrasesDoAviso(titulo: string, detalhe: string): string {
  return /[.!?…]$/.test(titulo.trim()) ? `${titulo} ${detalhe}` : `${titulo}. ${detalhe}`;
}

export const GazeStatusBanner: React.FC<Props> = ({
  onReancorar = null,
  reancorando = false,
  onRecalibrar = null,
  onDispensarRecalibracao = null,
  onClarearTela = null,
  ...entradas
}) => {
  const reajuste = entradas.reajuste ?? REAJUSTE_NO_CENTRO;
  const escolhido = escolherAvisoDoOlhar(entradas);
  if (!escolhido) return null;
  const { tom, titulo, detalhe, reajustavel, recalibravel, clareavel } = escolhido;

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
        {clareavel && onClarearTela && (
          <button
            type="button"
            onClick={onClarearTela}
            data-testid="clarear-tela"
            // Dwellável, como o "Reajustar": quem precisa está usando o olhar.
            // Com o tamanho mínimo de alvo (5°) nos dois sentidos — revisão de
            // UX de 19/10/2026: com pouca luz a mira piora, e o botão fica na
            // borda de cima, onde ela já é pior.
            style={{
              flexShrink: 0, minWidth: Math.max(200, alvoMinimoPx()), minHeight: Math.max(72, alvoMinimoPx()),
              padding: '0.6rem 1.1rem', borderRadius: '0.7rem',
              border: `2px solid ${cores.fg}`, background: cores.fg, color: cores.bg,
              fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer',
            }}
          >
            Clarear a tela
          </button>
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
            {reancorando
              ? (reajuste.seguirPonto ? 'Siga o ponto…' : 'Olhe o centro…')
              : `Reajustar (${reajuste.segundos} s)`}
          </button>
        )}
      </div>
    </div>
  );
};
