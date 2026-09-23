import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Crosshair, Lock } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { useAuth } from '../../context/AuthContext';
import { useGaze } from '../../context/GazeContext';
import { useSettings } from '../../context/SettingsContext';
import { limitarDwellMs } from '../../dwellMs';
import { gravarTutorial, tutorialConcluido } from '../../services/local/tutorialProfile';
import {
  PASSOS_DO_TUTORIAL,
  MISSAO_DO_PASSO,
  PASSO_COM_TRAVA,
  ESPERA_MAXIMA_MS,
  ehPassoDoTutorial,
  indiceDoPassoDoTutorial,
  proximoPassoDoTutorial,
  passoAnteriorDoTutorial,
  type PassoDoTutorial,
} from './passos';
import {
  ensaioGuardado,
  guardarEnsaio,
  guardarPasso,
  limparMissoes,
  missaoCumprida,
  passoGuardado,
} from './missao';
import { OQueEDwell } from './steps/OQueEDwell';
import { PraticaGuiada } from './steps/PraticaGuiada';
import { AjusteDoTempo } from './steps/AjusteDoTempo';
import { BotaoDeEmergencia } from './steps/BotaoDeEmergencia';
import { Concluido } from './steps/Concluido';
import { PassoDeMissao } from './steps/PassoDeMissao';
import { MaisRecursos } from './steps/MaisRecursos';

/**
 * Tutorial de uso.
 *
 * Vem **depois** da calibração: "sentir o tempo de permanência" só é real com o
 * olhar funcionando. Antes da calibração o dwell fica desligado, e a prática
 * seria feita com o mouse — que não ensina nada sobre olhar.
 *
 * **Quase não bloqueia nada.** "Pular o tutorial" está em todos os passos, e
 * Voltar nunca tem condição. A única exceção é o passo de escrever uma frase, e ela
 * é deliberada — ver `PASSO_COM_TRAVA` em `passos.ts`, inclusive a escapatória
 * por tempo. Travar o acesso à comunicação por um tutorial contradiz a
 * premissa do projeto; travar UM passo até a pessoa escrever a primeira frase
 * é o oposto disso: é garantir que ela saia daqui sabendo que consegue.
 *
 * Uma rota só, passo no estado: o dwell precisa seguir ativo e configurado
 * entre os passos, e o slider do passo 3 tem de afetar a prática sem remontar.
 * O passo também é ESPELHADO em `sessionStorage`, porque a segunda metade do
 * tutorial sai desta rota e volta — e porque um F5 no meio não pode custar o
 * progresso inteiro.
 */
export const TutorialWizard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentProfile } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { calibration } = useGaze();
  // Lido a cada render de propósito: muda quando um perfil é carregado ou a
  // calibração é feita. Sem calibração o dwell fica DESLIGADO — a prática
  // "não responde" e nada na tela explicava por quê.
  const calibrado = calibration.isCalibrated();

  // Retoma de onde parou: ou de uma missão na tela real, ou de um F5.
  const [passo, setPassoState] = useState<PassoDoTutorial>(() => {
    const salvo = passoGuardado();
    return ehPassoDoTutorial(salvo) ? salvo : 'oQueEDwell';
  });
  // Espelhado no sessionStorage como o passo: o passo de emergência vem depois
  // das missões que saem desta rota, e remontar zerava o ensaio já feito.
  const [ensaiou, setEnsaiou] = useState(() => ensaioGuardado());
  const [missaoFeita, setMissaoFeita] = useState(false);
  const [esperaEsgotada, setEsperaEsgotada] = useState(false);

  const setPasso = useCallback((p: PassoDoTutorial) => {
    setPassoState(p);
    guardarPasso(p);
  }, []);

  const dwellMs = limitarDwellMs(settings.dwellMs);

  const mudarDwell = useCallback(
    (ms: number) => updateSettings({ dwellMs: limitarDwellMs(ms) }),
    [updateSettings]
  );

  const registrarEnsaio = useCallback(() => {
    setEnsaiou(true);
    guardarEnsaio();
  }, []);

  // Estado da missão do passo corrente, relido a cada troca de passo: a pessoa
  // pode ter cumprido a missão na tela real e voltado.
  const missaoDoPasso = MISSAO_DO_PASSO[passo] ?? null;
  useEffect(() => {
    setMissaoFeita(missaoDoPasso !== null && missaoCumprida(missaoDoPasso));
  }, [missaoDoPasso, passo]);

  /**
   * Escapatória da trava.
   *
   * O relógio corre por passo e é zerado a cada entrada. Sem ele, um paciente
   * com o rastreamento ruim naquele minuto — ou simplesmente cansado — fica
   * preso numa tela sem conseguir nem pedir ajuda. Com ele, o Continuar
   * libera sozinho e o tutorial segue; a trava continua fazendo o trabalho
   * dela nos 99% dos casos em que a pessoa consegue.
   */
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setEsperaEsgotada(false);
    if (relogio.current) clearTimeout(relogio.current);
    if (passo !== PASSO_COM_TRAVA) return;
    relogio.current = setTimeout(() => setEsperaEsgotada(true), ESPERA_MAXIMA_MS);
    return () => {
      if (relogio.current) clearTimeout(relogio.current);
      relogio.current = null;
    };
  }, [passo]);

  const travado = passo === PASSO_COM_TRAVA && !missaoFeita && !esperaEsgotada;

  const sair = (concluiu: boolean) => {
    // Na PRIMEIRA conclusão o destino é o "primeiro sucesso" (/welcome): a
    // pessoa acabou de aprender o dwell e vai usá-lo de verdade, uma vez, num
    // único cartão em destaque. Quem refaz o tutorial pelas configurações já
    // passou por isso e volta ao menu.
    const primeiraVez = currentProfile !== null && !tutorialConcluido(currentProfile.id);
    if (concluiu && currentProfile) {
      gravarTutorial(currentProfile.id, {
        dwellMsEscolhido: dwellMs,
        ensaiouEmergencia: ensaiou,
      });
    }
    // Sair encerra a jornada: nada de missão pendente nem passo guardado
    // sobrando para a próxima abertura do teclado mostrar uma faixa órfã.
    limparMissoes();
    navigate(concluiu && primeiraVez ? '/welcome' : '/menu', { replace: true });
  };

  const avancar = () => {
    if (travado) return;
    const p = proximoPassoDoTutorial(passo);
    if (p) setPasso(p);
    else sair(true);
  };

  const anterior = passoAnteriorDoTutorial(passo);
  const ultimo = proximoPassoDoTutorial(passo) === null;

  return (
    <main
      role="main"
      aria-labelledby="tutorial-title"
      style={{
        // A rolagem fica nesta caixa, não no documento: a Emergência é fixa,
        // e um documento que rola leva o conteúdo para baixo dela.
        height: '100dvh',
        overflowY: 'auto',
        background: 'var(--settings-bg)',
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}
    >
      {/* `coluna-livre-da-emergencia`: a 1024 px a coluna de 640 px chegava
          até embaixo da Emergência (o "Pular o tutorial" ficava sob ela). */}
      <div
        className="coluna-livre-da-emergencia"
        style={{
          width: '100%',
          maxWidth: 640,
          height: 'fit-content',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <h1
            id="tutorial-title"
            style={{
              margin: 0,
              fontSize: '1.15rem',
              fontWeight: 800,
              opacity: 0.75,
              color: 'var(--color-text-base)',
            }}
          >
            {t('tutorial.title')}
          </h1>
          {/* Pular está sempre disponível, em todos os passos — inclusive no
              passo travado. A trava é para quem CONSEGUE e ainda não tentou,
              nunca para prender quem não consegue.

              É a escapatória oficial da trava, então precisa ser alcançável
              pelo olhar: era um `<button>` de texto com ~130×20 px, menor que
              qualquer alvo de dwell — a saída existia só para o mouse. */}
          <GazeButton
            type="button"
            width={220}
            height={76}
            isolado
            onClick={() => sair(false)}
            style={{
              background: 'transparent',
              border: '2px solid var(--color-card-border)',
              color: 'var(--color-primary)',
              fontSize: '1rem',
              fontWeight: 700,
              borderRadius: '1rem',
              flexShrink: 0,
            }}
          >
            {t('tutorial.skip')}
          </GazeButton>
        </div>

        <Trilha atual={passo} />

        {/* Sem calibração o dwell não liga: a prática "não responde" e o
            paciente não tem como saber que o problema não é ele. Diz em
            palavras e dá o caminho. */}
        {!calibrado && (
          <div
            role="alert"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1.25rem',
              borderRadius: '1rem',
              background: 'var(--tint-warn-bg)',
              border: '1px solid var(--tint-warn-border)',
              color: 'var(--color-text-base)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, fontSize: '1rem', lineHeight: 1.5, fontWeight: 600 }}>
              <Crosshair size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
              {t('tutorial.semCalibracao.texto')}
            </span>
            <GazeButton
              type="button"
              width={260}
              height={76}
              isolado
              onClick={() => navigate('/calibration-check')}
              style={{ borderRadius: '1rem', fontWeight: 800, flexShrink: 0 }}
            >
              {t('tutorial.semCalibracao.ir')}
            </GazeButton>
          </div>
        )}

        <div
          className="glass-card"
          style={{
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-card-border)',
            borderRadius: '1.5rem',
            padding: '1.75rem',
          }}
        >
          {passo === 'oQueEDwell' && <OQueEDwell dwellMs={dwellMs} />}
          {passo === 'pratica' && (
            <PraticaGuiada dwellMs={dwellMs} aoSugerirAjuste={() => setPasso('ajuste')} />
          )}
          {passo === 'ajuste' && <AjusteDoTempo dwellMs={dwellMs} aoMudar={mudarDwell} />}
          {passo === 'comunicacao' && (
            <PassoDeMissao
              missao="comunicacao"
              passo="comunicacao"
              rota="/phrases"
              titulo={t('tutorial.comunicacao.title')}
              texto={t('tutorial.comunicacao.lead')}
              convite={t('tutorial.comunicacao.ir')}
              feito={t('tutorial.comunicacao.feito')}
              aoCumprir={setMissaoFeita}
            />
          )}
          {passo === 'digitacao' && (
            <PassoDeMissao
              missao="digitacao"
              passo="digitacao"
              rota="/keyboard"
              titulo={t('tutorial.digitacao.title')}
              texto={t('tutorial.digitacao.lead')}
              convite={t('tutorial.digitacao.ir')}
              feito={t('tutorial.digitacao.feito')}
              aoCumprir={setMissaoFeita}
            />
          )}
          {passo === 'conversa' && (
            <PassoDeMissao
              missao="conversa"
              passo="conversa"
              rota="/conversation"
              titulo={t('tutorial.conversa.title')}
              texto={t('tutorial.conversa.lead')}
              convite={t('tutorial.conversa.ir')}
              feito={t('tutorial.conversa.feito')}
              aoCumprir={setMissaoFeita}
            />
          )}
          {passo === 'lazer' && (
            <PassoDeMissao
              missao="lazer"
              passo="lazer"
              rota="/games"
              titulo={t('tutorial.lazer.title')}
              texto={t('tutorial.lazer.lead')}
              convite={t('tutorial.lazer.ir')}
              feito={t('tutorial.lazer.feito')}
              aoCumprir={setMissaoFeita}
            />
          )}
          {passo === 'recursos' && <MaisRecursos />}
          {passo === 'emergencia' && (
            <BotaoDeEmergencia aoEnsaiar={registrarEnsaio} aoPular={avancar} />
          )}
          {passo === 'concluido' && <Concluido />}
        </div>

        {/* A razão da trava, dita em palavras, no momento em que ela atua. Um
            botão desabilitado sem explicação é indistinguível de um app
            quebrado — e quem está aqui não tem como investigar. */}
        {travado && (
          <p
            role="status"
            aria-live="polite"
            style={{
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              opacity: 0.85,
              color: 'var(--color-text-base)',
            }}
          >
            <Lock size={18} aria-hidden="true" /> {t('tutorial.digitacao.travado')}
          </p>
        )}

        {/*
          Voltar e Continuar são `GazeButton`, não `PrimaryButton`.

          O tutorial roda DEPOIS da calibração, com o dwell ativo: estes dois
          são acionados pelo olhar. O `PrimaryButton` mede ~163×46 px — mais
          fino que a pílula de 180×64 que o `BackButton` já teve de aposentar,
          e pelo mesmo motivo registrado lá: "uma faixa fina é exatamente o
          formato em que o dwell zera por um tremor vertical". Altura de 76 px
          é a mesma dos outros alvos de olhar do app (modal de lembrete, FAB
          de emergência).
        */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <GazeButton
            type="button"
            height={76}
            disabled={anterior === null}
            onClick={() => anterior && setPasso(anterior)}
            style={{
              flex: 1,
              background: 'transparent',
              border: '2px solid var(--color-card-border)',
              color: 'var(--color-text-base)',
              opacity: anterior === null ? 0.4 : 1,
            }}
          >
            <ArrowLeft size={20} aria-hidden="true" /> {t('tutorial.back')}
          </GazeButton>

          <GazeButton
            type="button"
            height={76}
            onClick={avancar}
            disabled={travado}
            style={{ flex: 1, opacity: travado ? 0.4 : 1 }}
          >
            {ultimo ? (
              <>
                {t('tutorial.concluido.ir')} <Check size={20} aria-hidden="true" />
              </>
            ) : (
              <>
                {t('tutorial.next')} <ArrowRight size={20} aria-hidden="true" />
              </>
            )}
          </GazeButton>
        </div>
      </div>
    </main>
  );
};

/**
 * Trilha de passos — INDICADOR, não navegação.
 *
 * Já foi um `div` inerte que parecia abas; depois virou dez `<button>` de
 * ~60×56 px. Nenhuma das duas serve a quem usa o olhar: um alvo de 60 px de
 * largura fica abaixo do mínimo de 5° desta interface (~198 px), e dez deles
 * lado a lado num cartão de 640 px não têm como crescer — nem em duas linhas
 * de cinco caberiam. Um alvo que o dwell não consegue segurar não é alvo, é
 * enfeite que ainda por cima rouba o olhar de passagem.
 *
 * Então a trilha mostra "Passo N de M — <nome>" e as marcas de progresso, sem
 * `role="button"`, sem `onClick` e fora do `DWELL_SELECTOR` do GazeContext.
 * A navegação fica onde os alvos têm tamanho: Voltar e Continuar (76 px) e
 * Pular. Voltar nunca tem condição, então a jornada continua livre.
 */
const Trilha: React.FC<{ atual: PassoDoTutorial }> = ({ atual }) => {
  const { t } = useTranslation();
  const i = indiceDoPassoDoTutorial(atual);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }} data-no-dwell="true">
      <span
        style={{
          fontSize: '0.85rem',
          fontWeight: 700,
          opacity: 0.8,
          color: 'var(--color-text-base)',
        }}
      >
        {t('tutorial.passoDe', { n: i + 1, total: PASSOS_DO_TUTORIAL.length })} ·{' '}
        {t(`tutorial.steps.${atual}`)}
      </span>
      <ol
        aria-label={t('tutorial.title')}
        style={{ display: 'flex', gap: '0.3rem', listStyle: 'none', margin: 0, padding: 0 }}
      >
        {PASSOS_DO_TUTORIAL.map((p, n) => {
          const ehAtual = n === i;
          return (
            <li
              key={p}
              aria-current={ehAtual ? 'step' : undefined}
              aria-label={t(`tutorial.steps.${p}`)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 12 }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'block',
                  width: '100%',
                  height: ehAtual ? 8 : 4,
                  borderRadius: 999,
                  background: n <= i ? 'var(--color-primary)' : 'var(--color-card-border)',
                }}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
};
