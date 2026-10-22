import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { definirEmergenciaAtiva } from '../services/estadoDeEmergencia';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertOctagon } from 'lucide-react';
import { GazeButton } from '../components/ui/GazeButton';
import { Z_DO_REAJUSTE, ID_DA_EMERGENCIA } from '../components/ReancoragemOverlay';
import { useGaze } from './GazeContext';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';
import { playTickSound, playCancelSound } from '../utils/emergencyAudio';
import { dispararPedidoDeSocorro, definirVolumeMaximoDoAlarme } from '../services/emergencia/pedidoDeSocorro';
import { CONTAGEM_PADRAO_S, limitarContagemDaEmergencia } from '../services/emergencia/contagemDaEmergencia';
import { usePedidoDeSocorro } from '../services/emergencia/usePedidoDeSocorro';
import { useSettings } from './SettingsContext';
import { degToPx, GAZE_TOKENS } from '../design/gazeMetrics';
import { FaixaLateralDaEmergencia, CancelarPelaLateral, useColunaDaContagem } from '../components/FaixaLateralDaEmergencia';

/**
 * O alvo mínimo de 5° como o token do design system (`--gaze-target-min`, o
 * mesmo valor que `alvoMinimoPx()` lê), como em `EmergencyEscalation`: a
 * geometria do usuário chega depois do primeiro desenho, e o token acompanha.
 */
const ALVO_MINIMO = `var(--gaze-target-min, ${Math.round(degToPx(GAZE_TOKENS.targetMinDeg))}px)`;

/**
 * O que o pedido vai dizer quando a contagem chegar ao fim — tipo da grade
 * de emergência e o rótulo falado no alarme e enviado ao celular.
 */
export interface MotivoDoSocorro {
  tipo: string;
  rotulo: string;
}

interface EmergencyContextValue {
  isConfirming: boolean;
  cancelEmergency: () => void;
  triggerEmergencyImmediately: () => void;
  /**
   * Abre a MESMA confirmação do botão de Emergência (contagem com CANCELAR:
   * de 3 a 10 s, 5 s por padrão — ajuste do cuidador) a partir de outra tela —
   * hoje o mapa da dor, nos níveis 8 a 10 (19/10/2026). Nada é enviado sem a
   * contagem terminar; com um pedido já em andamento, leva à tela dele, como o
   * botão. `motivo` diz o que o pedido vai dizer ("DOR MUITO FORTE — braço
   * esquerdo, 9 de 10"); sem ele, vale o pedido genérico do botão.
   */
  iniciarContagemDeEmergencia: (motivo?: MotivoDoSocorro) => void;
  /**
   * Ensaio do tutorial: o acionamento acontece na tela e NADA sai daqui.
   *
   * O paciente precisa saber o que vai acontecer antes de precisar, mas um
   * ensaio que vaze dispara alerta real para um cuidador que não está lá. Uma
   * ou duas dessas e o alerta de verdade passa a ser tratado como possível
   * engano — que é quando ele deixa de funcionar.
   */
  setModoEnsaio: (on: boolean) => void;
  /** Se o ensaio foi acionado. O tutorial registra isso no perfil. */
  ensaioDisparado: boolean;
}

/**
 * Pegada do botão no topo. Têm de bater com `--emergencia-largura` e
 * `--emergencia-altura` em index.css — o teste `reservaDaEmergencia` confere.
 */
export const EMERGENCIA_LARGURA_PX = 200;
/** Altura MÁXIMA no topo: a do Voltar canônico. Era 64 px, uma faixa baixa na
 *  borda de cima, onde o erro do olhar é maior (FE-18). A altura em vigor é
 *  `--emergencia-altura` (encolhe em janela baixa para não encostar no
 *  conteúdo). Ver também `.emergencia-fab--topo`. */
export const EMERGENCIA_ALTURA_PX = 96;

/** Camada normal do botão flutuante. */
export const Z_EMERGENCIA = 99990;

/**
 * Quanto tempo o ensaio do tutorial fica armado. Antes ele durava enquanto o
 * passo estivesse aberto: um paciente parado ali (cansaço, cuidador saiu)
 * ficava com o socorro inoperante pelo tempo que fosse (FE-14).
 */
export const PRAZO_DO_ENSAIO_MS = 60_000;
/**
 * Camada do botão durante o reajuste rápido: logo ACIMA do overlay preto do
 * reajuste, que cobre todo o resto. A Emergência nunca some.
 */
export const Z_EMERGENCIA_NO_REAJUSTE = Z_DO_REAJUSTE + 1;

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

const ROTAS_SEM_AVISO_DE_DEGRADADO = new Set(['/', '/login', '/calibration-check', '/emergency']);

export const useEmergency = () => {
  const ctx = useContext(EmergencyContext);
  if (!ctx) throw new Error('useEmergency must be used inside <EmergencyProvider>');
  return ctx;
};

export const EmergencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDegraded, state, reancorando, cancelarReancoragem } = useGaze();

  // Durante a calibração e o teste de precisão o botão desce para o canto
  // inferior direito e some se ainda assim cobrir um alvo. Um botão sobre o
  // alvo de borda não é incômodo visual: numa sessão real produziu erro de
  // borda de 740 px contra 123 px de interior.
  const [medindo, setMedindo] = useState(false);
  const [fabOculto, setFabOculto] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  const [isConfirming, setIsConfirming] = useState(false);
  const [countdown, setCountdown] = useState(CONTAGEM_PADRAO_S);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Fora do AuthProvider (testes de tela) vem `{}`: sem cuidador conectado.
  const { isCaregiver } = useAuth();
  const { t } = useTranslation();
  const pedido = usePedidoDeSocorro();
  const pedidoAtivo = pedido !== null && pedido.fase !== 'encerrado';
  const { settings } = useSettings();
  const volumeMaximo = settings?.alarmeComVolumeMaximo !== false;
  useEffect(() => {
    definirVolumeMaximoDoAlarme(volumeMaximo);
  }, [volumeMaximo]);
  // Quantos segundos a contagem dura (decisão 5 da rodada 3, 21/10/2026): o
  // ajuste do cuidador, sempre dentro de 3–10 s — um valor ruim nunca chega a 0,
  // que mandaria o socorro na hora, sem CANCELAR. É lido na hora de abrir a
  // confirmação (estas funções são refeitas a cada desenho): mudar o ajuste
  // não mexe numa contagem que já está andando.
  const contagemInicialS = limitarContagemDaEmergencia(settings?.contagemDaEmergenciaS);

  /** Motivo da contagem em curso; `null` = o pedido genérico do botão. */
  const motivoDaContagemRef = useRef<MotivoDoSocorro | null>(null);

  /**
   * O ENVIO. Mora aqui (e não na tela `/emergency`) desde 19/10/2026: o pedido
   * sai e o alarme passa a ser vigiado antes de qualquer navegação, então um
   * erro ao desenhar a tela de emergência não impede mais o socorro (auditoria
   * de 18/10/2026, item 6). A tela só mostra o estado.
   */
  const enviarSocorro = () => {
    // O motivo vale só para a contagem que o definiu (ver
    // `iniciarContagemDeEmergencia`); é consumido aqui.
    const motivo = motivoDaContagemRef.current;
    motivoDaContagemRef.current = null;
    dispararPedidoDeSocorro(motivo?.tipo ?? 'other', motivo?.rotulo ?? t('emergency.items.other'));
    navigate('/emergency');
  };

  // o som vem de `utils/emergencyAudio`, que mantém UM `AudioContext`
  // para a sessão inteira.
  //
  // Antes, cada tick criava `new AudioCtx()` e nada era fechado. O Chromium
  // limita ~50 contextos por documento: depois de ~8 acionamentos o construtor
  // passava a lançar dentro de um `catch` silencioso, e o feedback sonoro da
  // emergência sumia pelo resto da sessão — o canal que avisa o cuidador,
  // falhando exatamente num dia de acionamentos frequentes.

  /**
   * Emergência escolhida durante o reajuste rápido: o reajuste é cancelado
   * (as amostras são descartadas — quem olhou para o botão não estava olhando
   * o centro) e o overlay sai na hora, para a confirmação aparecer limpa.
   */
  const interromperReajuste = () => {
    if (reancorando) cancelarReancoragem();
  };

  const startEmergencyCountdown = () => {
    if (isConfirming) return;
    // Pedido já em andamento: o botão leva à tela dele, sem nova contagem nem
    // segundo pedido.
    if (pedidoAtivo) {
      navigate('/emergency');
      return;
    }
    interromperReajuste();
    // Contagem aberta pelo botão: o pedido é o genérico. Quem abre com motivo
    // (`iniciarContagemDeEmergencia`) o define logo depois desta linha.
    motivoDaContagemRef.current = null;
    ensaioNestaConfirmacaoRef.current = modoEnsaioRef.current;
    setConfirmacaoDeEnsaio(modoEnsaioRef.current);
    setIsConfirming(true);
    setCountdown(contagemInicialS);
    playTickSound();
  };

  const iniciarContagemDeEmergencia = (motivo?: MotivoDoSocorro) => {
    // Mesmas guardas do botão: confirmação já aberta não reinicia; pedido em
    // andamento leva à tela dele (sem nova contagem nem segundo pedido).
    if (isConfirming || pedidoAtivo) {
      startEmergencyCountdown();
      return;
    }
    startEmergencyCountdown();
    motivoDaContagemRef.current = motivo ?? null;
  };

  const cancelEmergency = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsConfirming(false);
    setCountdown(contagemInicialS);
    ensaioNestaConfirmacaoRef.current = false;
    setConfirmacaoDeEnsaio(false);
    motivoDaContagemRef.current = null;

    // Som de cancelamento (bip duplo rápido de confirmação de recuo).
    // reutiliza o contexto compartilhado; ver o comentário acima.
    playCancelSound();
  };

  /**
   * Numa ref, e não só no estado: o efeito da contagem regressiva lê o valor no
   * momento em que dispara, e uma closure obsoleta ali significaria alerta real
   * enviado durante um ensaio.
   */
  const modoEnsaioRef = useRef(false);
  const [ensaioDisparado, setEnsaioDisparado] = useState(false);
  const prazoDoEnsaioRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Se a confirmação em curso começou como ENSAIO. Decidido na abertura e
   * mantido até o fim: o título que o paciente viu ("ENSAIO — NADA SERÁ
   * ENVIADO") vale para aquela contagem, mesmo que o prazo do ensaio vença
   * no meio dela.
   */
  const ensaioNestaConfirmacaoRef = useRef(false);
  const [confirmacaoDeEnsaio, setConfirmacaoDeEnsaio] = useState(false);

  const limparPrazoDoEnsaio = () => {
    if (prazoDoEnsaioRef.current) {
      clearTimeout(prazoDoEnsaioRef.current);
      prazoDoEnsaioRef.current = null;
    }
  };

  const setModoEnsaio = useCallback((on: boolean) => {
    limparPrazoDoEnsaio();
    modoEnsaioRef.current = on;
    if (!on) {
      setEnsaioDisparado(false);
      return;
    }
    // Ensaio com prazo: passado o tempo, o botão volta a valer sozinho.
    prazoDoEnsaioRef.current = setTimeout(() => {
      prazoDoEnsaioRef.current = null;
      modoEnsaioRef.current = false;
    }, PRAZO_DO_ENSAIO_MS);
  }, []);

  /** Um ensaio só: depois do primeiro acionamento, o próximo é de verdade. */
  const concluirEnsaio = () => {
    limparPrazoDoEnsaio();
    motivoDaContagemRef.current = null;
    modoEnsaioRef.current = false;
    ensaioNestaConfirmacaoRef.current = false;
    setConfirmacaoDeEnsaio(false);
    setEnsaioDisparado(true);
  };

  const triggerEmergencyImmediately = () => {
    interromperReajuste();
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsConfirming(false);

    // O ENSAIO PARA AQUI: nada é enviado e nenhum alarme é armado.
    const ehEnsaio = isConfirming ? ensaioNestaConfirmacaoRef.current : modoEnsaioRef.current;
    if (ehEnsaio) {
      concluirEnsaio();
      return;
    }
    ensaioNestaConfirmacaoRef.current = false;
    setConfirmacaoDeEnsaio(false);

    enviarSocorro();
  };

  // Espelha o alarme num sinal de módulo, para o dispatcher de dwell poder
  // consultá-lo sem depender deste contexto (ver `estadoDeEmergencia.ts`).
  useEffect(() => {
    definirEmergenciaAtiva(isConfirming, 'confirmacao');
    return () => definirEmergenciaAtiva(false, 'confirmacao');
  }, [isConfirming]);

  useEffect(() => {
    if (isConfirming) {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            return 0;
          }
          playTickSound();
          return c - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isConfirming]);

  useEffect(() => {
    if (isConfirming && countdown === 0) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setIsConfirming(false);

      // Segundo caminho até o envio: a contagem chegando a zero. Sem esta
      // guarda, esperar o contador durante o ensaio mandaria o alerta de
      // verdade — e é justamente o que um paciente curioso faria.
      if (ensaioNestaConfirmacaoRef.current) {
        concluirEnsaio();
        return;
      }
      setConfirmacaoDeEnsaio(false);

      enviarSocorro();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirming, countdown, navigate]);

  // Desliga ao desmontar. Um ensaio que ficasse ligado transformaria o botão de
  // emergência num enfeite pelo resto da sessão — a falha mais perigosa aqui.
  useEffect(
    () => () => {
      modoEnsaioRef.current = false;
      limparPrazoDoEnsaio();
    },
    []
  );

  // O botão aparece em TODA tela, menos a própria tela de emergência — inclusive
  // no login, no portão do PIN e nas telas do cuidador.
  //
  // Antes a regra era por ROTA: `/`, `/login`, `/settings*` e `/caregiver*` não
  // eram "telas de paciente". Mas o menu do paciente leva a `/settings`, uma
  // área do cuidador esquecida destravada fica na frente do paciente, e uma
  // licença bloqueada (ou uma verificação que não responde) joga tudo no
  // `/login`: em todos esses casos o paciente ficava sem socorro. O alarme
  // local não depende de conta nem de licença (a rota `/emergency` também não
  // passa pelo portão da licença — ver App.tsx). As telas do cuidador reservam
  // o canto do botão como as do paciente (`reserva-emergencia`).
  //
  // Durante o reajuste rápido o overlay preto cobre todo o resto, e o botão
  // continua ao alcance — do olhar, do mouse e do teclado.
  const showEmergencyButton = location.pathname !== '/emergency';

  useEffect(() => {
    if (!showEmergencyButton) {
      setMedindo(false);
      return;
    }
    // O ponto do teste de precisão é desenhado pelo núcleo (`#accuracy-dot`).
    const verificar = () =>
      setMedindo(state === 'calibrating' || document.getElementById('accuracy-dot') !== null);
    verificar();
    const id = setInterval(verificar, 300);
    return () => clearInterval(id);
  }, [showEmergencyButton, state]);

  useEffect(() => {
    if (!medindo || !showEmergencyButton) {
      setFabOculto(false);
      return;
    }
    const verificar = () => {
      const el = fabRef.current;
      if (!el || typeof document.elementsFromPoint !== 'function') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const cantos: Array<[number, number]> = [
        [r.left + 2, r.top + 2],
        [r.right - 2, r.top + 2],
        [r.left + 2, r.bottom - 2],
        [r.right - 2, r.bottom - 2],
        [r.left + r.width / 2, r.top + r.height / 2],
      ];
      const cobre = cantos.some(([x, y]) =>
        document
          .elementsFromPoint(x, y)
          .some((e) => !el.contains(e) && e.closest('[data-calibration-target]') !== null)
      );
      setFabOculto(cobre);
    };
    verificar();
    const id = setInterval(verificar, 300);
    return () => clearInterval(id);
  }, [medindo, showEmergencyButton]);
  // Teclado durante o reajuste rápido: com o overlay preto por cima de tudo, a
  // Emergência é o único controle visível — Tab e Shift+Tab vão para ela (e não
  // para botões escondidos debaixo do overlay). Sem foco automático: um Enter
  // segurado desde o "Reajustar" dispararia o alarme sozinho.
  useEffect(() => {
    if (!reancorando) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const botao = fabRef.current?.querySelector<HTMLButtonElement>('button[data-emergency="true"]');
      if (!botao) return;
      e.preventDefault();
      botao.focus();
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [reancorando]);

  // Publica ONDE o botão está, para o CSS reservar o espaço dele (ver
  // `.reserva-emergencia` em index.css). Atributo no <html>, e não contexto
  // React, porque quem precisa ler são folhas de estilo de telas que nem
  // sabem que o provider existe — e porque a reserva tem de valer no primeiro
  // quadro, sem um render a mais de cada tela.
  // Modo só horizontal (21/10/2026): fora da medição, a Emergência é uma faixa
  // na borda direita, acionada pela coluna do olhar. Na medição vale o botão do
  // canto, sem dwell, como sempre: a faixa cobriria os alvos da direita.
  const faixaLateral = settings?.modoHorizontal === true && !medindo;
  // O texto da contagem só ocupa a coluna do meio no modo só horizontal (revisão
  // final, rodada 1, I1): as faixas das duas bordas são alvos do olhar.
  const coluna = useColunaDaContagem(settings?.modoHorizontal === true && isConfirming);
  const posicaoDoBotao: 'topo' | 'canto' | 'faixa' | null =
    showEmergencyButton && !isConfirming ? (medindo ? 'canto' : faixaLateral ? 'faixa' : 'topo') : null;
  useEffect(() => {
    const html = document.documentElement;
    if (posicaoDoBotao) html.setAttribute('data-emergencia', posicaoDoBotao);
    else html.removeAttribute('data-emergencia');
  }, [posicaoDoBotao]);
  useEffect(() => () => document.documentElement.removeAttribute('data-emergencia'), []);

  // O "Recalibre aqui" é caminho do PACIENTE: não aparece com o cuidador
  // conectado (ele usa o mouse), nem onde recalibrar não leva a lugar nenhum —
  // splash, login (sem licença a calibração devolve para o login), a própria
  // calibração e a emergência.
  const showDegradedBanner =
    !isCaregiver && !ROTAS_SEM_AVISO_DE_DEGRADADO.has(location.pathname) && isDegraded;

  return (
    <EmergencyContext.Provider
      value={{
        isConfirming,
        cancelEmergency,
        triggerEmergencyImmediately,
        iniciarContagemDeEmergencia,
        setModoEnsaio,
        ensaioDisparado,
      }}
    >
      {children}

      {/* Indicador de Rastreamento Degradado */}
      {showDegradedBanner && !isConfirming && (
        <div
          style={{
            position: 'fixed',
            top: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99980,
          }}
        >
          <GazeButton
            onClick={() => navigate('/calibration-check')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: '#fef3c7',
              border: '2px solid #f59e0b',
              borderRadius: '2rem',
              color: '#b45309',
              padding: '0.65rem 1.5rem',
              boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.2)',
              cursor: 'pointer',
              height: 'auto',
              width: 'auto',
            }}
            noWarn
            /*
             * sem `recovery`, este botão era decorativo.
             *
             * O banner só aparece quando `isDegraded === true`, e o dispatcher
             * de dwell bloqueava todo alvo não-emergency exatamente nesse
             * estado. O paciente ficava com o cursor amarelo tracejado, este
             * banner piscando "Recalibre aqui", e nenhuma forma de acioná-lo
             * pelo único meio de entrada que tem. Para alguém com ELA usando
             * o sistema sem acompanhante, era perda total de autonomia.
             */
            recovery
          >
            <AlertOctagon size={20} color="#d97706" />
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              Rastreamento impreciso — Recalibre aqui
            </span>
          </GazeButton>
        </div>
      )}

      {/* Modo só horizontal: a faixa da borda direita no lugar do botão do topo. */}
      {showEmergencyButton && !isConfirming && faixaLateral && (
        <FaixaLateralDaEmergencia
          ref={fabRef}
          aoAcionar={startEmergencyCountdown}
          degradado={isDegraded}
          pedidoAtivo={pedidoAtivo}
          zIndex={reancorando ? Z_EMERGENCIA_NO_REAJUSTE : Z_EMERGENCIA}
        />
      )}

      {/* Botão de Emergência Fixo Canônico */}
      {showEmergencyButton && !isConfirming && !faixaLateral && (
        <div
          ref={fabRef}
          // No topo, a zona de acerto vai até as bordas de cima e da direita
          // da janela (index.css, `.emergencia-fab--topo`). No canto de baixo,
          // durante a medição, fica a zona comum: ali há alvos de calibração.
          className={medindo ? 'emergencia-fab' : 'emergencia-fab emergencia-fab--topo'}
          style={{
            position: 'fixed',
            // No topo, a posição vem das MESMAS variáveis que os cabeçalhos
            // usam para reservar o espaço (index.css). Eram `2rem`/`3rem`
            // cravados aqui enquanto o cabeçalho usava `clamp(…2.5vw…)`: a
            // 1366 px os dois discordavam em 14 px e o chip de sessão entrava
            // por baixo do botão.
            ...(medindo
              ? { bottom: '1.5rem', right: '1.5rem' }
              : { top: 'var(--emergencia-topo)', right: 'var(--emergencia-direita)' }),
            // No reajuste rápido, acima do overlay preto (e nunca escondido):
            // o alvo do reajuste fica no centro, longe deste canto.
            zIndex: reancorando ? Z_EMERGENCIA_NO_REAJUSTE : Z_EMERGENCIA,
            visibility: fabOculto && !reancorando ? 'hidden' : undefined,
          }}
        >
          <GazeButton
            emergency
            // O diálogo do reajuste rápido (modal) adota este botão pelo
            // `aria-owns`: o leitor de tela continua achando a Emergência.
            id={ID_DA_EMERGENCIA}
            /* 132 px não cabiam o conteúdo: "Emergência" em 1,25rem/700
               mede ~132 px SOZINHA, e com o ícone de 24 px mais o gap o
               texto vazava ~18 px para cada lado da borda arredondada —
               fora da área de acerto do dwell, que segue a caixa do
               botão. 176 px cabe sem mudar a tipografia; quando ainda
               assim cobrir um alvo, o `fabOculto` esconde o botão. */
            width={medindo ? 176 : EMERGENCIA_LARGURA_PX}
            height={medindo ? 52 : undefined}
            // No topo, a altura vem do CSS (`--emergencia-altura`): até 96 px,
            // menos em janela baixa. As telas reservam o espaço pela mesma
            // variável.
            style={medindo ? { opacity: 0.72 } : { height: 'var(--emergencia-altura)' }}
            onClick={startEmergencyCountdown}
            data-dwell-ms={isDegraded ? 3600 : 2000}
            // Nunca mais fácil de acionar que uma tecla comum: para quem usa
            // dwell longo, pelo menos 1,3× o dele (FE-13). O CANCELAR fica curto.
            data-dwell-mult={1.3}
            // Durante a calibração e o teste de precisão o olhar fica parado em
            // alvos, inclusive nos cantos, e o tremor em volta do alvo do canto
            // enchia o dwell deste botão sem a pessoa querer (relato de
            // 18/10/2026). Na medição ele continua visível e acionável pelo
            // mouse e pelo teclado — quem conduz a medição está ao lado —, mas
            // não pelo olhar. Fora da medição, nada muda.
            data-no-dwell={medindo ? 'true' : undefined}
            aria-label={
              pedidoAtivo
                ? 'Ver o pedido de socorro em andamento'
                : medindo
                  ? 'Disparar Emergência Médica (durante a medição, pelo mouse ou teclado)'
                  : 'Disparar Emergência Médica'
            }
          >
            <AlertOctagon size={24} /> {pedidoAtivo ? 'Socorro em andamento' : 'Emergência'}
          </GazeButton>
        </div>
      )}

      {/* Modal Fullscreen de Confirmação */}
      {isConfirming && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="emerg-confirm-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(239, 68, 68, 0.95)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontFamily: "'Inter', sans-serif",
            animation: 'flashBg 0.5s infinite alternate',
            // Modo só horizontal: o conteúdo fica entre as duas faixas, longe
            // delas (ver `useColunaDaContagem`). O CANCELAR da esquerda é
            // absoluto, e o `padding` não o desloca.
            ...(coluna ? { boxSizing: 'border-box' as const, paddingLeft: `${coluna.margemPx}px`, paddingRight: `${coluna.margemPx}px` } : {}),
          }}
        >
          <style>{`
            @keyframes flashBg {
              from { background-color: rgba(220, 38, 38, 0.95); }
              to { background-color: rgba(153, 27, 27, 0.95); }
            }
          `}</style>

          {/* Ícone, título e textos encolhem com a altura da janela (revisão
              de UX de 20/10/2026, achado 5): com o CANCELAR no alvo mínimo, a
              coluna de tamanhos fixos passava de 640 px de altura. */}
          <AlertOctagon
            aria-hidden="true"
            style={{
              width: 'clamp(48px, 14vh, 120px)',
              height: 'clamp(48px, 14vh, 120px)',
              flexShrink: 0,
              marginBottom: 'clamp(0.5rem, 3vh, 2rem)',
              filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.3))',
            }}
          />

          <h1
            id="emerg-confirm-title"
            style={{
              fontSize: coluna ? `${coluna.tituloPx}px` : 'clamp(2.25rem, 8vh, 4.5rem)',
              lineHeight: 1.15,
              fontWeight: 900,
              margin: '0 0 clamp(0.25rem, 1.5vh, 1rem) 0',
              textAlign: 'center',
              textShadow: '0 4px 10px rgba(0,0,0,0.3)',
              ...(coluna ? { overflowWrap: 'anywhere' as const } : {}),
            }}
          >
            {/* Durante o ensaio do tutorial a confirmação é IDÊNTICA à real.
                Um cuidador entrando na sala nesse momento acharia que está
                acontecendo de verdade — daí o rótulo. */}
            {confirmacaoDeEnsaio ? 'ENSAIO — NADA SERÁ ENVIADO' : 'EMERGÊNCIA ACIONADA'}
          </h1>

          <p
            style={{
              fontSize: 'clamp(1.25rem, 3.5vh, 2rem)',
              lineHeight: 1.3,
              fontWeight: 700,
              margin: '0 0 clamp(1rem, 6vh, 4rem) 0',
              textAlign: 'center',
              opacity: 0.9,
              ...(coluna ? { overflowWrap: 'anywhere' as const } : {}),
            }}
          >
            Enviando alerta de socorro em{' '}
            <strong style={{ fontSize: 'clamp(1.75rem, 5.5vh, 3rem)', color: '#fde047' }}>{countdown}</strong> segundos...
          </p>

          <GazeButton
            onClick={cancelEmergency}
            data-dwell-ms={1000} // dwell rápido para facilidade de cancelamento voluntário
            // Acionável pelo olhar também durante a calibração e com o
            // rastreamento degradado (GazeContext): um acionamento acidental
            // nesses momentos precisa poder ser desfeito antes da contagem acabar.
            data-cancelar-emergencia="true"
            // Modo só horizontal (revisão de 21/10/2026): o cancelar do olhar é
            // a faixa da esquerda. Este, no meio e logo abaixo do texto da
            // contagem, cancelava o socorro de quem só lia, num y que caísse
            // nele. Mouse e teclado continuam aqui; o acionador, pela faixa.
            data-no-dwell={settings?.modoHorizontal === true ? 'true' : undefined}
            // O alvo mínimo (5°) nos dois eixos (revisão de UX de 20/10/2026,
            // achado 5): era 320×84 px, ~2,7° de altura — o botão que desfaz um
            // alarme falso era um dos menores do app. A largura de antes fica
            // como piso, e o botão não passa da largura da janela.
            style={{
              width: `max(320px, ${ALVO_MINIMO})`,
              // No modo só horizontal, também não passa da coluna do meio.
              maxWidth: coluna ? `${coluna.colunaPx}px` : '90vw',
              height: ALVO_MINIMO,
              flexShrink: 0,
              background: '#ffffff',
              border: 'none',
              borderRadius: '2rem',
              color: '#dc2626',
              boxShadow: '0 15px 30px rgba(0,0,0,0.3)',
              // Sem dwell não é desabilitado: o CSS comum do `data-no-dwell`
              // apagaria o botão e tiraria o ponteiro do mouse.
              ...(settings?.modoHorizontal === true ? { pointerEvents: 'auto' as const, opacity: 1, cursor: 'pointer' } : {}),
            }}
          >
            <span style={{ fontSize: '1.8rem', fontWeight: 900 }}>CANCELAR</span>
          </GazeButton>
          {/* Modo só horizontal: o CANCELAR também pela coluna, na borda esquerda. */}
          {settings?.modoHorizontal === true && <CancelarPelaLateral aoCancelar={cancelEmergency} />}
        </div>
      )}
    </EmergencyContext.Provider>
  );
};
