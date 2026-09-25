import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { definirEmergenciaAtiva } from '../services/estadoDeEmergencia';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertOctagon } from 'lucide-react';
import { GazeButton } from '../components/ui/GazeButton';
import { Z_DO_REAJUSTE } from '../components/ReancoragemOverlay';
import { useGaze } from './GazeContext';
import { playTickSound, playCancelSound } from '../utils/emergencyAudio';

interface EmergencyContextValue {
  isConfirming: boolean;
  cancelEmergency: () => void;
  triggerEmergencyImmediately: () => void;
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
export const EMERGENCIA_ALTURA_PX = 64;

/** Camada normal do botão flutuante. */
export const Z_EMERGENCIA = 99990;
/**
 * Camada do botão durante o reajuste rápido: logo ACIMA do overlay preto do
 * reajuste, que cobre todo o resto. A Emergência nunca some.
 */
export const Z_EMERGENCIA_NO_REAJUSTE = Z_DO_REAJUSTE + 1;

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

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
  const [countdown, setCountdown] = useState(5);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determina se a tela atual é de uso do paciente
  const isPatientScreen = () => {
    const path = location.pathname;
    if (
      path === '/' ||
      path === '/login' ||
      path.startsWith('/caregiver') ||
      path.startsWith('/settings')
    ) {
      return false;
    }
    return true;
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
    interromperReajuste();
    setIsConfirming(true);
    setCountdown(5);
    playTickSound();
  };

  const cancelEmergency = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsConfirming(false);
    setCountdown(5);

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
  const [modoEnsaio, setModoEnsaioState] = useState(false);
  const [ensaioDisparado, setEnsaioDisparado] = useState(false);

  const setModoEnsaio = useCallback((on: boolean) => {
    modoEnsaioRef.current = on;
    setModoEnsaioState(on);
    if (!on) setEnsaioDisparado(false);
  }, []);

  const triggerEmergencyImmediately = () => {
    interromperReajuste();
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsConfirming(false);

    // O ENSAIO PARA AQUI. O envio não mora neste contexto — a navegação para
    // `/emergency?autoTrigger=other` é o que faz o `EmergencyEscalation`
    // emitir o pedido de ajuda (`emitirPedidoDeAjuda`). Não navegar é não enviar.
    if (modoEnsaioRef.current) {
      setEnsaioDisparado(true);
      return;
    }

    navigate('/emergency?autoTrigger=other');
  };

  // Espelha o alarme num sinal de módulo, para o dispatcher de dwell poder
  // consultá-lo sem depender deste contexto (ver `estadoDeEmergencia.ts`).
  useEffect(() => {
    definirEmergenciaAtiva(isConfirming);
    return () => definirEmergenciaAtiva(false);
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
      if (modoEnsaioRef.current) {
        setEnsaioDisparado(true);
        return;
      }

      navigate('/emergency?autoTrigger=other');
    }
  }, [isConfirming, countdown, navigate]);

  // Desliga ao desmontar. Um ensaio que ficasse ligado transformaria o botão de
  // emergência num enfeite pelo resto da sessão — a falha mais perigosa aqui.
  useEffect(
    () => () => {
      modoEnsaioRef.current = false;
    },
    []
  );

  // Durante o reajuste rápido o botão aparece em QUALQUER tela (menos a própria
  // emergência): o overlay preto do reajuste cobre todo o resto, e a Emergência
  // tem de continuar ao alcance — do olhar, do mouse e do teclado.
  const showEmergencyButton = (isPatientScreen() || reancorando === true) && location.pathname !== '/emergency';

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
  const posicaoDoBotao: 'topo' | 'canto' | null =
    showEmergencyButton && !isConfirming ? (medindo ? 'canto' : 'topo') : null;
  useEffect(() => {
    const html = document.documentElement;
    if (posicaoDoBotao) html.setAttribute('data-emergencia', posicaoDoBotao);
    else html.removeAttribute('data-emergencia');
  }, [posicaoDoBotao]);
  useEffect(() => () => document.documentElement.removeAttribute('data-emergencia'), []);

  const showDegradedBanner =
    isPatientScreen() &&
    location.pathname !== '/calibration-check' &&
    location.pathname !== '/emergency' &&
    isDegraded;

  return (
    <EmergencyContext.Provider
      value={{
        isConfirming,
        cancelEmergency,
        triggerEmergencyImmediately,
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

      {/* Botão de Emergência Fixo Canônico */}
      {showEmergencyButton && !isConfirming && (
        <div
          ref={fabRef}
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
            /* 132 px não cabiam o conteúdo: "Emergência" em 1,25rem/700
               mede ~132 px SOZINHA, e com o ícone de 24 px mais o gap o
               texto vazava ~18 px para cada lado da borda arredondada —
               fora da área de acerto do dwell, que segue a caixa do
               botão. 176 px cabe sem mudar a tipografia; quando ainda
               assim cobrir um alvo, o `fabOculto` esconde o botão. */
            width={medindo ? 176 : EMERGENCIA_LARGURA_PX}
            height={medindo ? 52 : EMERGENCIA_ALTURA_PX}
            onClick={startEmergencyCountdown}
            data-dwell-ms={isDegraded ? 3600 : 2000}
            aria-label="Disparar Emergência Médica"
          >
            <AlertOctagon size={24} /> Emergência
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
          }}
        >
          <style>{`
            @keyframes flashBg {
              from { background-color: rgba(220, 38, 38, 0.95); }
              to { background-color: rgba(153, 27, 27, 0.95); }
            }
          `}</style>

          <AlertOctagon
            size={120}
            style={{ marginBottom: '2rem', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.3))' }}
          />

          <h1
            id="emerg-confirm-title"
            style={{
              fontSize: '4.5rem',
              fontWeight: 900,
              margin: '0 0 1rem 0',
              textAlign: 'center',
              textShadow: '0 4px 10px rgba(0,0,0,0.3)',
            }}
          >
            {/* Durante o ensaio do tutorial a confirmação é IDÊNTICA à real.
                Um cuidador entrando na sala nesse momento acharia que está
                acontecendo de verdade — daí o rótulo. */}
            {modoEnsaio ? 'ENSAIO — NADA SERÁ ENVIADO' : 'EMERGÊNCIA ACIONADA'}
          </h1>

          <p
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              margin: '0 0 4rem 0',
              textAlign: 'center',
              opacity: 0.9,
            }}
          >
            Enviando alerta de socorro em{' '}
            <strong style={{ fontSize: '3rem', color: '#fde047' }}>{countdown}</strong> segundos...
          </p>

          <GazeButton
            onClick={cancelEmergency}
            data-dwell-ms={1000} // dwell rápido para facilidade de cancelamento voluntário
            // Acionável pelo olhar também durante a calibração e com o
            // rastreamento degradado (GazeContext): um acionamento acidental
            // nesses momentos precisa poder ser desfeito antes da contagem acabar.
            data-cancelar-emergencia="true"
            style={{
              width: '320px',
              height: '84px',
              background: '#ffffff',
              border: 'none',
              borderRadius: '2rem',
              color: '#dc2626',
              boxShadow: '0 15px 30px rgba(0,0,0,0.3)',
            }}
          >
            <span style={{ fontSize: '1.8rem', fontWeight: 900 }}>CANCELAR</span>
          </GazeButton>
        </div>
      )}
    </EmergencyContext.Provider>
  );
};
