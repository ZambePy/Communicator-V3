import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { limitarDwellMs } from '../../dwellMs';
import { gravarTutorial, tutorialConcluido } from '../../services/local/tutorialProfile';
import {
  PASSOS_DO_TUTORIAL,
  indiceDoPassoDoTutorial,
  proximoPassoDoTutorial,
  passoAnteriorDoTutorial,
  type PassoDoTutorial,
} from './passos';
import { OQueEDwell } from './steps/OQueEDwell';
import { PraticaGuiada } from './steps/PraticaGuiada';
import { AjusteDoTempo } from './steps/AjusteDoTempo';
import { BotaoDeEmergencia } from './steps/BotaoDeEmergencia';
import { Concluido } from './steps/Concluido';

/**
 * Tutorial de uso.
 *
 * Vem **depois** da calibração: "sentir o tempo de permanência" só é real com o
 * olhar funcionando. Antes da calibração o dwell fica desligado, e a prática
 * seria feita com o mouse — que não ensina nada sobre olhar.
 *
 * **Não bloqueia nada.** Quem não quiser fazer, pula. Travar o acesso à
 * comunicação por um tutorial contradiz a premissa do projeto.
 *
 * Uma rota só, passo no estado: o dwell precisa seguir ativo e configurado
 * entre os passos, e o slider do passo 3 tem de afetar a prática sem remontar.
 */
export const TutorialWizard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentProfile } = useAuth();
  const { settings, updateSettings } = useSettings();

  const [passo, setPasso] = useState<PassoDoTutorial>('oQueEDwell');
  const [ensaiou, setEnsaiou] = useState(false);

  const dwellMs = limitarDwellMs(settings.dwellMs);

  const mudarDwell = useCallback(
    (ms: number) => updateSettings({ dwellMs: limitarDwellMs(ms) }),
    [updateSettings]
  );

  const registrarEnsaio = useCallback((fez: boolean) => {
    if (fez) setEnsaiou(true);
  }, []);

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
    navigate(concluiu && primeiraVez ? '/welcome' : '/menu', { replace: true });
  };

  const avancar = () => {
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
          {/* Pular está sempre disponível, em todos os passos. */}
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
          {passo === 'emergencia' && <BotaoDeEmergencia aoEnsaiar={registrarEnsaio} />}
          {passo === 'concluido' && <Concluido />}
        </div>

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

          <GazeButton type="button" height={76} onClick={avancar} style={{ flex: 1 }}>
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
 * arquivo diz que o tutorial não bloqueia nada e que quem não quiser fazer
 * pula. Uma trilha que só anda para trás contradiria isso — e "Pular" já
 * permite sair inteiro a qualquer momento.
 */
const Trilha: React.FC<{
  atual: PassoDoTutorial;
  aoEscolher: (p: PassoDoTutorial) => void;
}> = ({ atual, aoEscolher }) => {
  const { t } = useTranslation();
  const i = indiceDoPassoDoTutorial(atual);
  return (
    <div role="tablist" aria-label={t('tutorial.title')} style={{ display: 'flex', gap: '0.4rem' }}>
      {PASSOS_DO_TUTORIAL.map((p, n) => {
        const ehAtual = n === i;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={ehAtual}
            aria-current={ehAtual ? 'step' : undefined}
            onClick={() => aoEscolher(p)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              // Alto o bastante para o dwell não zerar com o jitter vertical:
              // uma faixa fina é exatamente o formato em que o olhar escapa.
              minHeight: 56,
              padding: '0.35rem 0.25rem',
              background: 'transparent',
              border: 'none',
              borderRadius: '0.6rem',
              cursor: 'pointer',
              textAlign: 'center',
              font: 'inherit',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                height: 4,
                borderRadius: 999,
                background: n <= i ? 'var(--color-primary)' : 'var(--color-card-border)',
              }}
            />
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: ehAtual ? 800 : 600,
                opacity: ehAtual ? 1 : 0.55,
                color: 'var(--color-text-base)',
              }}
            >
              {t(`tutorial.steps.${p}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
};
