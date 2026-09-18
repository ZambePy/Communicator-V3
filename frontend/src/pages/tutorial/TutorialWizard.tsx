import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { useAuth } from '../../context/AuthContext';
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
 * **Quase não bloqueia nada.** "Pular o tutorial" está em todos os passos, e a
 * trilha navega livre. A única exceção é o passo de escrever uma frase, e ela
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

  // Retoma de onde parou: ou de uma missão na tela real, ou de um F5.
  const [passo, setPassoState] = useState<PassoDoTutorial>(() => {
    const salvo = passoGuardado();
    return ehPassoDoTutorial(salvo) ? salvo : 'oQueEDwell';
  });
  const [ensaiou, setEnsaiou] = useState(false);
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

  const registrarEnsaio = useCallback((fez: boolean) => {
    if (fez) setEnsaiou(true);
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
        minHeight: '100vh',
        background: 'var(--settings-bg)',
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
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
              nunca para prender quem não consegue. */}
          <button
            type="button"
            onClick={() => sair(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-primary)',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('tutorial.skip')}
          </button>
        </div>

        <Trilha atual={passo} aoEscolher={setPasso} />

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
          {passo === 'emergencia' && <BotaoDeEmergencia aoEnsaiar={registrarEnsaio} />}
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
 * Trilha de passos — e ela NAVEGA.
 *
 * Era um `div` com um `span` por passo: parecia um conjunto de abas e não
 * respondia a nada. Não tinha `onClick`, não tinha `role`, não tinha
 * `tabIndex`, e não casava com o `DWELL_SELECTOR` do `GazeContext`
 * (`button, a, [role="button"], [role="link"]`) — logo era inerte para o
 * mouse, para o teclado E para o olhar, que é o único meio de entrada do
 * paciente. Quem lia aquilo como aba e tentava ir para outro passo concluía,
 * com razão, que o tutorial tinha travado.
 *
 * Por que navegação LIVRE e não "só até onde já cheguei": o cabeçalho deste
 * arquivo diz que o tutorial quase não bloqueia nada e que quem não quiser
 * fazer pula. Uma trilha que só anda para trás contradiria isso — e "Pular"
 * já permite sair inteiro a qualquer momento.
 *
 * ## Por que os rótulos sumiram
 *
 * Com cinco passos cabiam cinco rótulos. Com dez, cada um ficaria com ~58 px
 * de largura: o texto quebra, ou trunca, e — pior para quem usa o olhar — cada
 * aba fica MAIS ESTREITA QUE O ALVO MÍNIMO desta interface. Um alvo de 58 px
 * de largura não é alvo, é enfeite que o dwell não consegue segurar.
 *
 * Então a trilha passa a ser: "Passo N de M — <nome do passo atual>" em texto,
 * e as marcas viram alvos SEM rótulo, altos o bastante (56 px) e com
 * `aria-label` próprio. Quem lê com leitor de tela continua ouvindo o nome de
 * cada passo; quem navega pelo olhar ganha um alvo utilizável em vez de dez
 * inutilizáveis.
 */
const Trilha: React.FC<{
  atual: PassoDoTutorial;
  aoEscolher: (p: PassoDoTutorial) => void;
}> = ({ atual, aoEscolher }) => {
  const { t } = useTranslation();
  const i = indiceDoPassoDoTutorial(atual);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
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
      <div
        role="tablist"
        aria-label={t('tutorial.title')}
        style={{ display: 'flex', gap: '0.3rem' }}
      >
        {PASSOS_DO_TUTORIAL.map((p, n) => {
          const ehAtual = n === i;
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={ehAtual}
              aria-current={ehAtual ? 'step' : undefined}
              aria-label={t(`tutorial.steps.${p}`)}
              onClick={() => aoEscolher(p)}
              style={{
                flex: 1,
                // Alto o bastante para o dwell não zerar com o jitter vertical:
                // uma faixa fina é exatamente o formato em que o olhar escapa.
                minHeight: 56,
                display: 'flex',
                alignItems: 'center',
                padding: '0 0.1rem',
                background: 'transparent',
                border: 'none',
                borderRadius: '0.6rem',
                cursor: 'pointer',
              }}
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
            </button>
          );
        })}
      </div>
    </div>
  );
};
