import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Target,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Palette,
  Heart,
  BookOpen,
  Wind,
  Moon,
} from 'lucide-react';
import { GazeButton } from '../components/ui/GazeButton';
import { DicaContextual } from '../components/ui/DicaContextual';
import { FaixaDeMissao } from '../components/FaixaDeMissao';
import { cumprirMissao } from './tutorial/missao';

interface ActivityCard {
  route: string;
  /** Chave em `lazer.itens.*` do i18n (title, subtitle e, se houver, badge). */
  chave: string;
  icon: React.ReactNode;
  gradient: string;
  shadow: string;
  badge?: boolean;
}

interface Secao {
  /** Também é a chave em `lazer.secoes.*`. */
  id: 'fotos' | 'jogos' | 'bemEstar';
  itens: ActivityCard[];
}

/**
 * O menu é agrupado por SEÇÃO em vez de uma grade única de oito cartões.
 *
 * Oito alvos indistintos numa grade só obrigam o paciente a varrer a lista
 * inteira com sacádicos a cada visita — caro para quem tem controle ocular
 * reduzido. Com três blocos rotulados, ele salta para o bloco certo e escolhe
 * dentro de três ou quatro opções.
 */
const SECOES: Secao[] = [
  {
    id: 'fotos',
    itens: [
      {
        route: '/photo',
        chave: 'foto',
        icon: <Camera size={64} color="white" aria-hidden="true" />,
        gradient: 'linear-gradient(135deg, rgba(14, 165, 233, 0.9), rgba(37, 99, 235, 0.9))',
        shadow: 'rgba(14, 165, 233, 0.45)',
        badge: true,
      },
      {
        route: '/gallery',
        chave: 'galeria',
        icon: <ImageIcon size={64} color="white" aria-hidden="true" />,
        gradient: 'linear-gradient(135deg, rgba(147, 51, 234, 0.9), rgba(109, 40, 217, 0.9))',
        shadow: 'rgba(147, 51, 234, 0.45)',
      },
    ],
  },
  {
    id: 'jogos',
    itens: [
      {
        route: '/games/bubble',
        chave: 'bolhas',
        icon: <Sparkles size={64} color="white" aria-hidden="true" />,
        gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(79, 70, 229, 0.9))',
        shadow: 'rgba(99, 102, 241, 0.45)',
      },
      {
        route: '/games/memory',
        chave: 'memoria',
        icon: (
          <span style={{ fontSize: '3.5rem' }} aria-hidden="true">
            🧠
          </span>
        ),
        gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(21, 128, 61, 0.9))',
        shadow: 'rgba(34, 197, 94, 0.45)',
      },
      {
        route: '/games/follow',
        chave: 'alvo',
        icon: <Target size={64} color="white" aria-hidden="true" />,
        gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(185, 28, 28, 0.9))',
        shadow: 'rgba(239, 68, 68, 0.45)',
      },
      {
        route: '/drawing',
        chave: 'desenho',
        icon: <Palette size={64} color="white" aria-hidden="true" />,
        gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.9), rgba(217, 119, 6, 0.9))',
        shadow: 'rgba(245, 158, 11, 0.45)',
      },
    ],
  },
  {
    // Estas telas existiam e eram navegáveis, mas NENHUMA tela levava a elas:
    // só se chegava digitando a rota. Na prática eram inalcançáveis para quem
    // usa o app pelo olhar. O Descanso também está no menu principal; aqui ele
    // fica junto do resto do bem-estar, que é onde o tutorial diz que está.
    id: 'bemEstar',
    itens: [
      {
        route: '/news',
        chave: 'leituras',
        icon: <BookOpen size={64} color="white" aria-hidden="true" />,
        gradient: 'linear-gradient(135deg, rgba(71, 85, 105, 0.95), rgba(30, 41, 59, 0.95))',
        shadow: 'rgba(71, 85, 105, 0.45)',
      },
      {
        route: '/meditation',
        chave: 'meditacao',
        icon: <Wind size={64} color="white" aria-hidden="true" />,
        gradient: 'linear-gradient(135deg, rgba(217, 70, 239, 0.9), rgba(162, 28, 175, 0.9))',
        shadow: 'rgba(217, 70, 239, 0.45)',
      },
      {
        route: '/rest',
        chave: 'descanso',
        icon: <Moon size={64} color="white" aria-hidden="true" />,
        gradient: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(2, 6, 23, 0.95))',
        shadow: 'rgba(30, 41, 59, 0.45)',
      },
    ],
  },
];

export const GamesMenu: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main
      role="main"
      aria-labelledby="games-title"
      style={{
        // Altura FIXA da janela, com a rolagem num contêiner interno (abaixo).
        // Era `minHeight: 100vh`: a 1080 p a página tinha 1352 px e quem rolava
        // era o documento — o cabeçalho, a faixa do tutorial e os cartões
        // subiam e passavam por baixo do botão de Emergência, que é fixo.
        height: '100dvh',
        width: '100%',
        background: 'var(--color-bg-base)',
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem 3rem',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Luz ambiente decorativa */}
      <div
        aria-hidden="true"
        className="bg-orb animate-float"
        style={{
          width: 500,
          height: 500,
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.2), transparent)',
          top: '-10%',
          right: '-5%',
        }}
      />
      <div
        aria-hidden="true"
        className="bg-orb animate-float"
        style={{
          width: 450,
          height: 450,
          background: 'radial-gradient(circle, rgba(27, 84, 168, 0.15), transparent)',
          bottom: '-10%',
          left: '-5%',
          animationDelay: '-3s',
        }}
      />

      {/* Barra Superior / Header com Botão Voltar Ampliado */}
      <header
        className="animate-fade-in reserva-emergencia"
        style={{
          '--reserva-margem': '3rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          zIndex: 10,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <GazeButton
            onClick={() => navigate('/menu')}
            width={220}
            height={72}
            style={{
              borderRadius: '1.75rem',
              border: '2px solid var(--color-card-border)',
              background: 'var(--color-card-bg)',
              boxShadow: '0 8px 24px var(--color-card-shadow)',
            }}
            aria-label={t('lazer.voltarMenuAria')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '1.4rem', fontWeight: 800 }}>
              <ArrowLeft size={30} />
              <span>{t('lazer.voltar')}</span>
            </div>
          </GazeButton>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '1.25rem',
                background: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 8px 20px rgba(225, 29, 72, 0.35)',
              }}
            >
              <Heart size={32} />
            </div>
            <div>
              <h1
                id="games-title"
                style={{
                  fontSize: '2.25rem',
                  fontWeight: 900,
                  color: 'var(--color-text-base)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                {t('lazer.title')}
              </h1>
              <p
                style={{
                  fontSize: '1.15rem',
                  color: 'var(--color-text-base)',
                  opacity: 0.75,
                  margin: '0.2rem 0 0 0',
                  fontWeight: 500,
                }}
              >
                {t('lazer.subtitle')}
              </p>
            </div>
          </div>
        </div>
      </header>

      <FaixaDeMissao missao="lazer" instrucao={t('tutorial.lazer.missao')} />
      <DicaContextual id="jogos" />

      <div
        data-testid="lazer-rolagem"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          width: '100%',
          maxWidth: '1600px',
          margin: '0 auto',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '2.25rem',
          // Folga para a sombra dos cartões e para o anel de dwell não serem
          // cortados pela borda do contêiner rolável.
          padding: '0.75rem 0.75rem 2rem',
        }}
      >
        {SECOES.map((secao) => {
          const tituloDaSecao = t(`lazer.secoes.${secao.id}`);
          return (
          <section key={secao.id} aria-labelledby={`secao-${secao.id}`} className="animate-fade-in-up">
            <h2
              id={`secao-${secao.id}`}
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: 'var(--color-text-base)',
                opacity: 0.75,
                margin: '0 0 1rem 0.35rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {tituloDaSecao}
            </h2>

            <ul
              aria-label={tituloDaSecao}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: '1.75rem',
                width: '100%',
                listStyle: 'none',
                padding: 0,
                margin: 0,
              }}
            >
              {secao.itens.map((activity) => {
                const title = t(`lazer.itens.${activity.chave}.title`);
                const subtitle = t(`lazer.itens.${activity.chave}.subtitle`);
                return (
                <li key={activity.route} style={{ display: 'flex' }}>
                  {/* GazeButton em vez de <button> cru: o dwell global clicaria
                      os dois, mas só o GazeButton mostra o anel de progresso —
                      sem ele o paciente não sabe se o alvo está carregando. */}
                  <GazeButton
                    onClick={() => {
                      // Missão do tutorial: abrir um jogo JÁ é a ação pedida.
                      // Exigir "jogar até o fim" transformaria um convite em
                      // prova, e o passo nem é obrigatório. Silenciosa fora do
                      // tutorial.
                      cumprirMissao('lazer');
                      navigate(activity.route);
                    }}
                    aria-label={t('lazer.abrirAria', { title, subtitle })}
                    className="action-card"
                    style={{
                      background: activity.gradient,
                      backdropFilter: 'blur(20px)',
                      border: '3px solid rgba(255, 255, 255, 0.35)',
                      borderRadius: '2.5rem',
                      width: '100%',
                      minHeight: '250px',
                      padding: '2rem',
                      boxShadow: `0 16px 36px -8px ${activity.shadow}`,
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1.15rem',
                        width: '100%',
                      }}
                    >
                      {activity.badge && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '1.25rem',
                            right: '1.25rem',
                            background: 'rgba(255, 255, 255, 0.3)',
                            backdropFilter: 'blur(10px)',
                            color: '#ffffff',
                            padding: '0.35rem 0.9rem',
                            borderRadius: '999px',
                            fontSize: '0.95rem',
                            fontWeight: 800,
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                          }}
                        >
                          {t(`lazer.itens.${activity.chave}.badge`)}
                        </span>
                      )}

                      <span
                        className="card-icon"
                        aria-hidden="true"
                        style={{
                          width: '6.5rem',
                          height: '6.5rem',
                          borderRadius: '1.75rem',
                          background: 'rgba(255, 255, 255, 0.22)',
                          boxShadow: `0 10px 28px ${activity.shadow}`,
                          border: '3px solid rgba(255, 255, 255, 0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {activity.icon}
                      </span>

                      <span
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '1.7rem',
                            fontWeight: 900,
                            color: '#ffffff',
                            letterSpacing: '-0.01em',
                            textShadow: '0 2px 10px rgba(0,0,0,0.2)',
                          }}
                        >
                          {title}
                        </span>
                        <span
                          style={{
                            fontSize: '1.1rem',
                            color: 'rgba(255, 255, 255, 0.92)',
                            fontWeight: 600,
                            maxWidth: '300px',
                          }}
                        >
                          {subtitle}
                        </span>
                      </span>
                    </span>
                  </GazeButton>
                </li>
                );
              })}
            </ul>
          </section>
          );
        })}
      </div>
    </main>
  );
};
