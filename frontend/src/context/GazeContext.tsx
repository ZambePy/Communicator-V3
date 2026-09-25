import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createGazeEngine } from '@tracker/tracker/engine';
import type {
  GazeEngine,
  GazeSample,
  EngineState,
  CalibrationApi,
  L2CSStatus,
  RecordingApi,
  EngineDiagnostics,
} from '@tracker/tracker/engine';
import {
  stepDwell,
  createDwellState,
  DEFAULT_DWELL_CONFIG,
  type DwellTarget,
} from '@tracker/interaction/dwell';
import { velocidadeDaBorda, estadoInicialDeBorda } from '@tracker/interaction/edgeScroll';
import { rolarSobOOlhar } from '../rolarSobOOlhar';
import { estiloDoCursor, limitarTamanho } from '@tracker/interaction/cursorStyle';
import { geometriaDoAnel } from '@tracker/interaction/dwellRing';
import { GazeFallback } from '@tracker/interaction/gazeFallback';
import { SeguidorDeCursor } from '@tracker/interaction/seguidorDeCursor';
import {
  consultar as consultarVigia, dispensar as dispensarVigia, resolvido as vigiaResolvido,
  estadoInicialDoAviso, INTERVALO_DE_CONSULTA_MS, type EstadoDoAviso,
} from '@tracker/vigiaDeRecalibracao.aviso';
import type { MotivoDeRecalibracao } from '@tracker/vigiaDeRecalibracao';
import { DetectorDeOlharForaDaTela } from '@tracker/interaction/olharForaDaTela';
import { DetectorDeOlhosFechados } from '@tracker/interaction/olhosFechados';
import { preflight, podeComecar } from '@tracker/diagnostics/preflight';
import { cursorVisivelNoTeste } from '@tracker/accuracy';
import { rotaMostraCursor } from '../rotasComCursor';
import { stepBlinkClick, criarEstadoBlinkClick } from '@tracker/interaction/blinkClick';
import { GazeStatusBanner } from '../components/GazeStatusBanner';
import { ReancoragemOverlay, DURACAO_DO_REAJUSTE_MS } from '../components/ReancoragemOverlay';
import { ScanningMode } from '../components/ScanningMode';
import type { FilterPreset, FilterPresetV2 } from '@tracker/oneEuroFilter';
import { aprenderComSelecao, deveAprender } from '@tracker/interaction/correcaoPorDwell';
import { modoApresentacaoAtivo } from '../services/apresentacao';
import { emergenciaAtiva } from '../services/estadoDeEmergencia';
import { EXPERIMENT } from '@tracker/config/experiment';
import {
  planTuningStep,
  planStabilizationStep,
  type CameraCapabilities,
  type CameraState,
  type TuningStep,
} from '@tracker/cameraTuner';
import { getSaturacaoDoOlhar } from '@tracker/calibration';
import { detectFlicker, inferPowerLineHz } from '@tracker/flickerDetector';
import { AvisoDeDistancia } from '@tracker/distanceAdvisory';
import { useSettings } from './SettingsContext';
import { chaveDaCamera, resolverFovParaCamera } from '@tracker/camera/fovPorCamera';
import { isDevMode, onDevModeChange } from '../devMode';
import {
  sinalizarEstadoDoOlhar,
  limparEstadoDoOlhar,
  confirmarSelecao,
} from '../utils/feedbackVisual';
import { limitarDwellMs } from '../dwellMs';

export type {
  GazeEngine,
  GazeSample,
  EngineState,
  L2CSStatus,
  RecordingApi,
  EngineDiagnostics,
} from '@tracker/tracker/engine';

// Dwell time by user preset (matches DwellButton's own table).
// `DWELL_MS_BY_SPEED` morava aqui, convertendo o enum `dwellSpeed` em ms.
// O tempo de permanência passou a ser um número nas configurações — três
// degraus não cobrem a distância entre ELA avançada e boa fixação — e a
// conversão deixou de existir. Ver `dwellMs.ts`.
// Data-no-dwell="true" on any element that should opt out.
export const DWELL_SELECTOR = 'button, a, [role="button"], [role="link"]';

/**
 * O que continua acionável pelo olhar durante a calibração: a Emergência e o
 * CANCELAR da confirmação dela (`data-cancelar-emergencia`).
 */
export const SELETOR_DURANTE_CALIBRACAO = '[data-emergency="true"], [data-cancelar-emergencia="true"]';

/**
 * Suspensão do dwell do APP.
 *
 * No Modo Computador a janela do app fica escondida, mas o motor continua
 * emitindo (é ele que alimenta a sobreposição sobre o Windows) e este
 * dispatcher continuaria clicando nos botões da tela oculta — inclusive no
 * botão flutuante de emergência, que fica acima de qualquer escudo visual.
 * Com o dwell suspenso, nenhum alvo do app acumula; o clique por piscada
 * também para. É uma variável de módulo, não estado React: precisa valer no
 * mesmo frame em que o modo liga, sem esperar re-render.
 */
let dwellSuspenso = false;
export function suspenderDwell(suspenso: boolean): void {
  dwellSuspenso = suspenso;
}
export function dwellEstaSuspenso(): boolean {
  return dwellSuspenso;
}

interface GazeContextValue {
  subscribe: (cb: (sample: GazeSample) => void) => () => void;
  state: EngineState;
  l2csStatus: L2CSStatus;
  calibration: CalibrationApi;
  recording: RecordingApi;
  setFilterPreset: (preset: FilterPreset | FilterPresetV2) => void;
  getDiagnostics: () => EngineDiagnostics | null;
  /** Identidade da câmera aberta (chave + rótulo), para o FOV por câmera. */
  getCameraAtual: () => { chave: string | null; rotulo: string };
  /** Aviso sobre a câmera (FOV restaurado / voltou ao padrão); a UI mostra e limpa. */
  avisoDeCamera: string | null;
  limparAvisoDeCamera: () => void;
  /** Stream da webcam para telas que precisam mostrar o usuário a si mesmo.
   *  O `<video>` do engine fica com 2px e opacidade 0.01 (não pode ser
   *  display:none, senão o browser suspende o decoding), então a UI que quiser
   *  exibir precisa criar o próprio elemento e apontar para o MESMO `srcObject`
   *  — não abrir uma segunda captura, que muitos drivers recusam e que
   *  dobraria o custo de decode. */
  getCameraStream: () => MediaStream | null;
  /** Resultado do ajuste automático da câmera. `null` enquanto não rodou.
   *  Consumido pela pré-calibração para dizer ao cuidador o que o software já
   *  resolveu e o que ainda exige ação física. */
  getCameraTuning: () => TuningStep | null;
  /** Mensagem acionável quando a câmera não pôde ser aberta. `null` no caminho
   *  feliz. Existe porque a falha era só um `console.error`: o app ficava
   *  parado sem rastrear e sem dizer por quê — num software assistivo, quem
   *  está na frente da tela não tem como abrir o DevTools. */
  cameraError: string | null;
  /** Preenchido quando o pipeline mudou sob um perfil salvo e o modelo foi
   *  descartado. Sem isto o app ia para `degraded` em silêncio: cursor no
   *  fallback do nariz, sem dizer que a saída era recalibrar. */
  calibrationInvalidated: string | null;
  // Tempo em ms desde o start bem-sucedido do engine. 0 antes do start.
  // Consumido pelo relatório pós-calibração para preencher o campo
  // `minutosDeSessao` em vez de hardcode 0.
  getSessionUptimeMs: () => number;
  isDwelling: boolean;
  isComposing: boolean;
  setIsComposing: (val: boolean) => void;
  isDegraded: boolean;
  /**
   * Mensagem quando o gaze está perdido além do hold, ou `null`.
   *
   * Só existe com a flag `gazeLostFallback` ligada. Sem ela o comportamento
   * continua o de sempre: cursor congelado a 35% de opacidade, sem aviso.
   */
  gazeLostMessage: string | null;
  /**
   * Reajuste rápido (alvo único de 2 s) em curso. O `EmergencyProvider` lê
   * isto para pôr o botão de Emergência POR CIMA do alvo preto do reajuste —
   * ele nunca pode sumir, nem por 2 segundos.
   */
  reancorando: boolean;
  /**
   * Interrompe o reajuste em curso e DESCARTA o que ele colheu (nada é
   * aplicado às referências). Sem reajuste em curso, não faz nada. Quem chama:
   * a Emergência — escolhida durante o reajuste, ela o cancela e segue o fluxo
   * normal.
   */
  cancelarReancoragem: () => void;
}

const GazeContext = createContext<GazeContextValue | null>(null);

/**
 * Propriedades do cursor cujo último valor escrito é memorizado.
 *
 * `anelVisivel` não é do cursor: é a opacidade do `<svg>` do anel de
 * progresso, que mora ao lado dele e sofria do mesmo problema.
 */
interface EstiloDeCursorEmCache {
  transform: string;
  background: string;
  boxShadow: string;
  border: string;
  opacity: string;
  anelVisivel: string;
}

const NOME_CSS: Record<keyof Omit<EstiloDeCursorEmCache, 'anelVisivel'>, string> = {
  transform: 'transform',
  background: 'background',
  boxShadow: 'box-shadow',
  border: 'border',
  opacity: 'opacity',
};

/**
 * Escreve uma propriedade do cursor SÓ quando ela mudou.
 *
 * Chamada a 30 Hz. Uma comparação de string por propriedade compra: nenhum
 * reparse do `box-shadow` de três camadas, nenhuma invalidação de caixa pelo
 * `border`, e — a que mais pesava — nenhum reinício por quadro da transição
 * `background 120ms` enquanto o dwell enche.
 */
function escreverNoCursor(
  el: HTMLElement,
  cache: EstiloDeCursorEmCache,
  prop: keyof Omit<EstiloDeCursorEmCache, 'anelVisivel'>,
  valor: string
): void {
  if (cache[prop] === valor) return;
  cache[prop] = valor;
  // `setProperty` com string vazia REMOVE a propriedade, que é exatamente o
  // que `el.style.border = ''` fazia antes.
  if (valor === '') el.style.removeProperty(NOME_CSS[prop]);
  else el.style.setProperty(NOME_CSS[prop], valor);
}

/** Esconde o cursor sem tocar em nada que já esteja no valor certo. */
function esconderCursor(el: HTMLElement, cache: EstiloDeCursorEmCache): void {
  escreverNoCursor(el, cache, 'transform', 'translate3d(-9999px,-9999px,0)');
  escreverNoCursor(el, cache, 'opacity', '0');
}

export const useGaze = (): GazeContextValue => {
  const ctx = useContext(GazeContext);
  if (!ctx) throw new Error('useGaze must be used inside <GazeProvider>');
  return ctx;
};

/**
 * Contexto separado só para `isDwelling`.
 *
 * O valor alterna várias vezes por segundo no teclado ocular (teclas vizinhas
 * + jitter do cursor). Se entrasse nas deps do `useMemo` do contexto
 * principal, cada alternância re-renderizaria todos os consumidores de
 * `useGaze()` — e só o teclado lê o campo.
 */
const DwellContext = createContext<boolean>(false);

/**
 * Estado de dwell em curso. Use este hook em vez de `useGaze().isDwelling`
 * quando só o dwell interessar — assinar o contexto principal para ler este
 * campo faz o componente re-renderizar a cada mudança de estado do engine.
 */
export const useIsDwelling = (): boolean => useContext(DwellContext);

/**
 * Abre a câmera tentando resoluções em ordem decrescente.
 *
 * POR QUE UMA ESCADA E NÃO UM PEDIDO SÓ
 *
 * O pipeline quer 1080p: o sinal útil é o deslocamento da íris no frame, e ele
 * escala com a densidade de pixels sobre o olho (ver o comentário de
 * `cameraTuner.ts`). Mas pedir 1080p e desistir se falhar deixa o usuário sem
 * rastreamento nenhum — e para software assistivo isso é pior que rastrear com
 * menos precisão.
 *
 * Duas armadilhas que a escada evita:
 *
 *   • `min` é constraint DURA. `width: { min: 640 }` faz o browser recusar a
 *     câmera inteira se ela não puder garantir o mínimo, com
 *     OverconstrainedError. A primeira tentativa aqui usa só `ideal`, que
 *     negocia em vez de falhar.
 *   • Alguns drivers do Windows anunciam 1080p mas não conseguem INICIAR nesse
 *     modo, e o Chrome reporta isso como `NotReadableError` — o mesmo erro de
 *     "câmera em uso por outro app". Sem tentar uma resolução menor não dá para
 *     distinguir os dois casos.
 */
async function openCameraWithFallback(): Promise<MediaStream> {
  const tentativas: { rotulo: string; constraints: MediaStreamConstraints }[] = [
    {
      rotulo: '1920×1080',
      constraints: {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: 'user',
          frameRate: { ideal: 30 },
        },
      },
    },
    {
      rotulo: '1280×720',
      constraints: {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          frameRate: { ideal: 30 },
        },
      },
    },
    // Última tentativa sem nenhuma preferência: se a câmera abrir de algum
    // jeito, o rastreamento roda (pior, mas roda). O ajuste automático tenta
    // subir a resolução depois, já com as capabilities em mãos.
    { rotulo: 'padrão da câmera', constraints: { video: true } },
  ];

  let ultimoErro: unknown = null;
  for (const { rotulo, constraints } of tentativas) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const t = stream.getVideoTracks()[0]?.getSettings();
      console.log(
        `[IrisFlow] câmera aberta (pedido: ${rotulo}) → ${t?.width}×${t?.height} @ ${t?.frameRate ?? '?'}fps`
      );
      return stream;
    } catch (e) {
      ultimoErro = e;
      const nome = (e as DOMException)?.name ?? 'Error';
      // Permissão negada não melhora tentando outra resolução — abortar já
      // evita três diálogos seguidos na cara do usuário.
      if (nome === 'NotAllowedError' || nome === 'SecurityError') break;
      console.warn(`[IrisFlow] tentativa "${rotulo}" falhou (${nome}); tentando resolução menor…`);
    }
  }

  const nome = (ultimoErro as DOMException)?.name ?? 'Error';
  const causa =
    nome === 'NotAllowedError' || nome === 'SecurityError'
      ? 'Permissão de câmera negada. Autorize o acesso nas configurações do navegador e recarregue.'
      : nome === 'NotFoundError' || nome === 'DevicesNotFoundError'
        ? 'Nenhuma câmera encontrada. Conecte a webcam e recarregue.'
        : nome === 'NotReadableError' || nome === 'TrackStartError'
          ? 'A câmera existe mas não pôde ser iniciada — quase sempre porque OUTRO PROGRAMA está usando ela ' +
            '(OBS, Teams, Zoom, Meet, ou outra aba deste navegador). Feche o outro programa e recarregue.'
          : nome === 'OverconstrainedError'
            ? 'A câmera não suporta nenhum dos formatos solicitados.'
            : `Falha ao abrir a câmera (${nome}).`;

  console.error(`[IrisFlow] ${causa}`);
  throw new Error(causa, { cause: ultimoErro });
}

/**
 * Guard de instância única do provider.
 *
 * Precisa ser de MÓDULO, não um ref: o cleanup zera `engineRef.current`, então
 * no segundo mount do StrictMode um guard baseado no ref não barraria nada e
 * nasceria um segundo engine com um segundo `getUserMedia`.
 */
let provedorAtivo = 0;

export const GazeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings, updateSettings } = useSettings();
  // Os hooks de console e o boot leem as configurações fora do ciclo de render;
  // o ref garante que vejam o valor atual, não o do primeiro render.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Mesma razão do `settingsRef`: o boot roda fora do ciclo de render e não
  // pode entrar na lista de dependências por causa de uma função de contexto.
  const updateSettingsRef = useRef(updateSettings);
  updateSettingsRef.current = updateSettings;
  const engineRef = useRef<GazeEngine | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Stream da câmera, guardada assim que `getUserMedia` resolve. Se o cleanup
  // rodar durante o await, `video.srcObject` ainda é null — este ref é o que
  // garante que as tracks sejam paradas mesmo assim.
  const streamRef = useRef<MediaStream | null>(null);
  /** Identidade da câmera aberta nesta sessão (para o FOV por câmera). */
  const cameraAtualRef = useRef<{ chave: string | null; rotulo: string }>({
    chave: null,
    rotulo: '',
  });
  const [avisoDeCamera, setAvisoDeCamera] = useState<string | null>(null);
  // O aviso é de configuração, não de operação: some sozinho depois de um
  // tempo de leitura, para não competir com os avisos que pedem ação agora.
  useEffect(() => {
    if (!avisoDeCamera) return;
    const id = setTimeout(() => setAvisoDeCamera(null), 20_000);
    return () => clearTimeout(id);
  }, [avisoDeCamera]);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<EngineState>('idle');
  const [l2csStatus, setL2csStatus] = useState<L2CSStatus>('loading');
  const [isDwelling, setIsDwelling] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  /** Aviso de distância fora da faixa de calibração. */
  const [distanceAdvice, setDistanceAdvice] = useState<string | null>(null);
  const avisoDistanciaRef = useRef(new AvisoDeDistancia());
  /** A referência lenta está parada há tempo demais por postura diferente. */
  const [avisoDePostura, setAvisoDePostura] = useState(false);
  /**
   * Vigia de recalibração: o motivo em exibição (`null` = nada). O vigia
   * existia no engine e ninguém o consultava — "os nove pontos só são pedidos
   * quando o modelo deixou de descrever a pessoa" era verdade só no papel.
   * A política de exibição (duas consultas seguidas, soneca de 10 min) é a de
   * `vigiaDeRecalibracao.aviso.ts`; aqui só há o relógio e o estado.
   */
  const [avisoDeRecalibracao, setAvisoDeRecalibracao] = useState<MotivoDeRecalibracao>(null);
  const vigiaRef = useRef<EstadoDoAviso>(estadoInicialDoAviso());
  /** Reajuste rápido (alvo único de 2 s) em curso. */
  const [reancorando, setReancorando] = useState(false);
  const [calibrationInvalidated, setCalibrationInvalidated] = useState<string | null>(null);
  const isDegradedRef = useRef(false);
  const wasDwellingRef = useRef(false);

  // Sub pool: subscribers can hook in and receive callbacks. We keep the callback
  // model instead of React state to avoid re-rendering the tree at 30 Hz.
  const subscribersRef = useRef<Set<(s: GazeSample) => void>>(new Set());
  const cameraTuningRef = useRef<TuningStep | null>(null);
  // Estado da câmera antes de qualquer ajuste nosso, para restaurar ao sair.
  const originalCameraSettingsRef = useRef<Record<string, number | string> | null>(null);

  // Global dwell dispatcher state. Kept in refs to avoid re-renders — the loop
  // runs at 30 Hz and reads/writes these directly from the gaze callback.
  const dwellMsRef = useRef<number>(limitarDwellMs(settings.dwellMs));
  // Todo o estado do dwell vive num único objeto imutável, avançado pelo
  // redutor puro de `src/interaction/dwell.ts`. Refs soltos mutados em pontos
  // diferentes do callback saem de sincronia (dwell completando de olho fechado).
  const dwellStateRef = useRef(createDwellState());
  /** Estado da rolagem por borda: em qual faixa o olhar está e desde quando. */
  const bordaRef = useRef(estadoInicialDeBorda());
  /** Instante da última amostra, para converter velocidade em deslocamento. */
  const ultimaRolagemMsRef = useRef(0);
  // Gaze perdido: segura a última posição válida por 2 s, depois esconde e avisa.
  const fallbackRef = useRef(new GazeFallback());
  const [gazeLostMessage, setGazeLostMessage] = useState<string | null>(null);
  const gazeLostMessageRef = useRef<string | null>(null);

  // Cursor parado na borda porque o olhar saiu da área da tela. Estado
  // separado do `gazeLostMessage`: são sintomas parecidos na tela e causas
  // opostas — ali o rosto sumiu, aqui o rosto está presente e o olhar está
  // fora do monitor.
  const foraDaTelaRef = useRef(new DetectorDeOlharForaDaTela());
  const [avisoDeBorda, setAvisoDeBorda] = useState<string | null>(null);
  const avisoDeBordaRef = useRef<string | null>(null);

  // Pálpebra cobrindo a íris (o caso de olhar para baixo) ou olhos fechados
  // por tempo demais: o cursor congela com o rosto presente e o dwell pausa,
  // tudo correto e tudo silencioso.
  const olhosFechadosRef = useRef(new DetectorDeOlhosFechados());
  const [avisoDeOlhosFechados, setAvisoDeOlhosFechados] = useState<string | null>(null);
  const avisoDeOlhosFechadosRef = useRef<string | null>(null);
  // O `<circle>` do anel de progresso, quando a flag está ligada.
  const anelRef = useRef<SVGCircleElement | null>(null);
  /**
   * Último valor ESCRITO em cada propriedade não-geométrica do cursor.
   *
   * O caminho quente roda a 30 Hz. `transform` muda a cada amostra e precisa
   * ser escrito a cada amostra; `background`, `box-shadow`, `border` e
   * `opacity` mudam só em transição de estado — mas eram escritos junto,
   * sempre. Custava três coisas: o `box-shadow` (três sombras, uma com blur)
   * era reparseado e repintado 30×/s, o `border` invalidava a caixa do
   * elemento 30×/s, e — a pior — a transição `background 120ms` do cursor era
   * REINICIADA a cada quadro durante o dwell, porque a cor muda com o
   * progresso: uma transição que nunca termina e repinta sem parar.
   *
   * Comparar com o último valor escrito custa uma comparação de string e
   * elimina as três.
   */
  const ultimoEstiloDoCursorRef = useRef<EstiloDeCursorEmCache>({
    transform: '',
    background: '',
    boxShadow: '',
    border: '',
    opacity: '',
    anelVisivel: '',
  });
  /**
   * Seguidor que separa a taxa de RENDER da taxa de INFERÊNCIA.
   *
   * Antes daqui, o `transform` do cursor era escrito uma única vez por quadro
   * de câmera, síncrono, dentro do callback do engine. A taxa visual do cursor
   * era portanto a taxa da câmera (~21 Hz medidos), não a do display: ~65 % dos
   * quadros de tela não mudavam nada, e quando mudavam recebiam o passo inteiro
   * de uma vez. É essa distribuição — e não a taxa — que o usuário lê como
   * "travada": nas gravações, 11,8 % dos quadros tinham salto > 30 px contra
   * 0,9 % numa build anterior, com a MESMA taxa efetiva.
   *
   * O seguidor não filtra e não inventa dado: ele distribui pelos quadros de
   * display o passo que o pipeline já decidiu, e para de se mexer quando a
   * fonte seca. Ver `seguidorDeCursor.ts` para o custo em latência e por que
   * ele é aceitável numa interface de dwell.
   */
  const seguidorRef = useRef(new SeguidorDeCursor());
  /**
   * O que pintar no próximo quadro de display. Escrito pelo callback do engine
   * (taxa de amostra), lido pelo laço de render (taxa de display).
   */
  const pinturaRef = useRef<{
    escondido: boolean;
    background: string;
    boxShadow: string;
    border: string;
    opacity: string;
    escala: number;
    offsetPx: number;
    tamanhoPx: number;
    /** `null` quando não há alvo sob o olhar: o anel some. */
    anel: { dwellPct: number } | null;
  }>({
    escondido: true,
    background: '',
    boxShadow: '',
    border: '',
    opacity: '0',
    escala: 1,
    offsetPx: 0,
    tamanhoPx: 0,
    anel: null,
  });
  // Piscada como clique. Desligada por default; ver a flag.
  const blinkClickRef = useRef(criarEstadoBlinkClick());
  // Nó que está com o realce `gaze-hover` aplicado no DOM.
  const hoveredNodeRef = useRef<HTMLElement | null>(null);

  /** Remove realce e barra de progresso do nó atualmente destacado. */
  const clearDwellVisuals = React.useCallback(() => {
    const n = hoveredNodeRef.current;
    if (n) {
      n.classList.remove('gaze-hover');
      n.style.removeProperty('--gaze-dwell-progress');
    }
    hoveredNodeRef.current = null;
  }, []);

  useEffect(() => {
    dwellMsRef.current = limitarDwellMs(settings.dwellMs);
  }, [settings.dwellMs]);

  // Propaga a dominância ocular do usuário ao pipeline. Feito num useEffect
  // separado para reagir a mudanças em tempo real (SettingsScreen troca
  // sem recarregar). Se o engine ainda não montou, fica pendente até o
  // primeiro chamado — o próprio calibration guarda o valor em módulo.
  useEffect(() => {
    engineRef.current?.calibration.setEyeDominance?.(settings.eyeDominance);
  }, [settings.eyeDominance]);

  // Geometria da tela para os filtros que trabalham em graus. Também é
  // reaplicada quando o engine sobe (ver o boot), porque este efeito pode
  // rodar antes de `createGazeEngine`.
  useEffect(() => {
    engineRef.current?.setScreenGeometry(settings.screenDiagonalIn, settings.viewingDistanceCm);
  }, [settings.screenDiagonalIn, settings.viewingDistanceCm]);

  // O campo de visão habilita a compensação de distância: sem ele o pipeline
  // não converte tamanho de rosto em centímetros e a compensação fica inativa.
  // Propagado em efeito próprio para reagir à calibração de FOV feita em
  // configurações sem exigir recarregar.
  useEffect(() => {
    engineRef.current?.calibration.setCameraFovDeg?.(settings.cameraHorizontalFovDeg);
  }, [settings.cameraHorizontalFovDeg]);

  const subscribe = useCallback((cb: (s: GazeSample) => void) => {
    subscribersRef.current.add(cb);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  /**
   * Ajuste automático da câmera em malha fechada.
   *
   * O pipeline já mede o tamanho do rosto no frame a cada quadro. Em vez de
   * pedir ao cuidador que configure zoom e brilho no painel do Windows — onde
   * ele não sabe qual valor serve, e o valor certo muda com a distância em que
   * o paciente sentou hoje — o programa mede, ajusta, mede de novo.
   *
   * A política de decisão está em `@tracker/cameraTuner` (puro e testado).
   * Aqui só ficam os efeitos: ler capabilities, aplicar constraints, esperar
   * o driver assentar. `applyConstraints` pode rejeitar o lote inteiro se
   * qualquer chave for inválida, então cada passo vai isolado num try.
   */
  const autoTuneCamera = useCallback(
    async (stream: MediaStream, engine: GazeEngine, isCancelled: () => boolean): Promise<void> => {
      const track = stream.getVideoTracks()[0];
      if (!track || typeof track.getCapabilities !== 'function') return;

      let rawCaps: Record<string, unknown> = {};
      try {
        rawCaps = track.getCapabilities() as unknown as Record<string, unknown>;
      } catch {
        return;
      }

      // Fotografa o estado original antes de mexer: `applyConstraints` altera o
      // dispositivo, não só a nossa view dele — em vários drivers o zoom e o
      // brilho que deixamos aqui aparecem no Teams depois. Devolvemos ao sair.
      try {
        const st = track.getSettings() as unknown as Record<string, unknown>;
        const keys = [
          'zoom',
          'brightness',
          'contrast',
          'exposureMode',
          'whiteBalanceMode',
          'focusMode',
          'powerLineFrequency',
        ];
        const snap: Record<string, number | string> = {};
        for (const k of keys) {
          const v = st[k];
          if (typeof v === 'number' || typeof v === 'string') snap[k] = v;
        }
        originalCameraSettingsRef.current = snap;
        console.log('[camera] estado original da câmera guardado para restauração:', snap);
      } catch {
        /* getSettings indisponível: não há o que restaurar */
      }

      // Usa a MAIOR resolução que a câmera oferece, até o teto.
      //
      // O `getUserMedia` pede 1920×1080 como `ideal`, mas o browser negocia e
      // pode entregar menos. Aqui, já com as capabilities na mão, sabemos o
      // máximo real e pedimos explicitamente.
      //
      // Teto em 1920: o custo do FaceLandmarker cresce com o número de pixels e
      // o loop precisa sustentar 30 fps. Acima disso trocaríamos precisão de
      // landmark por frames perdidos — e frame perdido também é erro.
      const MAX_USEFUL_WIDTH = 1920;
      // Abaixo disto o ganho de pixels não paga o que se perde em cadência.
      // Um quadro de 1080p a 15 Hz dá ao olhar UMA medida a cada 67 ms; um de
      // 720p a 30 Hz dá duas. Para dwell e sacada a cadência vale mais, e a
      // resolução do CROP do olho já está saturada bem antes de 1080p.
      const FPS_MINIMO_ACEITAVEL = 24;
      const wCap = rawCaps.width as { max?: number } | undefined;
      const hCap = rawCaps.height as { max?: number } | undefined;
      if (typeof wCap?.max === 'number' && typeof hCap?.max === 'number') {
        const antes = track.getSettings();
        const cur = antes.width ?? 0;
        const curH = antes.height ?? 0;
        const fpsAntes = typeof antes.frameRate === 'number' ? antes.frameRate : null;
        const targetW = Math.min(wCap.max, MAX_USEFUL_WIDTH);
        if (targetW > cur) {
          const targetH = Math.round((targetW * hCap.max) / wCap.max);
          try {
            // `frameRate` RE-DECLARADO aqui, e não por simetria: o
            // `applyConstraints` SUBSTITUI o conjunto de constraints da track.
            // O `frameRate: { ideal: 30 }` pedido no `getUserMedia` sumia
            // neste ponto, e a câmera ficava livre para entregar a cadência
            // que o modo de maior resolução oferecesse — que em boa parte das
            // webcams UVC é 15 fps a 1080p contra 30 a 720p. É a explicação
            // mais simples para os ~21 Hz efetivos medidos nas gravações.
            await track.applyConstraints({
              width: { ideal: targetW },
              height: { ideal: targetH },
              frameRate: { ideal: 30 },
            });
            const depois = track.getSettings();
            const fpsDepois = typeof depois.frameRate === 'number' ? depois.frameRate : null;
            console.log(
              `[camera] resolução ${cur} → ${depois.width} (máx do driver: ${wCap.max}); ` +
                `cadência ${fpsAntes ?? '?'} → ${fpsDepois ?? '?'} fps`
            );

            // A resolução maior custou cadência: desfaz. Mais pixels num
            // quadro que chega menos vezes é um mau negócio para o olhar, e
            // pior ainda porque o custo aparece como "o cursor travando" —
            // que é justamente o que não se quer trocar por nitidez.
            if (fpsDepois !== null && fpsDepois < FPS_MINIMO_ACEITAVEL
                && (fpsAntes === null || fpsDepois < fpsAntes) && cur > 0 && curH > 0) {
              try {
                await track.applyConstraints({
                  width: { ideal: cur },
                  height: { ideal: curH },
                  frameRate: { ideal: 30 },
                });
                const revertido = track.getSettings();
                console.warn(
                  `[camera] ${depois.width}×${depois.height} só entrega ${fpsDepois} fps; ` +
                    `voltando para ${revertido.width}×${revertido.height} @ ` +
                    `${revertido.frameRate ?? '?'} fps — cadência vale mais que pixels aqui.`
                );
              } catch (e2) {
                console.warn('[camera] não foi possível voltar à resolução anterior:', e2);
              }
            }
          } catch (e) {
            console.warn('[camera] não foi possível subir a resolução:', e);
          }
        }
        if (wCap.max > MAX_USEFUL_WIDTH) {
          console.log(
            `[camera] câmera suporta até ${wCap.max}px de largura; usando ${MAX_USEFUL_WIDTH} ` +
              `para o FaceLandmarker sustentar 30 fps.`
          );
        }
      }
      const asRange = (v: unknown) =>
        v && typeof v === 'object' && 'min' in (v as object) && 'max' in (v as object)
          ? (v as { min: number; max: number; step?: number })
          : undefined;
      const caps: CameraCapabilities = {
        zoom: asRange(rawCaps.zoom),
        brightness: asRange(rawCaps.brightness),
        contrast: asRange(rawCaps.contrast),
        exposureMode: Array.isArray(rawCaps.exposureMode)
          ? (rawCaps.exposureMode as string[])
          : undefined,
        focusMode: Array.isArray(rawCaps.focusMode) ? (rawCaps.focusMode as string[]) : undefined,
        whiteBalanceMode: Array.isArray(rawCaps.whiteBalanceMode)
          ? (rawCaps.whiteBalanceMode as string[])
          : undefined,
        powerLineFrequency: Array.isArray(rawCaps.powerLineFrequency)
          ? (rawCaps.powerLineFrequency as number[])
          : undefined,
      };
      console.log('[camera] capabilities da câmera:', {
        zoom: caps.zoom,
        brightness: caps.brightness,
        exposureMode: caps.exposureMode,
        whiteBalanceMode: caps.whiteBalanceMode,
      });

      const settle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      // O auto-exposure precisa de ~2 s para convergir; medir antes disso
      // ajustaria o brilho contra um valor que ainda está mudando sozinho.
      await settle(2000);

      const MAX_ITER = 14;
      let ultimoBrilho: number | undefined;
      for (let i = 0; i < MAX_ITER; i++) {
        if (isCancelled()) return;
        const d = engine.getDiagnostics();
        if (!d) {
          await settle(300);
          continue;
        }

        const iodFraction = d.video.width > 0 ? d.framing.iodPx / d.video.width : 0;
        let state: CameraState = {};
        try {
          const st = track.getSettings() as unknown as Record<string, unknown>;
          state = {
            zoom: typeof st.zoom === 'number' ? st.zoom : undefined,
            brightness: typeof st.brightness === 'number' ? st.brightness : undefined,
            contrast: typeof st.contrast === 'number' ? st.contrast : undefined,
          };
        } catch {
          /* getSettings indisponível: o planner usa os defaults da faixa */
        }

        const step = planTuningStep(caps, state, {
          hasFace: d.framing.hasFace,
          iodFraction,
          brightness: d.quality.brightness,
          contrast: d.quality.contrast,
        });
        cameraTuningRef.current = step;
        ultimoBrilho = d.quality.brightness;

        if (step.converged || Object.keys(step.constraints).length === 0) {
          if (step.reasons.length) console.log('[camera]', step.reasons.join(' | '));
          if (step.physicalAdvice)
            console.warn('[camera] ação física necessária:', step.physicalAdvice);
          break;
        }

        console.log('[camera]', step.reasons.join(' | '));
        try {
          await track.applyConstraints(step.constraints as MediaTrackConstraints);
        } catch (e) {
          // Driver recusou. Insistir na mesma constraint só gastaria iterações.
          console.warn('[camera] applyConstraints rejeitado, ajuste interrompido:', e);
          break;
        }
        await settle(450);
      }

      if (isCancelled()) return;
      // Cintilação: mede a série de brilho na cadência de frame e, se houver
      // batimento compatível com 50/60 Hz, corrige na origem pelo driver.
      let powerLineHz: 50 | 60 | null = null;
      const dFinal = engine.getDiagnostics();
      if (dFinal && dFinal.brightnessHistoryFps > 0) {
        const flick = detectFlicker(dFinal.brightnessHistory, dFinal.brightnessHistoryFps);
        if (flick.detected) {
          powerLineHz = inferPowerLineHz(flick.dominantHz, dFinal.brightnessHistoryFps);
          console.warn(
            `[camera] cintilação de ${flick.dominantHz.toFixed(1)} Hz ` +
              `(${(flick.relativeAmplitude * 100).toFixed(1)}% do brilho)` +
              (powerLineHz ? ` → rede de ${powerLineHz} Hz` : ' → origem não elétrica')
          );
        }
      }

      // Travar exposição/balanço/foco só faz sentido com a IMAGEM BOA: travar
      // uma imagem escura porque o zoom bateu no limite congelaria o problema
      // pelo resto da sessão. Sem brilho medido, a exposição segue automática.
      //
      // Convergir NÃO é exigido, de propósito: `converged` já implica brilho em
      // [0,37; 0,53] ⊂ [0,25; 0,75], então "convergiu OU imagem boa" era
      // exatamente "imagem boa" — só que escrito de um jeito que fazia parecer
      // que a convergência era necessária (o README chegou a dizer isso). Uma
      // sessão que sai do laço sem convergir (zoom no limite, driver recusando
      // `applyConstraints`) mas com brilho bom trava do mesmo jeito, e é o
      // comportamento certo: o que se quer congelar é a exposição boa.
      const imagemBoa =
        typeof ultimoBrilho === 'number' && ultimoBrilho >= 0.25 && ultimoBrilho <= 0.75;
      const stab = planStabilizationStep(caps, powerLineHz);
      const constraints: Record<string, unknown> = {};
      if (stab.constraints.powerLineFrequency !== undefined) {
        constraints.powerLineFrequency = stab.constraints.powerLineFrequency;
      }
      if (imagemBoa) {
        for (const k of ['exposureMode', 'whiteBalanceMode', 'focusMode'] as const) {
          if (stab.constraints[k] !== undefined) constraints[k] = stab.constraints[k];
        }
      } else if (ultimoBrilho !== undefined) {
        console.log(
          `[camera] brilho ${ultimoBrilho.toFixed(2)} fora da faixa — exposição segue automática.`
        );
      }
      if (Object.keys(constraints).length > 0) {
        try {
          await track.applyConstraints(constraints as MediaTrackConstraints);
          console.log(
            '[camera] estabilização:',
            Object.entries(constraints)
              .map(([k, v]) => `${k} → ${v}`)
              .join(' | ')
          );
        } catch (e) {
          console.warn('[camera] estabilização rejeitada (exposição segue automática):', e);
        }
      } else if (stab.physicalAdvice) {
        console.warn('[camera]', stab.physicalAdvice);
      }
    },
    []
  );

  useEffect(() => {
    // React StrictMode em dev roda useEffect duas vezes (mount → cleanup → mount).
    // getUserMedia + FaceLandmarker são caros e mantêm estado global (module-scope
    // da calibração), então travamos a segunda inicialização. Em produção o guard
    // é inofensivo — StrictMode não faz double-invoke fora de dev.
    // Ver `provedorAtivo` para o motivo de ser um contador de módulo.
    if (provedorAtivo > 0) {
      // Este provider fica sem engine: toda chamada de calibração vira no-op.
      // Silenciar isso deixava o app vivo por fora e morto por dentro — a tela
      // de calibração esperando um callback que nunca chegaria. Falha visível.
      console.error('[IrisFlow] GazeProvider duplicado — este provider fica sem engine.');
      setCameraError(
        'O rastreamento não pôde iniciar porque já existe outra instância ativa. ' +
          'Feche as outras janelas do app e recarregue.'
      );
      return;
    }
    provedorAtivo++;

    let cancelled = false;

    const engine = createGazeEngine();
    engineRef.current = engine;

    // Os efeitos de `eyeDominance` e `cameraHorizontalFovDeg` acima rodam
    // ANTES deste (ordem de declaração), quando `engineRef` ainda é null: sem
    // esta aplicação inicial, um FOV calibrado e salvo só voltaria a valer
    // quando o cuidador o alterasse — e sem FOV a compensação de distância
    // e o aviso de distância ficam inativos em silêncio.
    engine.calibration.setEyeDominance(settingsRef.current.eyeDominance);
    engine.calibration.setCameraFovDeg(settingsRef.current.cameraHorizontalFovDeg);

    // Cursor DOM node — direct writes via ref, no React state.
    // transform-origin: center lets scale() grow around the cursor's centre
    // (used by the dwell dispatcher for visual feedback) without breaking
    // the translate3d positioning.
    // O diâmetro vem da flag. `limitarTamanho` prende à faixa em vez de
    // rejeitar: um valor corrompido não pode deixar o paciente sem cursor, que
    // é justamente o que ele usaria para chegar às configurações e consertá-lo.
    const tamanhoCursor = limitarTamanho(EXPERIMENT.cursorSizePx);

    const cursor = document.createElement('div');
    cursor.setAttribute('aria-hidden', 'true');
    cursor.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      `width:${tamanhoCursor}px`,
      `height:${tamanhoCursor}px`,
      'border-radius:50%',
      'background:rgba(239,68,68,0.6)',
      'box-shadow:0 0 16px rgba(255,0,0,0.9)',
      'pointer-events:none',
      'z-index:9999',
      'transform:translate3d(-9999px,-9999px,0)',
      'transform-origin:center center',
      // `transform` e `opacity` são as duas propriedades que o compositor
      // anima sozinho. `background` estava aqui e não é uma delas: a dica não
      // promovia nada e ainda pedia uma camada a mais ao navegador.
      'will-change:transform, opacity',
      // A transição de `background` SAIU. A cor do cursor muda com o
      // progresso do dwell, ou seja, a cada amostra: a 30 Hz a transição de
      // 120 ms era reiniciada antes de chegar à metade, e o resultado era
      // repintura contínua sem nenhum ganho visual — a cor já varia suave
      // porque o próprio valor varia suave.
      'transition:opacity 600ms ease 300ms',
      'opacity:0',
    ].join(';');
    document.body.appendChild(cursor);
    cursorRef.current = cursor;

    // Anel de progresso ao redor do cursor. Complementa a barra no alvo: alvos
    // pequenos escondem o próprio progresso debaixo do cursor, e o anel fica
    // sempre onde a fóvea está — ler um indicador fora dela exigiria um
    // sacádico, que cancelaria o dwell.
    if (EXPERIMENT.dwellRingOnCursor) {
      const g = geometriaDoAnel(tamanhoCursor, 0);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('viewBox', `0 0 ${g.lado} ${g.lado}`);
      svg.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        `width:${g.lado}px`,
        `height:${g.lado}px`,
        'pointer-events:none',
        'z-index:9998',
        'transform:translate3d(-9999px,-9999px,0)',
        'opacity:0',
      ].join(';');
      const circulo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circulo.setAttribute('cx', String(g.centro));
      circulo.setAttribute('cy', String(g.centro));
      circulo.setAttribute('r', String(g.raio));
      circulo.setAttribute('fill', 'none');
      circulo.setAttribute('stroke', 'rgba(34,197,94,0.95)');
      circulo.setAttribute('stroke-width', String(g.espessura));
      circulo.setAttribute('stroke-linecap', 'round');
      circulo.setAttribute('stroke-dasharray', String(g.circunferencia));
      circulo.setAttribute('stroke-dashoffset', String(g.offset));
      // Começa às 12 h: o zero do SVG fica às 3 h, e um indicador circular que
      // não começa no topo se lê como andando para trás.
      circulo.setAttribute('transform', `rotate(${g.rotacaoDeg} ${g.centro} ${g.centro})`);
      svg.appendChild(circulo);
      document.body.appendChild(svg);
      anelRef.current = circulo;
    }

    // Calibração descartada por incompatibilidade de pipeline.
    const unsubInvalid = engine.calibration.onInvalidated(() => {
      if (cancelled) return;
      setCalibrationInvalidated(
        'A calibração salva não vale para esta versão do rastreador. ' +
          'Refaça a calibração para voltar a usar o olhar.'
      );
    });

    const unsubState = engine.onStateChange((s) => {
      if (!cancelled) setState(s);
    });

    const unsubL2CSStatus = engine.onL2CSStatusChange((s) => {
      if (!cancelled) setL2csStatus(s);
    });

    // Lido fora do caminho quente e atualizado por evento quando a tela
    // inicial alterna o modo.
    let devMode = isDevMode();
    const unsubDevMode = onDevModeChange((on) => {
      devMode = on;
    });

    // O `<svg>` do anel sofria do mesmo mal do cursor: `opacity = '0'` escrito
    // a cada quadro fora do dwell. Mesma solução, memória própria.
    const definirOpacidadeDoAnel = (valor: string) => {
      const svg = anelRef.current?.ownerSVGElement;
      if (!svg) return;
      const cache = ultimoEstiloDoCursorRef.current;
      if (cache.anelVisivel === valor) return;
      cache.anelVisivel = valor;
      svg.style.opacity = valor;
    };
    const mostrarAnel = () => definirOpacidadeDoAnel('1');
    const esconderAnel = () => definirOpacidadeDoAnel('0');

    // ---------------------------------------------------------------------
    // LAÇO DE RENDER DO CURSOR — roda na taxa do DISPLAY, não na da câmera.
    //
    // Este laço é a correção da "travada". O callback do engine agora só
    // ALIMENTA o seguidor e descreve o estilo; quem escreve a posição no DOM é
    // aqui, a cada quadro de tela. Sem ele, a taxa visual do cursor era a da
    // câmera (~21 Hz medidos) e ~65 % dos quadros de display não mudavam nada,
    // enquanto os que mudavam recebiam o passo inteiro — o padrão
    // "para-e-teleporta" que aparece nas gravações.
    //
    // O laço é barato de propósito: lê dois refs, faz uma interpolação e
    // escreve `transform` (mais as outras props só quando mudam, via
    // `escreverNoCursor`). Nenhuma leitura de layout, nenhum `elementFromPoint`
    // — o hit-test do dwell continua no callback do engine, na taxa da amostra,
    // exatamente como antes.
    let rafPintura = 0;
    const pintar = (agoraMs: number): void => {
      rafPintura = requestAnimationFrame(pintar);
      const cur = cursorRef.current;
      if (!cur) return;
      const p = pinturaRef.current;
      if (p.escondido) return; // quem escondeu já escreveu; não repintar por cima

      const pos = seguidorRef.current.render(agoraMs);
      if (!pos) return;

      const cache = ultimoEstiloDoCursorRef.current;
      escreverNoCursor(
        cur,
        cache,
        'transform',
        `translate3d(${pos.x - p.offsetPx}px, ${pos.y - p.offsetPx}px, 0) scale(${p.escala})`
      );
      // Fonte seca (amostra velha demais): o cursor congela E fica translúcido.
      // Congelar sem avisar seria pior que travar — pareceria funcionando.
      escreverNoCursor(cur, cache, 'opacity', pos.parado ? '0.35' : p.opacity);
      escreverNoCursor(cur, cache, 'background', p.background);
      // Só dependem do TAMANHO do cursor, que não muda em sessão: escritos uma
      // vez e ignorados nos outros ~30 mil quadros pelo cache.
      escreverNoCursor(cur, cache, 'boxShadow', p.boxShadow);
      escreverNoCursor(cur, cache, 'border', p.border);

      // Anel de progresso do dwell: agora ele também enche a 60 Hz em vez de
      // aos trancos na taxa da amostra.
      if (anelRef.current) {
        if (p.anel) {
          const g = geometriaDoAnel(p.tamanhoPx, p.anel.dwellPct);
          anelRef.current.setAttribute('stroke-dashoffset', String(g.offset));
          const svg = anelRef.current.ownerSVGElement;
          if (svg) {
            svg.style.transform = `translate3d(${pos.x - g.centro}px, ${pos.y - g.centro}px, 0)`;
          }
          mostrarAnel();
        } else {
          esconderAnel();
        }
      }
    };
    rafPintura = requestAnimationFrame(pintar);

    let avisouCursorAusente = false;
    const unsubGaze = engine.subscribe((sample) => {
      if (devMode) {
        if (cursorRef.current) esconderCursor(cursorRef.current, ultimoEstiloDoCursorRef.current);
        // O laço de render também precisa saber, senão ele repinta o cursor no
        // quadro seguinte e o modo desenvolvedor volta a mostrá-lo.
        pinturaRef.current.escondido = true;
        seguidorRef.current.reiniciar();
        return;
      }

      const now = performance.now();

      // ── Global dwell dispatcher ───────────────────────────────────────────
      // finds the topmost clickable under the gaze via elementFromPoint (the
      // cursor itself is pointer-events:none, so it doesn't occlude). If the
      // gaze stays on the same target for dwellMs, fires a real .click() —
      // React's synthetic click handlers respond just like a mouse click.
      let dwellPct = 0;
      let hitTarget: HTMLElement | null = null;

      const engineIsCalibrating = engineRef.current?.getState() === 'calibrating';
      const isDegraded = sample.degraded === true;
      if (isDegraded !== isDegradedRef.current) {
        isDegradedRef.current = isDegraded;
        setIsDegraded(isDegraded);
      }
      // Estado visual global (esmaecer sem rosto, dessaturar degradado).
      sinalizarEstadoDoOlhar(!sample.hasFace ? 'perdido' : isDegraded ? 'degradado' : 'ok');

      // Durante a calibração, só a EMERGÊNCIA continua acionável — ela e o
      // CANCELAR da confirmação dela. Um dwell acidental nos botões da própria
      // tela corromperia a coleta, mas o botão de socorro fica visível durante
      // os 1–2 minutos e não pode ficar inoperante nesse tempo. E quem o
      // acionou sem querer precisa conseguir desfazer pelo olhar: sem o
      // CANCELAR aqui, o alerta saía sozinho ao fim da contagem.
      const alvoDuranteCalibracao = engineIsCalibrating
        ? ((document.elementFromPoint(sample.x, sample.y) as Element | null)?.closest(
            SELETOR_DURANTE_CALIBRACAO
          ) as HTMLElement | null)
        : null;

      if (dwellSuspenso || (engineIsCalibrating && !alvoDuranteCalibracao)) {
        // Suspenso (Modo Computador: a janela está oculta e quem clica é a
        // sobreposição) ou calibrando: nada além da emergência é clicável — um
        // dwell acidental na UI da própria calibração corromperia a coleta.
        clearDwellVisuals();
        dwellStateRef.current = createDwellState();
      } else {
        const el = document.elementFromPoint(sample.x, sample.y);
        const node = el?.closest(DWELL_SELECTOR) as HTMLElement | null;

        // `data-dwell-ms` inválido (NaN) não pode virar dwell instantâneo.
        const rawCustom = node?.dataset.dwellMs ? parseInt(node.dataset.dwellMs, 10) : NaN;
        const customDwellMs = Number.isFinite(rawCustom) && rawCustom > 0 ? rawCustom : null;

        const target: DwellTarget | null = node
          ? {
              key: node,
              customDwellMs,
              isEmergency: node.dataset.emergency === 'true',
              // Alvo de recuperação: aceito em `degraded` como o de emergência,
              // com dwell mais longo — é o que torna o "Recalibre aqui"
              // acionável exatamente no estado em que ele aparece. O CANCELAR
              // da confirmação de emergência conta como recuperação: com o
              // rastreamento degradado, desfazer um acionamento acidental
              // também precisa continuar possível pelo olhar.
              isRecovery: node.dataset.recovery === 'true' || node.dataset.cancelarEmergencia === 'true',
              isDisabled:
                (node as HTMLButtonElement).disabled ||
                node.getAttribute('aria-disabled') === 'true' ||
                node.dataset.noDwell === 'true',
            }
          : null;

        const outcome = stepDwell(
          dwellStateRef.current,
          {
            x: sample.x,
            y: sample.y,
            // O dwell tem de acompanhar o FLUXO DE AMOSTRAS, não o relógio do
            // render. Usar `performance.now()` aqui mediria o tempo de parede
            // do callback: se o engine parar de emitir (piscada, rosto
            // perdido, frame dropado), o relógio segue correndo e o dwell
            // completaria sozinho. `sample.timestamp` é carimbado pelo engine
            // na emissão.
            timestamp: Number.isFinite(sample.timestamp) ? sample.timestamp : now,
            hasFace: sample.hasFace,
            degraded: isDegraded,
            // Sem calibração o ponto é o fallback do nariz. O dispatcher
            // bloqueia tudo, inclusive emergência.
            uncalibrated: sample.uncalibrated === true,
            eyeState: sample.eyeState ?? 'unknown',
          },
          target,
          {
            ...DEFAULT_DWELL_CONFIG,
            dwellMs: dwellMsRef.current,
          }
        );
        dwellStateRef.current = outcome.state;

        // ── Piscada como clique ─────────────────────────────────────────
        //
        // Roda em PARALELO ao dwell (fixa + pisca = confirma). As guardas de
        // duração, estabilidade, refratário e emergência vivem no módulo puro.
        //
        // O alvo passado é `node`, não `outcome.hoverKey`: o `hoverKey` zera
        // durante a piscada (olho fechado = sem amostra válida), o que faria o
        // alvo sumir justamente no quadro em que a piscada começa.
        //
        // As guardas de ESTADO DO SISTEMA ficam aqui: `stepBlinkClick` não sabe
        // se o sistema está calibrado. Sem este filtro a piscada clicava onde o
        // `stepDwell` se recusa a clicar — com o ponto no fallback do nariz
        // (`uncalibrated`), em `degraded` (só emergência/recuperação, com dwell
        // mais longo) e em alvos desabilitados.
        const piscadaPermitida =
          sample.uncalibrated !== true && !isDegraded && target?.isDisabled !== true;

        if (EXPERIMENT.blinkClick && !dwellSuspenso) {
          const rb = stepBlinkClick(blinkClickRef.current, {
            piscando:
              !sample.hasFace || sample.eyeState === undefined
                ? null
                : sample.eyeState === 'closed',
            nowMs: now,
            // `null` quando o estado proíbe: o relógio de estabilidade não
            // deve acumular sobre um alvo que não poderia ser clicado.
            alvo: piscadaPermitida ? node : null,
            alvoEhEmergencia: target?.isEmergency === true,
          });
          blinkClickRef.current = rb.estado;
          if (rb.clicou) {
            const alvoDaPiscada = rb.clicou as HTMLElement;
            // Zera o dwell junto: sem isso, o relógio do dwell continuaria
            // correndo sobre o mesmo alvo e dispararia um SEGUNDO clique
            // pouco depois — o paciente confirmaria uma vez e a letra sairia
            // duas.
            clearDwellVisuals();
            dwellStateRef.current = createDwellState();
            if (alvoDaPiscada?.isConnected) {
              confirmarSelecao(alvoDaPiscada);
              alvoDaPiscada.click();
            }
          }
        }

        // Realce: só o alvo apontado pelo outcome fica com `gaze-hover`.
        const hoverNode = outcome.hoverKey as HTMLElement | null;
        if (hoverNode !== hoveredNodeRef.current) {
          clearDwellVisuals();
          hoveredNodeRef.current = hoverNode;
          if (hoverNode?.isConnected) hoverNode.classList.add('gaze-hover');
        }

        if (outcome.effect.type === 'progress') {
          dwellPct = outcome.effect.pct;
          hitTarget = hoverNode;
          if (hoverNode?.isConnected) {
            hoverNode.style.setProperty('--gaze-dwell-progress', `${dwellPct}`);
          }
        } else if (outcome.effect.type === 'click') {
          const alvo = outcome.effect.targetKey as HTMLElement;
          clearDwellVisuals();

          // ── Correção por dwell (sprint S3) ────────────────────────────
          //
          // O dwell acabou de declarar, sem que ninguém precisasse perguntar,
          // onde a pessoa estava olhando: no centro deste botão. A diferença
          // entre esse centro e a posição do cursor é o desvio corrente do
          // sistema, e é de graça.
          //
          // Só de alvo ISOLADO: num teclado ocular o dwell concluído
          // frequentemente não acertou a tecla pretendida, e aprender ali
          // ensina o erro. As outras guardas (degradado, apresentação,
          // emergência, alvo especial) estão em `deveAprender`.
          if (
            alvo.isConnected &&
            deveAprender({
              alvoIsolado: alvo.dataset.isolado === 'true',
              degradado: isDegraded,
              apresentacao: modoApresentacaoAtivo(),
              emergencia: emergenciaAtiva(),
              alvoEspecial: target?.isEmergency === true || target?.isRecovery === true,
              // Quadro comprimido pelo softClamp não diz onde a pessoa olhava,
              // diz onde o clamp a pôs — e aprender dele realimenta a saturação.
              saturado: getSaturacaoDoOlhar().fora,
            })
          ) {
            const r = alvo.getBoundingClientRect();
            aprenderComSelecao({
              centroDoAlvo: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
              olhar: { x: sample.x, y: sample.y },
              agoraMs: now,
              viewport: {
                largura: document.documentElement.clientWidth,
                altura: document.documentElement.clientHeight,
              },
            });
          }

          // O refratário já está armado dentro de `outcome.state`, que foi
          // commitado ACIMA. Se o handler React lançar, o dwell não redispara
          // sob o mesmo olhar e o loop segue vivo.
          try {
            if (alvo.isConnected) {
              confirmarSelecao(alvo);
              alvo.click();
            }
          } catch (err) {
            console.error('[IrisFlow] handler de clique por dwell lançou:', err);
          }
        }

        // ── Rolagem pelas bordas ────────────────────────────────────────
        //
        // Quem não usa as mãos também não usa a roda do mouse: sem isto,
        // qualquer conteúdo mais alto que a tela fica inalcançável a partir
        // do primeiro rolar.
        //
        // A condição que importa é `target === null`: **só rola quando não há
        // nada clicável sob o olhar**. É isso que impede a faixa de roubar o
        // botão de emergência, que fica exatamente numa borda (`top: 2rem` no
        // uso normal, `bottom: 1.5rem` durante a medição). Uma lista de
        // exceções por posição envelheceria no primeiro botão novo perto de
        // uma borda; esta regra protege por construção.
        //
        // As outras duas guardas são as mesmas da piscada, pelo mesmo motivo:
        // sem calibração o ponto é o fallback do nariz, e em `degraded` a
        // posição não é confiável o bastante para mover a tela sozinha.
        //
        // E só com o rosto à vista e os olhos abertos: sem rosto o motor
        // repete a última posição, e uma última posição na faixa da borda
        // rolava a página até o fim sem ninguém olhando. Olhos fechados
        // PAUSAM (como no dwell): uma piscada não zera o prazo da borda.
        const olhosFechados = sample.eyeState === 'closed';
        const podeRolar =
          target === null &&
          sample.uncalibrated !== true &&
          !isDegraded &&
          sample.hasFace === true &&
          !olhosFechados;
        const pausaDaBorda = !podeRolar && olhosFechados && sample.hasFace === true && target === null;

        // O relógio é o do FLUXO DE AMOSTRAS, não o de parede — mesma razão
        // que o dwell documenta acima. Com `performance.now()`, uma pausa na
        // emissão (piscada, rosto perdido, quadro dropado) deixaria os 300 ms
        // "passarem" sozinhos, e a primeira amostra depois da pausa rolaria de
        // imediato: exatamente o olhar de relance que o atraso existe para
        // ignorar.
        const relogio = Number.isFinite(sample.timestamp) ? sample.timestamp : now;

        if (podeRolar) {
          const r = velocidadeDaBorda(bordaRef.current, sample.y, window.innerHeight, relogio);
          bordaRef.current = r.estado;
          if (r.velocidadePxS !== 0) {
            rolarSobOOlhar(
              sample.x,
              sample.y,
              r.velocidadePxS,
              relogio - ultimaRolagemMsRef.current
            );
          }
          ultimaRolagemMsRef.current = relogio;
        } else if (pausaDaBorda) {
          // Piscada: não rola e não zera — o tempo parado não vira rolagem.
          ultimaRolagemMsRef.current = relogio;
        } else {
          // Sair do estado zera o prazo: voltar à borda recomeça os 300 ms.
          bordaRef.current = estadoInicialDeBorda();
          ultimaRolagemMsRef.current = relogio;
        }
      }

      // Move cursor via transform (no layout / no React re-render).
      // Visual feedback: green + growing while dwell fills; red otherwise.
      // Cursor completamente escondido em 3 casos: (1) durante calibração
      // para não distrair a fixação; (2) antes de calibrar (não há mapeamento
      // ainda, mostrar um cursor aleatório confunde); (3) durante o teste
      // de precisão — se o usuário vir o cursor ele tenta "corrigi-lo"
      // olhando para outro lugar, criando feedback loop que corrompe a
      // medida (a variável isAccuracyTesting é lida a cada frame, então
      // pega o valor fresco assim que startAccuracyTest liga).
      if (cursorRef.current) {
        const isInCalibration = engineRef.current?.getState() === 'calibrating';
        const isCalibrated = engineRef.current?.calibration.isCalibrated() ?? false;

        // Quem decide se o cursor pode aparecer DURANTE o teste é o módulo
        // `accuracy`, não este arquivo: é ele que sabe qual pergunta a rodada
        // está respondendo.
        //
        //   rodada de MEDIÇÃO     → escondido. Vendo o cursor a pessoa corrige
        //     o olhar até ele cair no alvo, e o erro medido vira o resíduo da
        //     perseguição — que tende a zero com qualquer modelo. A
        //     contaminação entra no COMPORTAMENTO, então nenhum
        //     pós-processamento a desfaz.
        //   rodada de VERIFICAÇÃO → visível, de propósito. Ali a pergunta é
        //     outra ("a pessoa consegue levar o cursor até o alvo, e em quanto
        //     tempo?"), as métricas são outras (`result.verificacao`) e o
        //     relatório diz isso em `protocolo.modo`.
        //
        // Na calibração o cursor continua escondido em qualquer caso: lá a
        // pessoa precisa fixar o alvo, e um ponto se mexendo ao lado é
        // justamente o que estraga a fixação que se está tentando coletar.
        const escondePeloTeste = !cursorVisivelNoTeste();

        // E a ROTA. `isCalibrated()` não basta sozinho: um perfil salvo carrega
        // a calibração dele, então já na tela de escolha de paciente a resposta
        // é "sim" e o cursor aparecia — apontando com o modelo de quem usou o
        // computador por último, antes de alguém dizer quem vai usar agora.
        //
        // Lido de `location.hash` porque o `GazeProvider` fica FORA do router
        // (ver `App.tsx`: ele precisa envolver o `CloudProvider`, que é irmão
        // das rotas), então não há `useLocation` aqui. Com `HashRouter` a rota
        // mora no hash, e lê-la é uma leitura de string — nada de layout.
        const escondePelaRota = !rotaMostraCursor(window.location.hash);

        if (isInCalibration || !isCalibrated || escondePeloTeste || escondePelaRota) {
          // Hard-hide: move offscreen + opacity 0
          esconderCursor(cursorRef.current, ultimoEstiloDoCursorRef.current);
          esconderAnel();
          // Reiniciar o seguidor é obrigatório aqui: sem isso, ao voltar a
          // aparecer o cursor seria desenhado ATRAVESSANDO a tela desde onde
          // parou antes de sumir. Reaparecer é descontinuidade legítima.
          pinturaRef.current.escondido = true;
          seguidorRef.current.reiniciar();

          // O fallback de gaze perdido não roda aqui (não há cursor para
          // segurar), mas a mensagem dele precisa ser limpa: um "Posicione o
          // rosto" emitido antes da calibração ficaria na tela durante a coleta
          // inteira. O `GazeFallback` também é zerado, senão retomaria com uma
          // âncora de posição de antes da calibração.
          if (gazeLostMessageRef.current !== null) {
            gazeLostMessageRef.current = null;
            setGazeLostMessage(null);
            fallbackRef.current.reset();
          }
        } else {
          // ── Fallback de gaze perdido ───────────────────────────────────
          //
          // Com a flag desligada, `fb` reproduz o comportamento de sempre
          // (posição da amostra, cursor visível).
          const fb = EXPERIMENT.gazeLostFallback
            ? fallbackRef.current.step({
                gazeValido: sample.hasFace,
                x: sample.x,
                y: sample.y,
                nowMs: now,
              })
            : {
                estado: 'ativo' as const,
                posicao: { x: sample.x, y: sample.y },
                mostrarCursor: true,
                mensagem: null,
                zerarDwell: false,
              };

          // O dwell é DESCARTADO na perda, não preservado — política oposta à
          // do `blinkHold`, e de propósito: numa piscada a pessoa continua
          // olhando para o alvo; com o rosto perdido, o olhar pode ter ido
          // para a porta.
          if (fb.zerarDwell) {
            clearDwellVisuals();
            // O período refratário SOBREVIVE ao descarte: ele existe para uma
            // seleção não repetir logo em seguida, e um quadro sem rosto logo
            // depois de um clique não pode encurtá-lo — a mesma tecla sairia
            // de novo antes do tempo.
            const refratarioAte = dwellStateRef.current.refractoryUntil;
            dwellStateRef.current = { ...createDwellState(), refractoryUntil: refratarioAte };
          }

          if (fb.mensagem !== gazeLostMessageRef.current) {
            gazeLostMessageRef.current = fb.mensagem;
            setGazeLostMessage(fb.mensagem);
          }

          // Aviso de borda. Só faz sentido com o rastreamento ativo: em
          // `segurando`/perdido a posição na tela é projetada, não medida, e
          // acusar "você está olhando para baixo" com base numa projeção seria
          // inventar.
          const sat = getSaturacaoDoOlhar();
          const vereditoDeBorda = foraDaTelaRef.current.avaliar({
            fora: fb.estado === 'ativo' && sat.fora,
            direcao: sat.direcao,
            temRosto: sample.hasFace === true,
            tMs: now,
          });
          if (vereditoDeBorda.mensagem !== avisoDeBordaRef.current) {
            avisoDeBordaRef.current = vereditoDeBorda.mensagem;
            setAvisoDeBorda(vereditoDeBorda.mensagem);
          }

          const vereditoDeOlhos = olhosFechadosRef.current.avaliar({
            estado: sample.eyeState ?? 'unknown',
            temRosto: sample.hasFace === true,
            tMs: now,
          });
          if (vereditoDeOlhos.mensagem !== avisoDeOlhosFechadosRef.current) {
            avisoDeOlhosFechadosRef.current = vereditoDeOlhos.mensagem;
            setAvisoDeOlhosFechados(vereditoDeOlhos.mensagem);
          }

          if (!fb.mostrarCursor || fb.posicao === null) {
            esconderCursor(cursorRef.current, ultimoEstiloDoCursorRef.current);
            esconderAnel();
            pinturaRef.current.escondido = true;
            seguidorRef.current.reiniciar();
          } else {
            // Geometria e cores vêm do módulo puro — em especial o `offsetPx`:
            // um meio-tamanho escrito à mão aqui viraria viés constante assim
            // que o diâmetro do cursor mudasse, e viés constante parece erro
            // de calibração, não de layout.
            const est = estiloDoCursor({
              tamanhoPx: limitarTamanho(EXPERIMENT.cursorSizePx),
              estado: hitTarget
                ? 'sobreAlvo'
                : isDegraded
                  ? 'degradado'
                  : fb.estado === 'segurando'
                    ? 'segurando'
                    : 'normal',
              dwellPct,
            });

            // A POSIÇÃO vai para o seguidor; o ESTILO vai para o buffer de
            // pintura. Quem escreve no DOM é o laço de render, a 60 Hz.
            //
            // A separação é o ponto: a posição precisa ser interpolada entre
            // amostras (senão o cursor teleporta), enquanto cor, anel e escala
            // podem ser atualizados na taxa da amostra sem nenhum prejuízo
            // visual — eles não descrevem movimento.
            seguidorRef.current.aoReceberAmostra({
              x: fb.posicao.x,
              y: fb.posicao.y,
              tMs: now,
            });
            pinturaRef.current = {
              escondido: false,
              background: est.preenchimento,
              // O anel duplo é o que torna o cursor visível sobre QUALQUER
              // fundo: nenhuma cor sozinha contrasta com todos, e o vermelho
              // translúcido de antes sumia sobre o botão de emergência — que é
              // o pior alvo possível para o cursor sumir.
              boxShadow: est.anel,
              border: est.tracejado ? '2px dashed rgba(234,179,8,0.9)' : '',
              opacity: fb.estado === 'segurando' ? '0.5' : sample.hasFace ? '1' : '0.35',
              escala: est.escala,
              offsetPx: est.offsetPx,
              tamanhoPx: est.tamanhoPx,
              anel: hitTarget ? { dwellPct } : null,
            };
          }
        }
      } else if (!avisouCursorAusente) {
        // Uma vez por sessão: o cursor não existir é uma falha de montagem, e
        // repetir o aviso a 30 Hz enche o console sem acrescentar nada.
        avisouCursorAusente = true;
        console.warn('[IrisFlow] gaze subscribe callback disparou mas cursorRef.current é null');
      }
      // Fan out to subscribers.
      subscribersRef.current.forEach((cb) => {
        try {
          cb(sample);
        } catch (e) {
          console.error('[GazeContext] subscriber threw', e);
        }
      });

      // Sincroniza `isDwelling` sem floodar re-renders.
      const targetExists = dwellStateRef.current.targetKey !== null;
      if (wasDwellingRef.current !== targetExists) {
        wasDwellingRef.current = targetExists;
        setIsDwelling(targetExists);
      }
    });

    async function boot() {
      // Video capture is owned by the provider (single source of truth).
      // Mantém o elemento visível (canto, opacidade ~0) para o Chromium não
      // suspender o pipeline de decoding — vídeos totalmente offscreen podem
      // ficar com `currentTime` congelado e travar o loop rAF do rastreador.
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      video.style.cssText = [
        'position:fixed',
        'right:0',
        'bottom:0',
        'width:2px',
        'height:2px',
        'opacity:0.01',
        'pointer-events:none',
        'z-index:0',
      ].join(';');
      document.body.appendChild(video);
      videoRef.current = video;

      try {
        console.log('[IrisFlow] solicitando getUserMedia...');
        const stream = await openCameraWithFallback();
        // Registra a stream ANTES de qualquer outra coisa: a partir daqui o
        // cleanup consegue pará-la mesmo que nunca cheguemos ao <video>.
        streamRef.current = stream;
        // E se o cleanup JÁ rodou enquanto esperávamos, a stream que acabou de
        // chegar não tem dono: para agora mesmo em vez de deixar a câmera
        // acesa até o GC.
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          console.log('[IrisFlow] stream descartada — provider desmontado durante getUserMedia.');
          return;
        }
        video.srcObject = stream;
        console.log('[IrisFlow] stream obtido, aguardando loadeddata...');

        // Identidade da câmera → FOV certo para ELA. Trocar de webcam com o
        // FOV da anterior deixava toda distância errada sem sintoma.
        try {
          const track = stream.getVideoTracks()[0];
          const chave = chaveDaCamera({
            deviceId: track?.getSettings().deviceId,
            label: track?.label,
          });
          cameraAtualRef.current = { chave, rotulo: track?.label ?? '' };
          const s0 = settingsRef.current;
          const r = resolverFovParaCamera(
            s0.fovPorCamera,
            chave,
            s0.ultimaCameraChave,
            s0.cameraHorizontalFovDeg
          );
          const mudouFov =
            s0.cameraHorizontalFovDeg === null ||
            Math.abs(s0.cameraHorizontalFovDeg - r.fovDeg) > 1e-6;
          if (mudouFov || (chave !== null && chave !== s0.ultimaCameraChave)) {
            updateSettingsRef.current({
              cameraHorizontalFovDeg: r.fovDeg,
              ultimaCameraChave: chave ?? s0.ultimaCameraChave,
            });
          }
          if (r.aviso) {
            console.warn('[camera]', r.aviso);
            setAvisoDeCamera(r.aviso);
          }
        } catch (e) {
          console.warn('[camera] não foi possível identificar a câmera para o FOV:', e);
        }
        // Espera LIMITADA. Sem o teto, uma câmera que abre mas nunca entrega
        // quadro (driver Windows travado, dispositivo tomado por outro app
        // depois do getUserMedia) deixava este await pendente para sempre:
        // `engine.start()` nunca acontecia, o `l2csStatus` ficava em 'loading'
        // e a tela de calibração exibia "Carregando…" com o botão desabilitado
        // pelo resto da sessão — sem erro, sem console para o cuidador ler.
        const LOADEDDATA_TIMEOUT_MS = 10000;
        await new Promise<void>((resolve, reject) => {
          // O evento pode já ter passado se o quadro chegou antes de chegarmos
          // aqui; `readyState` é o estado, o evento é só a notificação dele.
          if (video.readyState >= 2) {
            resolve();
            return;
          }
          const timer = window.setTimeout(() => {
            video.removeEventListener('loadeddata', aoCarregar);
            reject(
              new Error(
                'A câmera foi aberta mas não entregou nenhum quadro em 10 segundos. ' +
                  'Feche outros programas que usem a webcam (Teams, Zoom, OBS), ' +
                  'desconecte e reconecte a câmera, e recarregue.'
              )
            );
          }, LOADEDDATA_TIMEOUT_MS);
          function aoCarregar() {
            window.clearTimeout(timer);
            resolve();
          }
          video.addEventListener('loadeddata', aoCarregar, { once: true });
        });
        // Alguns browsers em Electron não iniciam o playback sozinhos mesmo com
        // muted+autoplay quando o elemento é adicionado dinamicamente. Force.
        try {
          await video.play();
        } catch (e) {
          console.warn('[IrisFlow] video.play() falhou:', e);
        }
        console.log(
          `[IrisFlow] loadeddata OK — video ${video.videoWidth}x${video.videoHeight}, paused=${video.paused}, currentTime=${video.currentTime}`
        );

        // A resolução obtida é preditor DIRETO do erro final; não fica só num
        // log informativo. O sinal útil são poucos px de deslocamento da íris,
        // e escala linearmente com a densidade do sensor.
        if (video.videoWidth > 0 && video.videoWidth < 1920) {
          console.warn(
            `[IrisFlow] ⚠ câmera negociou ${video.videoWidth}x${video.videoHeight}, abaixo de 1920x1080. ` +
              `O erro de rastreamento escala com o inverso da densidade de pixels no rosto: ` +
              `a ${video.videoWidth}px de largura, espere ~${(1920 / video.videoWidth).toFixed(1)}× mais erro ` +
              `de landmark do que a 1080p. Verifique se a webcam suporta Full HD e se nenhum outro ` +
              `app está segurando o dispositivo numa resolução menor.`
          );
        }

        // Segundo ponto de saída, depois de `loadeddata`: sair sem parar as
        // tracks deixaria um decode de 1080p vivo pelo resto da página.
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          console.log('[IrisFlow] stream parada — provider desmontado durante o warm-up.');
          return;
        }
        await engine.start(video);
        engine.setScreenGeometry(
          settingsRef.current.screenDiagonalIn,
          settingsRef.current.viewingDistanceCm
        );
        console.log('[IrisFlow] engine.start() concluído; loop rAF em execução.');

        // ── Hooks de console para diagnóstico e medição de latência ────────
        //
        // `__irisflowDiag()` devolve o diagnóstico inteiro;
        // `__irisflowLatencia()` imprime a tabela de estágios ordenada pelo
        // p95. Ambos são removidos no cleanup do provider.
        if (typeof window !== 'undefined') {
          const w = window as unknown as Record<string, unknown>;
          w.__irisflowDiag = () => engineRef.current?.getDiagnostics() ?? null;
          w.__irisflowLatencia = () => {
            const d = engineRef.current?.getDiagnostics();
            if (!d) {
              console.warn('[latencia] engine não está rodando.');
              return null;
            }
            const linhas = Object.entries(d.stageLatency)
              .map(([estagio, s]) => ({
                estagio,
                p50ms: +s.p50Ms.toFixed(2),
                p95ms: +s.p95Ms.toFixed(2),
                amostras: s.count,
                // `orphanEnds > 0` é bug de instrumentação, não de latência —
                // significa `end()` sem `begin()`. Fica na tabela para não
                // passar despercebido.
                orfaos: s.orphanEnds,
              }))
              .sort((a, b) => b.p95ms - a.p95ms);
            console.table(linhas);
            // `stalePct` JÁ vem em percentual (0–100), não em fração —
            // `engine.ts` faz o `× 100` na origem. Não multiplicar de novo.
            console.log(
              `[latencia] fps=${d.fpsRender.toFixed(1)} l2cs=${d.l2cs.hz.toFixed(1)} Hz ` +
                `inferência=${d.l2cs.latencyMs.toFixed(0)} ms stale=${d.l2cs.stalePct.toFixed(1)}% ` +
                `crop=${d.l2cs.inputSize}² ep=${d.l2cs.executionProvider ?? '?'}`
            );
            if (d.l2cs.stalePct > 50) {
              console.warn(
                `[latencia] ${d.l2cs.stalePct.toFixed(0)}% das leituras do L2CS estão OBSOLETAS ` +
                  `(inferência ${d.l2cs.latencyMs.toFixed(0)} ms contra tolerância de ${d.l2cs.staleMs.toFixed(0)} ms). ` +
                  'O bloco angular está sendo zerado — as features [4] e [5] do vetor não carregam sinal.'
              );
            }
            return linhas;
          };
          // ── Verificação pré-sessão ────────────────────────────────────
          //
          // Checklist do protocolo de medição num comando só. O parâmetro
          // opcional é a condição PRETENDIDA: declará-la pega o erro mais
          // provável — `__irisflowExp.set` só vale depois de recarregar, e
          // medir com a flag da condição anterior produz dado de aparência
          // perfeita atribuído à condição errada.
          //
          //   __irisflowPreflight()
          //   __irisflowPreflight({ filterMode: 'kalmanEma', l2csInputSize: 224 })
          w.__irisflowPreflight = async (condicaoEsperada?: Record<string, unknown>) => {
            const d = engineRef.current?.getDiagnostics();
            if (!d) {
              console.warn('[preflight] engine não está rodando.');
              return null;
            }

            // Taxa de atualização medida na hora: 30 quadros de rAF. É curto
            // de propósito — o operador não vai esperar, e a taxa não varia.
            const hz = await new Promise<number | null>((resolve) => {
              const t: number[] = [];
              const passo = () => {
                t.push(performance.now());
                if (t.length <= 30) requestAnimationFrame(passo);
                else {
                  const dt = (t[t.length - 1] - t[0]) / (t.length - 1);
                  resolve(dt > 0 ? 1000 / dt : null);
                }
              };
              requestAnimationFrame(passo);
            });

            const itens = preflight({
              estadoEngine: engineRef.current?.getState() ?? 'desconhecido',
              calibrado: engineRef.current?.calibration.isCalibrated() ?? false,
              telaPolegadas: settingsRef.current.screenDiagonalIn,
              origemGeometria: settingsRef.current.screenGeometrySource ?? 'default',
              distanciaCm: settingsRef.current.viewingDistanceCm,
              viewportPx: {
                w: document.documentElement.clientWidth,
                h: document.documentElement.clientHeight,
              },
              telaPx: { w: window.screen.width, h: window.screen.height },
              taxaAtualizacaoHz: hz,
              fpsRender: d.fpsRender,
              videoPx: { w: d.video.width, h: d.video.height },
              l2cs: {
                status: d.l2cs.status,
                executionProvider: d.l2cs.executionProvider ?? null,
                stalePct: d.l2cs.stalePct,
                pendingCount: d.l2cs.pendingCount,
                hz: d.l2cs.hz,
              },
              filtro: d.filtro,
              flags: EXPERIMENT as unknown as Record<string, unknown>,
              condicaoEsperada,
            });

            const icone = { ok: '✅', atencao: '⚠️', bloqueio: '⛔' } as const;
            console.table(
              itens.map((i) => ({
                '': icone[i.nivel],
                item: i.item,
                detalhe: i.detalhe,
                ação: i.acao ?? '',
              }))
            );
            if (podeComecar(itens)) {
              console.log('[preflight] ✅ PODE COMEÇAR.');
            } else {
              console.warn(
                '[preflight] ⛔ NÃO COMECE — os itens marcados produziriam dado que ' +
                  'será descartado. Resolva-os e rode de novo.'
              );
            }
            return itens;
          };

          console.log(
            '[IrisFlow] console: __irisflowPreflight() ANTES de medir · ' +
              '__irisflowLatencia() para a tabela de estágios · ' +
              '__irisflowDiag() para o diagnóstico completo.'
          );
        }

        // Ajuste automático da câmera. Roda DEPOIS do engine porque a malha
        // se fecha sobre o tamanho do rosto, que só existe com o detector de
        // landmarks rodando. Deliberadamente sem `await`: são ~8 s de
        // convergência e o app não pode ficar parado esperando — a
        // pré-calibração já mostra o estado enquanto o ajuste acontece.
        void autoTuneCamera(stream, engine, () => cancelled);
      } catch (err) {
        console.error('[IrisFlow] Falha ao inicializar câmera/engine:', err);
        if (!cancelled) {
          setCameraError(
            err instanceof Error && err.message
              ? err.message
              : 'Falha ao inicializar a câmera. Recarregue a página.'
          );
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
      unsubState();
      unsubInvalid();
      unsubL2CSStatus();
      unsubGaze();
      unsubDevMode();
      // `dispose()` em vez de `stop()`: `stop()` só para o loop; `dispose()`
      // fecha o FaceLandmarker (heap WASM + GPU) e o worker L2CS (~91 MB de
      // sessão ONNX). O try/catch importa: uma exceção aqui abortaria o resto
      // do cleanup (`provedorAtivo--`, `track.stop()`) e deixaria o provider
      // travado com a câmera acesa.
      try {
        engine.dispose();
      } catch (e) {
        console.warn('[IrisFlow] engine.dispose() falhou durante o cleanup:', e);
      }
      engineRef.current = null;
      // Remove os hooks de console junto com o engine: vivos, apontando para
      // um engine descartado, devolveriam `null` em silêncio.
      if (typeof window !== 'undefined') {
        delete (window as unknown as Record<string, unknown>).__irisflowDiag;
        delete (window as unknown as Record<string, unknown>).__irisflowLatencia;
        delete (window as unknown as Record<string, unknown>).__irisflowPreflight;
      }
      // Libera o guard de instância única. Vem DEPOIS do dispose para que um
      // remount imediato não encontre recursos meio liberados.
      provedorAtivo = Math.max(0, provedorAtivo - 1);

      // A stream vem do ref (ver `streamRef`); o `??` é rede de segurança para
      // o caso de ela ter sido trocada no <video> por outro caminho.
      const stream = streamRef.current ?? (videoRef.current?.srcObject as MediaStream | null);

      // Devolve a câmera como estava ANTES de `track.stop()`: zoom e brilho
      // aplicados por `applyConstraints` persistem no dispositivo em vários
      // drivers. Best-effort — o cleanup do React não espera Promise, mas a
      // chamada é despachada ao driver antes do `stop()`.
      const original = originalCameraSettingsRef.current;
      const track0 = stream?.getVideoTracks()[0];
      if (original && track0 && Object.keys(original).length > 0) {
        try {
          void track0
            .applyConstraints(original as MediaTrackConstraints)
            .then(() => console.log('[camera] câmera restaurada ao estado original.'))
            .catch((e) => console.warn('[camera] restauração da câmera falhou:', e));
        } catch (e) {
          console.warn('[camera] restauração da câmera falhou:', e);
        }
      }
      originalCameraSettingsRef.current = null;

      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      videoRef.current?.remove();
      videoRef.current = null;

      // O laço de pintura se reagenda sozinho: sem este cancelamento ele
      // sobreviveria ao desmonte e continuaria escrevendo num nó removido.
      cancelAnimationFrame(rafPintura);
      seguidorRef.current.reiniciar();
      cursorRef.current?.remove();
      cursorRef.current = null;
      limparEstadoDoOlhar();
      anelRef.current?.ownerSVGElement?.remove();
      anelRef.current = null;
    };
  }, []);

  // calibration must have STABLE identity across renders — consumers put it in
  // useEffect deps and any change here would fire their cleanup mid-flow.
  // The functions read engineRef.current lazily, so the ref stays fresh even
  // though the object identity never changes.
  const calibration = useMemo<CalibrationApi>(
    () => ({
      // Sem engine não há modo de calibração para entrar: `false` é a resposta
      // honesta. O `undefined` do encadeamento opcional se lê como "deu certo"
      // em qualquer `if` do chamador, que é o oposto do que aconteceu.
      startCalibrationMode: (opts) =>
        engineRef.current?.calibration.startCalibrationMode(opts) ?? false,
      getCalibrationTargets: () => engineRef.current?.calibration.getCalibrationTargets() ?? [],
      getCalibrationMode: () => engineRef.current?.calibration.getCalibrationMode() ?? null,
      // Perfil da grade (`padrao` | `computador`) e motivo da última recusa.
      // Repasse puro: sem engine, `false` / o perfil padrão / nenhuma recusa.
      setPerfil: (perfil) => engineRef.current?.calibration.setPerfil(perfil) ?? false,
      getPerfil: () => engineRef.current?.calibration.getPerfil() ?? 'padrao',
      getRecusa: () => engineRef.current?.calibration.getRecusa() ?? null,
      startCollectingPoint: (x, y, onDone) =>
        engineRef.current?.calibration.startCollectingPoint(x, y, onDone),
      // Sem engine não há treino — mas devolver em silêncio deixa a tela
      // esperando um callback que nunca vem. A falha é dita.
      completeCalibration: (onComplete) => {
        const eng = engineRef.current;
        if (!eng) {
          console.error('[IrisFlow] completeCalibration sem engine ativo.');
          onComplete?.({
            ok: false,
            reason: 'engine_indisponivel',
            detail: 'O rastreamento não está ativo.',
          });
          return;
        }
        eng.calibration.completeCalibration(onComplete);
      },
      // Deriva de pose da calibração recém-treinada, para a tela poder avisar
      // em vez de deixar o usuário seguir com um modelo contaminado.
      getPoseDriftVerdict: () => engineRef.current?.calibration.getPoseDriftVerdict() ?? null,
      // Diagnóstico do ajuste. CARO: roda o leave-one-target-out (~9 s).
      // Quem só quer os alvos pulados usa `getTargetsSkipped`.
      getCalibrationFitDiagnostics: () =>
        engineRef.current?.calibration.getCalibrationFitDiagnostics() ?? null,
      // Alvos que ficaram fora do treino, para a tela avisar que a calibração
      // treinou sem parte da grade. Barato: não dispara o LOO.
      getTargetsSkipped: () => engineRef.current?.calibration.getTargetsSkipped() ?? [],
      // Rodada extra nos alvos que o modelo pior generalizou (sprint S4).
      // Barata: lê o `looByTarget` já em cache do treino que acabou.
      iniciarRodadaDeReforco: () => engineRef.current?.calibration.iniciarRodadaDeReforco() ?? [],
      // Segunda posição de cabeça (sprint S7). A tela precisa PEDIR a mudança
      // de posição antes de chamar: sem isso a rodada duplica a mesma pose.
      iniciarRodadaDeSegundaPose: () =>
        engineRef.current?.calibration.iniciarRodadaDeSegundaPose() ?? [],
      // Perseguição suave (sprint S8). A tela precisa atualizar o alvo a cada
      // quadro; sem isso o quadro não é guardado, porque amostra sem rótulo
      // não serve para nada.
      iniciarPerseguicao: () => engineRef.current?.calibration.iniciarPerseguicao() ?? false,
      definirAlvoDaPerseguicao: (x: number, y: number) =>
        engineRef.current?.calibration.definirAlvoDaPerseguicao(x, y),
      finalizarPerseguicao: () =>
        engineRef.current?.calibration.finalizarPerseguicao() ?? {
          aproveitados: 0,
          vistos: 0,
          fracaoSeguida: 0,
          correlacaoMediana: null,
          utilizavel: false,
        },
      abort: () => engineRef.current?.calibration.abort(),
      clear: () => engineRef.current?.calibration.clear(),
      isCalibrated: () => engineRef.current?.calibration.isCalibrated() ?? false,
      setEyeDominance: (d) => engineRef.current?.calibration.setEyeDominance(d),
      setCameraFovDeg: (fov) => engineRef.current?.calibration.setCameraFovDeg(fov),
      getCalibrationDistancesCm: () =>
        engineRef.current?.calibration.getCalibrationDistancesCm() ?? {
          cameraCm: null,
          screenCm: null,
        },
      setCalibrationDistancesCm: (cameraCm, screenCm) =>
        engineRef.current?.calibration.setCalibrationDistancesCm(cameraCm, screenCm),
      getCurrentCameraDistanceCm: () =>
        engineRef.current?.calibration.getCurrentCameraDistanceCm() ?? null,
      getDistanceRange: () => engineRef.current?.calibration.getDistanceRange() ?? null,
      onInvalidated: (cb) => engineRef.current?.calibration.onInvalidated(cb) ?? (() => {}),
      getRecentBlinkRatePerMinute: (windowMs) =>
        engineRef.current?.calibration.getRecentBlinkRatePerMinute(windowMs) ?? 0,
      getActiveOpticalCondition: () =>
        engineRef.current?.calibration.getActiveOpticalCondition() ?? 'desconhecido',
    }),
    []
  );

  const recording = useMemo<RecordingApi>(
    () => ({
      start: () => engineRef.current?.recording.start(),
      stop: () => engineRef.current?.recording.stop(),
      isActive: () => engineRef.current?.recording.isActive() ?? false,
      getStats: () => engineRef.current?.recording.getStats() ?? { frames: 0, dropped: 0 },
      exportAsJSONL: () => engineRef.current?.recording.exportAsJSONL() ?? '',
      clear: () => engineRef.current?.recording.clear(),
    }),
    []
  );

  // Aviso de distância a 2 Hz, não por quadro: a distância muda na escala de
  // segundos. A histerese do `AvisoDeDistancia` cuida da estabilidade, e o
  // `setState` só acontece quando o texto muda.
  //
  // O aviso de POSTURA vem junto, na mesma cadência e pela mesma razão: é a
  // referência geométrica lenta dizendo que está parada há mais de um minuto e
  // meio porque a pessoa não está na postura em que calibrou. Os dois avisos
  // têm a mesma saída — o reajuste de 2 s — e por isso são lidos juntos.
  useEffect(() => {
    const id = setInterval(() => {
      const faixa = engineRef.current?.calibration.getDistanceRange?.() ?? null;
      const calibradaCm =
        engineRef.current?.calibration.getCalibrationDistancesCm().screenCm ?? null;
      const r = avisoDistanciaRef.current.avaliar(faixa?.screenDistanceNowCm ?? null, calibradaCm);
      setDistanceAdvice((anterior) => (anterior === r.mensagem ? anterior : r.mensagem));
      const postura = engineRef.current?.sugereReancoragem?.() ?? false;
      setAvisoDePostura((anterior) => (anterior === postura ? anterior : postura));
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Vigia de recalibração a cada 15 s — a BCEA recente é uma mediana de
  // fixações e muda na escala de minutos. Só consulta com modelo carregado e
  // rastreando; sem isso o veredicto é "não sei", e "não sei" não acusa.
  useEffect(() => {
    const id = setInterval(() => {
      const eng = engineRef.current;
      if (!eng) return;
      const rastreando = eng.getState() === 'tracking' && eng.calibration.isCalibrated();
      const veredicto = rastreando ? eng.precisaDeRecalibracao() : { precisa: false, motivo: null };
      vigiaRef.current = consultarVigia(vigiaRef.current, veredicto, performance.now());
      const motivo = vigiaRef.current.motivoExibido;
      setAvisoDeRecalibracao((anterior) => (anterior === motivo ? anterior : motivo));
    }, INTERVALO_DE_CONSULTA_MS);
    return () => clearInterval(id);
  }, []);

  /** "Agora não" no aviso do vigia: esconde e dorme 10 min. */
  const dispensarRecalibracao = useCallback(() => {
    vigiaRef.current = dispensarVigia(vigiaRef.current, performance.now());
    setAvisoDeRecalibracao(null);
  }, []);

  /**
   * "Calibrar de novo": o provider fica FORA do router, então navega pelo
   * hash — é o HashRouter que escuta. Zera o vigia: a próxima calibração
   * grava uma referência nova e o episódio acabou.
   */
  const irRecalibrar = useCallback(() => {
    vigiaRef.current = vigiaResolvido();
    setAvisoDeRecalibracao(null);
    window.location.hash = '#/calibration-check';
  }, []);

  /**
   * Reajuste rápido: 2 s com a pessoa olhando o centro — o engine mede onde o
   * modelo põe o olhar e corrige a deriva (as referências da calibração não
   * mudam). Quem conta o tempo é o ENGINE — o overlay só desenha o anel
   * fechando, e some quando a promessa resolve. Assim o que aparece na tela não
   * pode divergir do que foi colhido.
   *
   * Reentrância: o engine já encerra uma reancoragem anterior ao começar outra,
   * e o `reancorando` mantém o botão desabilitado enquanto isso.
   *
   * Cada coleta ganha um número (`reancoragemAtivaRef`). Um cancelamento
   * (`cancelarReancoragem`, chamado pela Emergência) zera o número: quando a
   * promessa daquela coleta resolver, ela já não é a ativa e não mexe em nada
   * — nem no aviso de postura, nem no overlay de uma coleta seguinte.
   */
  const reancoragemAtivaRef = useRef<number | null>(null);
  const proximaReancoragemRef = useRef(0);
  const reancorar = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    // Emergência em curso (contagem de confirmação ou tela de socorro): nada
    // de overlay preto por cima dela. O aviso de postura fica acima da
    // confirmação, e um "Reajustar" acionado ali taparia o CANCELAR.
    if (emergenciaAtiva()) {
      console.warn('[calib] reajuste rápido recusado: emergência em curso');
      return;
    }
    const id = ++proximaReancoragemRef.current;
    reancoragemAtivaRef.current = id;
    setReancorando(true);
    void eng
      .reancorarReferencias({ duracaoMs: DURACAO_DO_REAJUSTE_MS })
      .then((r) => {
        if (reancoragemAtivaRef.current !== id) return;
        console.log(
          `[calib] reajuste rápido: ${r.amostras} amostra(s)` +
            (r.aplicado
              ? `, viés de ${r.desvioPx?.toFixed(0) ?? '?'} px no centro corrigido`
              : r.desvioPx !== null
                ? `, viés de ${r.desvioPx.toFixed(0)} px grande demais para corrigir — calibre de novo`
                : ', sem amostras suficientes — nada foi alterado')
        );
        // Corrigiu: o aviso some sem esperar o próximo tick de 500 ms.
        if (r.aplicado) setAvisoDePostura(false);
      })
      .catch((e) => console.warn('[calib] reajuste rápido falhou:', e))
      .finally(() => {
        if (reancoragemAtivaRef.current !== id) return;
        reancoragemAtivaRef.current = null;
        setReancorando(false);
      });
  }, []);

  /**
   * Interrompe o reajuste em curso SEM aplicar nada.
   *
   * O overlay sai na hora (a Emergência não espera o anel fechar) e a coleta é
   * abandonada no engine: os quadros de quem desviou o olhar para a Emergência
   * — ou virou a cabeça para ela — não descrevem a postura olhando o centro, e
   * aplicá-los reescreveria as referências com lixo. É o mesmo "abandonar, não
   * concluir" que o engine já faz quando o perfil muda no meio da coleta.
   *
   * `cancelarReancoragem()` é a porta do engine para isso. Um engine sem ela
   * (versão anterior do núcleo) não tem como descartar a coleta pela metade:
   * o overlay sai do mesmo jeito, mas a coleta termina sozinha em segundo
   * plano — e o aviso no log diz exatamente isso, em vez de fingir que
   * descartou.
   */
  const cancelarReancoragem = useCallback(() => {
    if (reancoragemAtivaRef.current === null) return;
    reancoragemAtivaRef.current = null;
    setReancorando(false);
    const eng = engineRef.current as (GazeEngine & { cancelarReancoragem?: () => void }) | null;
    if (typeof eng?.cancelarReancoragem === 'function') {
      eng.cancelarReancoragem();
      console.log('[calib] reajuste rápido cancelado pela Emergência — amostras descartadas');
    } else {
      console.warn(
        '[calib] reajuste rápido interrompido na tela, mas este engine não tem cancelarReancoragem(): ' +
          'a coleta termina em segundo plano e é aplicada'
      );
    }
  }, []);

  const value = useMemo<GazeContextValue>(
    () => ({
      subscribe,
      state,
      l2csStatus,
      calibration,
      recording,
      setFilterPreset: (preset: FilterPreset | FilterPresetV2) =>
        engineRef.current?.setFilterPreset(preset),
      getDiagnostics: () => engineRef.current?.getDiagnostics() ?? null,
      getCameraStream: () => (videoRef.current?.srcObject as MediaStream | null) ?? null,
      getCameraAtual: () => cameraAtualRef.current,
      avisoDeCamera,
      limparAvisoDeCamera: () => setAvisoDeCamera(null),
      getCameraTuning: () => cameraTuningRef.current,
      getSessionUptimeMs: () => engineRef.current?.getSessionUptimeMs() ?? 0,
      // `isDwelling` continua exposto por compatibilidade, mas NÃO entra nas
      // deps do memo: quem precisa dele deve usar `useIsDwelling()`. Ler daqui
      // devolve o valor do último render em que outra coisa mudou.
      isDwelling,
      isComposing,
      setIsComposing,
      isDegraded,
      cameraError,
      calibrationInvalidated,
      gazeLostMessage,
      reancorando,
      cancelarReancoragem,
    }),
    // `isDwelling` deliberadamente FORA das deps — ver o comentário acima e
    // `DwellContext`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      subscribe,
      state,
      l2csStatus,
      calibration,
      recording,
      isComposing,
      setIsComposing,
      isDegraded,
      cameraError,
      calibrationInvalidated,
      gazeLostMessage,
      avisoDeCamera,
      reancorando,
      cancelarReancoragem,
    ]
  );

  return (
    <GazeContext.Provider value={value}>
      {/* Falhas que desligam o controle por olhar precisam ser VISÍVEIS. Sem
          isto, `cameraError` e `calibrationInvalidated` eram calculados e
          nunca renderizados: o usuário ficava com cursor invisível e nada
          clicável, sem explicação. */}
      <GazeStatusBanner
        state={state}
        cameraError={cameraError}
        calibrationInvalidated={calibrationInvalidated}
        distanceAdvice={distanceAdvice}
        gazeLostMessage={gazeLostMessage}
        avisoDeBorda={avisoDeBorda}
        avisoDeOlhosFechados={avisoDeOlhosFechados}
        avisoDeCamera={avisoDeCamera}
        avisoDePostura={avisoDePostura}
        onReancorar={reancorar}
        reancorando={reancorando}
        avisoDeRecalibracao={avisoDeRecalibracao}
        onRecalibrar={irRecalibrar}
        onDispensarRecalibracao={dispensarRecalibracao}
      />
      {/* Alvo único de 2 s: aparece só durante a coleta do reajuste rápido.
          Cobre a tela inteira MENOS a Emergência, que o `EmergencyProvider`
          sobe para cima dele enquanto `reancorando` (ver `Z_DO_REAJUSTE`). */}
      {reancorando && <ReancoragemOverlay duracaoMs={DURACAO_DO_REAJUSTE_MS} />}
      {/* A varredura fica DENTRO do provider e FORA do `DwellContext`: ela não
          depende de dwell e não deve re-renderizar a cada alternância dele. */}
      <ScanningMode />
      {/* `isDwelling` num provider próprio: uma alternância de dwell só
          invalida este contexto, não os consumidores de `useGaze()`. */}
      <DwellContext.Provider value={isDwelling}>{children}</DwellContext.Provider>
    </GazeContext.Provider>
  );
};
