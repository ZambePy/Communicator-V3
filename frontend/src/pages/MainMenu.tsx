import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Keyboard,
  Monitor,
  Settings,
  Gamepad2,
  MessageCircle,
  Moon,
  Mic,
  Accessibility,
  GraduationCap,
  ArrowRight,
} from 'lucide-react';
import { useCloud } from '../cloud/CloudContext';
import { GazePageLayout } from '../components/ui/GazePageLayout';
import { GazeGrid } from '../components/ui/GazeGrid';
import { GazeButton } from '../components/ui/GazeButton';
import { EstadoDaSessao } from '../components/ui/EstadoDaSessao';
import { aoMudarMissao, passoGuardado } from './tutorial/missao';
import {
  PASSOS_DO_TUTORIAL,
  ehPassoDoTutorial,
  indiceDoPassoDoTutorial,
  type PassoDoTutorial,
} from './tutorial/passos';

/**
 * Menu principal: nove cartões em grade 3×3, cada um com um selo circular
 * colorido e o ícone escuro por cima. Sem título — o paciente já sabe onde
 * está, e o espaço vale mais como alvo do que como texto.
 *
 * O selo é a única cor do cartão: o fundo é o da tela, e o cartão só ganha
 * o contorno azul quando o olhar entra (comportamento padrão do GazeButton).
 */

interface AppModule {
  /** Também é a chave em `menu.modulos.*` do i18n. */
  id: string;
  icon: React.ReactNode;
  /** Cor do selo circular atrás do ícone. */
  badge: string;
  route: string;
}

const ICONE = 46;

// Título e descrição vêm do i18n (`menu.modulos.<id>`): o menu ficava em
// português fixo enquanto o resto do app trocava de idioma.
const MODULES: AppModule[] = [
  { id: 'communication', icon: <MessageSquare size={ICONE} />, badge: '#FF8A8A', route: '/phrases' },
  { id: 'keyboard', icon: <Keyboard size={ICONE} />, badge: '#6EE7A0', route: '/keyboard' },
  { id: 'computer', icon: <Monitor size={ICONE} />, badge: '#C4A5F5', route: '/virtual-mouse' },
  { id: 'settings', icon: <Settings size={ICONE} />, badge: '#FBBF5B', route: '/settings' },
  { id: 'leisure', icon: <Gamepad2 size={ICONE} />, badge: '#7DB4F5', route: '/games' },
  { id: 'conversation', icon: <MessageCircle size={ICONE} />, badge: '#67E0E0', route: '/conversation' },
  { id: 'rest', icon: <Moon size={ICONE} />, badge: '#C89BF7', route: '/rest' },
  { id: 'voice', icon: <Mic size={ICONE} />, badge: '#5EEAD4', route: '/voice' },
  { id: 'accessibility', icon: <Accessibility size={ICONE} />, badge: '#6CB6F5', route: '/accessibility' },
];

/**
 * Passo do tutorial em curso nesta sessão, ou `null`.
 *
 * O passo só existe no `sessionStorage` entre a entrada no tutorial e a saída
 * dele (conclusão ou "Pular", que chamam `limparMissoes`). Então "há passo
 * guardado" É "há um tutorial pela metade" — inclusive quando é um tutorial
 * já concluído sendo refeito, que precisa da mesma volta.
 */
function passoDoTutorialEmCurso(): PassoDoTutorial | null {
  const p = passoGuardado();
  return ehPassoDoTutorial(p) ? p : null;
}

export const MainMenu: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { naoFaladas } = useCloud();

  // Volta ao tutorial pelo olhar. As missões mandam a pessoa para as telas
  // reais, e as saídas próprias dessas telas levam ao menu — sem este cartão,
  // quem chegava aqui no meio do tutorial ficava fora dele sem caminho de
  // volta que não fosse o cuidador.
  const [passoPendente, setPassoPendente] = useState(passoDoTutorialEmCurso);
  useEffect(() => {
    setPassoPendente(passoDoTutorialEmCurso());
    return aoMudarMissao(() => setPassoPendente(passoDoTutorialEmCurso()));
  }, []);

  return (
    <GazePageLayout showBack={false}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Estado da sessao: quando foi a ultima calibracao, e se a licenca
            esta em tolerancia offline. So o que muda uma decisao do cuidador —
            esta e a tela do paciente, e enche-la de informacao atrapalha
            justamente quem ela existe para servir. */}
        <EstadoDaSessao />

        {passoPendente !== null && (
          <GazeButton
            onClick={() => navigate('/tutorial')}
            height={84}
            isolado
            aria-label={t('menu.continuarTutorial.title')}
            style={{
              width: '100%',
              maxWidth: 'min(1600px, 92%)',
              margin: '0 auto 1rem auto',
              borderRadius: '1.25rem',
              background: 'var(--tint-info-bg)',
              border: '2px solid var(--tint-info-border)',
              color: 'var(--tint-info-text)',
              padding: '0 1.5rem',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
              <GraduationCap size={30} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, textAlign: 'left' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>{t('menu.continuarTutorial.title')}</span>
                <span style={{ fontSize: '0.95rem', opacity: 0.85, fontWeight: 600 }}>
                  {t('menu.continuarTutorial.lead', {
                    n: indiceDoPassoDoTutorial(passoPendente) + 1,
                    total: PASSOS_DO_TUTORIAL.length,
                    passo: t(`tutorial.steps.${passoPendente}`),
                  })}
                </span>
              </span>
              <ArrowRight size={26} aria-hidden="true" style={{ flexShrink: 0 }} />
            </span>
          </GazeButton>
        )}

        {/*
          A largura máxima era um número fixo, e desperdiçava 544 px em 1920 —
          era a causa do "fica tudo pequeno no meio da tela grande". Com `min()` o
          conteúdo cresce até 92 % da largura disponível e o teto sobe para
          1600, que ainda mantém a linha de leitura confortável.
        */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            maxWidth: 'min(1600px, 92%)',
            width: '100%',
            margin: '0 auto',
          }}
        >
          <GazeGrid columns={3} rows={3} gap={28}>
            {MODULES.map((module) => (
              <GazeButton
                key={module.id}
                onClick={() => navigate(module.route)}
                aria-label={t('menu.abrirAria', {
                  title: t(`menu.modulos.${module.id}.title`),
                  description: t(`menu.modulos.${module.id}.description`),
                })}
                style={{
                  height: '100%',
                  borderRadius: '1.6rem',
                  background: 'var(--color-card-bg)',
                  border: '2px solid var(--color-card-border)',
                  boxShadow: '0 8px 24px var(--color-card-shadow)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: 'clamp(0.5rem, 1.2vh, 1rem)',
                    width: '100%',
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'relative',
                      // Era 88×88 fixo. O selo é decoração: em tela pequena ele
                      // consumia altura que o alvo precisa. Encolher o selo NÃO
                      // encolhe o alvo — o alvo é a caixa do botão inteiro.
                      width: 'clamp(52px, 7vh, 88px)',
                      height: 'clamp(52px, 7vh, 88px)',
                      borderRadius: '50%',
                      background: module.badge,
                      color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 'clamp(0.4rem, 1vh, 1rem)',
                      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
                    }}
                  >
                    {module.icon}
                    {module.id === 'conversation' && naoFaladas > 0 && (
                      <span
                        aria-hidden="false"
                        aria-label={t('menu.novasMensagens', { n: naoFaladas })}
                        style={{
                          position: 'absolute', top: -6, right: -10, minWidth: 30, height: 30, padding: '0 8px',
                          borderRadius: 15, background: '#dc2626', color: '#fff', fontSize: '1rem', fontWeight: 900,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '3px solid var(--color-card-bg)',
                        }}
                      >
                        {naoFaladas}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(1.15rem, 2.2vh, 1.7rem)',
                      fontWeight: 800,
                      color: 'var(--color-text-base)',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.15,
                    }}
                  >
                    {t(`menu.modulos.${module.id}.title`)}
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(0.85rem, 1.4vh, 1.05rem)',
                      opacity: 0.7,
                      marginTop: '0.45rem',
                      fontWeight: 500,
                      color: 'var(--color-text-base)',
                    }}
                  >
                    {t(`menu.modulos.${module.id}.description`)}
                  </div>
                </div>
              </GazeButton>
            ))}
          </GazeGrid>
        </div>
      </div>
    </GazePageLayout>
  );
};
