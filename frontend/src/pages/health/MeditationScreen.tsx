import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pause, Play, RotateCcw, CheckCircle2 } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { getSharedAudioContext } from '../../utils/emergencyAudio';

/**
 * MEDITAÇÃO VISUAL — respiração guiada por um círculo que cresce e encolhe.
 *
 * Toda a operação é por `GazeButton`: iniciar, pausar e voltar. É a única
 * tela do módulo em que o paciente pode ficar parado por vários minutos, então
 * a saída precisa continuar visível o tempo todo — nada aqui entra em tela
 * cheia nem esconde a navegação.
 */

type Fase = 'Inale' | 'Segure' | 'Exale';

/**
 * Ciclo 4-4-4.
 *
 * Igual para as três fases de propósito: um ritmo constante é o que o círculo
 * consegue comunicar sem texto, e o paciente acompanha pelo TAMANHO do
 * círculo, não pela palavra — quem já perdeu a leitura ainda vê a forma.
 */
const DURACAO_DA_FASE_MS = 4000;

const SEQUENCIA: Fase[] = ['Inale', 'Segure', 'Exale'];

/**
 * Durações que a pessoa escolhe, em minutos.
 *
 * Sem fim a sessão só acabava quando alguém pausava — e quem está de olhos
 * semicerrados respirando não está olhando para o botão. Com um fim marcado o
 * app diz "acabou" e a pessoa não precisa vigiar o relógio.
 */
export const DURACOES_MIN = [2, 5] as const;

/** Um toque suave de duas notas ao terminar. Silencioso se não houver áudio. */
function sinalDeFim(): void {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0 + i * 0.35);
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + i * 0.35 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + i * 0.35);
      osc.stop(t0 + i * 0.35 + 0.65);
    });
  } catch {
    /* sem áudio: o aviso visual basta */
  }
}

export const MeditationScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [ativa, setAtiva] = useState(false);
  /**
   * Fonte única de verdade: quantas fases já passaram desde o início.
   *
   * A fase atual e o número de ciclos são DERIVADOS daqui. Antes eram dois
   * estados independentes, e o ciclo era incrementado de dentro do updater da
   * fase — updater impuro, que em StrictMode roda duas vezes e contava dois
   * ciclos por volta.
   */
  const [fasesDecorridas, setFasesDecorridas] = useState(0);
  const [duracaoMin, setDuracaoMin] = useState<(typeof DURACOES_MIN)[number]>(DURACOES_MIN[0]);
  const [concluida, setConcluida] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const indiceDaFase = fasesDecorridas % SEQUENCIA.length;
  const ciclos = Math.floor(fasesDecorridas / SEQUENCIA.length);
  const fase = SEQUENCIA[indiceDaFase];
  const fasesDaSessao = Math.round((duracaoMin * 60_000) / DURACAO_DA_FASE_MS);

  // Fim da sessão: para sozinha, avisa na tela e com um toque. Derivado do
  // contador de fases, que é a fonte única.
  useEffect(() => {
    if (!ativa || fasesDecorridas < fasesDaSessao) return;
    setAtiva(false);
    setConcluida(true);
    sinalDeFim();
  }, [ativa, fasesDecorridas, fasesDaSessao]);

  useEffect(() => {
    if (!ativa) return;
    // Um `setInterval` único, e não uma cadeia de `setTimeout` que se
    // reagenda: a versão anterior só marcava um booleano `cancelled` no
    // cleanup, e os timeouts já agendados continuavam disparando `setState`
    // depois de a tela sair — um por fase, para sempre, enquanto a aba vivesse.
    intervalRef.current = window.setInterval(() => {
      // O updater de `useState` tem de ser PURO: em StrictMode o React o
      // invoca duas vezes, e um `setCiclos` aqui dentro contava dois ciclos a
      // cada volta. O contador de fases é a fonte única; o de ciclos deriva
      // dele no efeito abaixo.
      setFasesDecorridas((n) => n + 1);
    }, DURACAO_DA_FASE_MS);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [ativa]);

  const reiniciar = useCallback(() => {
    setAtiva(false);
    setFasesDecorridas(0);
    setConcluida(false);
  }, []);

  const iniciarOuPausar = useCallback(() => {
    setConcluida(false);
    setFasesDecorridas((n) => (n >= fasesDaSessao ? 0 : n));
    setAtiva((a) => !a);
  }, [fasesDaSessao]);

  // O círculo está grande durante "Inale" e "Segure" (o ar já entrou) e volta
  // ao tamanho normal em "Exale".
  const escala = ativa && (fase === 'Inale' || fase === 'Segure') ? 1.5 : 1;

  return (
    <main
      role="main"
      aria-labelledby="meditation-title"
      style={{
        // Altura fixa com rolagem própria: era `minHeight: 100vh` e, a 768 p,
        // quem rolava era o documento (o conteúdo passava sob a Emergência).
        height: '100dvh',
        overflowY: 'auto',
        width: '100%',
        boxSizing: 'border-box',
        background:
          'radial-gradient(circle at 50% 40%, rgba(217,70,239,0.14), transparent 60%), var(--color-bg-base)',
        color: 'var(--color-text-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem 3rem 3rem 3rem',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <header
        className="reserva-emergencia"
        style={{ '--reserva-margem': '3rem', display: 'flex', alignItems: 'center', gap: '1.5rem', width: '100%' }}
      >
        <GazeButton
          onClick={() => navigate('/games')}
          width={200}
          height={68}
          isolado
          style={{
            borderRadius: '1.5rem',
            background: 'var(--color-card-bg)',
            border: '2px solid var(--color-card-border)',
            boxShadow: '0 6px 20px var(--color-card-shadow)',
          }}
          aria-label={t('lazer.voltarAria')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '1.3rem', fontWeight: 800 }}>
            <ArrowLeft size={28} /> Voltar
          </span>
        </GazeButton>

        <div>
          <h1 id="meditation-title" style={{ fontSize: '2rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
            Meditação Visual
          </h1>
          <p style={{ fontSize: '1.15rem', margin: '0.2rem 0 0 0', opacity: 0.75, fontWeight: 500 }}>
            Acompanhe o círculo com a sua respiração
          </p>
        </div>

        <div
          role="status"
          aria-live="polite"
          aria-label={
            ativa ? `Fase atual: ${fase}. Ciclos completos: ${ciclos}.` : 'Sessão parada'
          }
          data-no-dwell="true"
          style={{
            marginLeft: 'auto',
            background: 'var(--color-card-bg)',
            border: '2px solid var(--color-card-border)',
            borderRadius: '1.25rem',
            padding: '0.75rem 1.75rem',
            fontSize: '1.15rem',
            fontWeight: 800,
          }}
        >
          Ciclos completos: {ciclos}
        </div>
      </header>

      {/* Duração: dois alvos grandes, escolha antes ou durante. */}
      <div
        role="radiogroup"
        aria-label="Duração da sessão"
        style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}
      >
        {DURACOES_MIN.map((min) => (
          <GazeButton
            key={min}
            role="radio"
            aria-checked={duracaoMin === min}
            aria-label={`Sessão de ${min} minutos`}
            onClick={() => {
              setDuracaoMin(min);
              setConcluida(false);
            }}
            width={220}
            height={76}
            style={{
              borderRadius: '1.5rem',
              background: duracaoMin === min ? 'var(--color-primary)' : 'var(--color-card-bg)',
              color: duracaoMin === min ? '#ffffff' : 'var(--color-text-base)',
              border: duracaoMin === min ? '3px solid var(--color-primary)' : '2px solid var(--color-card-border)',
              fontSize: '1.2rem',
              fontWeight: 800,
            }}
          >
            {min} min
          </GazeButton>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '3rem',
          paddingTop: '2rem',
        }}
      >
        <div
          role="img"
          aria-label={ativa ? `Círculo de respiração: ${fase}` : 'Círculo de respiração parado'}
          data-no-dwell="true"
          style={{
            width: 360,
            height: 360,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #60a5fa, var(--color-primary))',
              // A transição dura o mesmo que a fase: o crescimento do círculo É
              // o guia da inspiração, então ele precisa acabar quando ela acaba.
              transition: `transform ${DURACAO_DA_FASE_MS}ms ease-in-out`,
              transform: `scale(${escala})`,
              boxShadow: '0 0 60px rgba(27,84,168,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '2.1rem',
              fontWeight: 900,
              textShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
          >
            {ativa ? fase : concluida ? 'Fim' : 'Pronto'}
          </div>
        </div>

        {concluida && (
          <div
            role="status"
            aria-live="polite"
            data-no-dwell="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem 1.5rem',
              borderRadius: '1.25rem',
              background: 'var(--tint-ok-bg)',
              border: '2px solid var(--tint-ok-border)',
              color: 'var(--tint-ok-text)',
              fontSize: '1.25rem',
              fontWeight: 800,
            }}
          >
            <CheckCircle2 size={28} aria-hidden="true" />
            Sessão de {duracaoMin} minutos concluída. Respire no seu ritmo.
          </div>
        )}

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <GazeButton
            onClick={iniciarOuPausar}
            width={300}
            height={88}
            aria-pressed={ativa}
            aria-label={ativa ? 'Pausar a sessão de respiração' : 'Iniciar a sessão de respiração'}
            style={{
              borderRadius: '1.75rem',
              background: ativa ? 'var(--color-card-bg)' : 'var(--color-primary)',
              color: ativa ? 'var(--color-primary)' : '#ffffff',
              border: ativa ? '3px solid var(--color-primary)' : '2px solid rgba(255,255,255,0.3)',
              boxShadow: ativa ? 'none' : '0 10px 26px rgba(27,84,168,0.35)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.35rem', fontWeight: 800 }}>
              {ativa ? <Pause size={30} /> : <Play size={30} />}
              {ativa ? 'Pausar' : 'Iniciar sessão'}
            </span>
          </GazeButton>

          <GazeButton
            onClick={reiniciar}
            width={240}
            height={88}
            style={{
              borderRadius: '1.75rem',
              background: 'var(--color-card-bg)',
              border: '2px solid var(--color-card-border)',
            }}
            aria-label="Reiniciar a contagem de ciclos"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '1.25rem', fontWeight: 800 }}>
              <RotateCcw size={28} /> Recomeçar
            </span>
          </GazeButton>
        </div>
      </div>
    </main>
  );
};
