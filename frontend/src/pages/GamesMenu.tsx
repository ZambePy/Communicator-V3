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
  Brain,
} from 'lucide-react';
import { GazeButton } from '../components/ui/GazeButton';
import { lazerLiberadoPelaLicenca } from '../services/lazer';
import { DicaContextual } from '../components/ui/DicaContextual';
import { FaixaDeMissao } from '../components/FaixaDeMissao';
import { cumprirMissao } from './tutorial/missao';

interface ActivityCard {
  route: string;
  /** Chave em `lazer.itens.*` do i18n (title, subtitle e, se houver, badge). */
  chave: string;
  icon: React.ReactNode;
  /** Cor do selo do ícone — a mesma paleta dos selos do menu principal. */
  cor: string;
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
        icon: <Camera size={56} aria-hidden="true" />,
        cor: '#7DB4F5',
        badge: true,
      },
      {
        route: '/gallery',
        chave: 'galeria',
        icon: <ImageIcon size={56} aria-hidden="true" />,
        cor: '#C4A5F5',
      },
    ],
  },
  {
    id: 'jogos',
    itens: [
      {
        route: '/games/bubble',
        chave: 'bolhas',
        icon: <Sparkles size={56} aria-hidden="true" />,
        cor: '#6CB6F5',
      },
      {
        route: '/games/memory',
        chave: 'memoria',
        icon: <Brain size={56} aria-hidden="true" />,
        cor: '#6EE7A0',
      },
      {
        route: '/games/follow',
        chave: 'alvo',
        icon: <Target size={56} aria-hidden="true" />,
        cor: '#FF8A8A',
      },
      {
        route: '/drawing',
        chave: 'desenho',
        icon: <Palette size={56} aria-hidden="true" />,
        cor: '#FBBF5B',
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
        icon: <BookOpen size={56} aria-hidden="true" />,
        cor: '#67E0E0',
      },
      {
        route: '/meditation',
        chave: 'meditacao',
        icon: <Wind size={56} aria-hidden="true" />,
        cor: '#C89BF7',
      },
      {
        route: '/rest',
        chave: 'descanso',
        icon: <Moon size={56} aria-hidden="true" />,
        cor: '#5EEAD4',
      },
    ],
  },
];

export const GamesMenu: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Na tabela de preços o módulo é dos planos Completo e Voz (e da beta).
  const liberado = lazerLiberadoPelaLicenca();

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
        background: 'var(--page-bg)',
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem 3rem',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
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
            height={96}
            isolado
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
                borderRadius: '30%',
                background: 'linear-gradient(155deg, color-mix(in srgb, #7DB4F5 72%, #ffffff), #7DB4F5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0f172a',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 8px 20px rgba(0, 0, 0, 0.28)',
              }}
            >
              <Heart size={30} />
            </div>
            <div>
              <h1
                id="games-title"
                style={{
                  fontSize: '2.25rem',
                  fontWeight: 700,
                  color: 'var(--color-text-base)',
                  margin: 0,
                  letterSpacing: '-0.03em',
                }}
              >
                {t('lazer.title')}
              </h1>
              <p
                style={{
                  fontSize: '1.15rem',
                  color: 'var(--color-text-muted)',
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

      <FaixaDeMissao missao="lazer" instrucao={liberado ? t('tutorial.lazer.missao') : t('lazer.bloqueado.missao')} />
      {liberado && <DicaContextual id="jogos" />}

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
        {!liberado && (
          // Sem o recurso no plano: a tela explica por quê e oferece a volta,
          // em vez de mostrar cartões que não abririam nada. O Descanso tem
          // cartão próprio no menu principal e continua lá.
          <section
            role="status"
            aria-labelledby="lazer-bloqueado-titulo"
            className="animate-fade-in-up"
            style={{
              margin: 'auto',
              maxWidth: '760px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '1.25rem',
              padding: '2.5rem 2.75rem',
              background: 'var(--color-card-bg)',
              border: '2px solid var(--color-card-border)',
              borderRadius: '1.9rem',
              boxShadow: '0 10px 28px var(--color-card-shadow)',
            }}
          >
            <h2
              id="lazer-bloqueado-titulo"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.9rem',
                fontWeight: 700,
                color: 'var(--color-text-base)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              {t('lazer.bloqueado.titulo')}
            </h2>
            <p style={{ fontSize: '1.2rem', lineHeight: 1.55, color: 'var(--color-text-muted)', margin: 0, fontWeight: 500 }}>
              {t('lazer.bloqueado.texto')}
            </p>
            <GazeButton
              onClick={() => navigate('/menu')}
              width={360}
              height={120}
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
                <span>{t('lazer.bloqueado.voltar')}</span>
              </div>
            </GazeButton>
          </section>
        )}
        {liberado && SECOES.map((secao) => {
          const tituloDaSecao = t(`lazer.secoes.${secao.id}`);
          return (
          <section key={secao.id} aria-labelledby={`secao-${secao.id}`} className="animate-fade-in-up">
            <h2
              id={`secao-${secao.id}`}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--color-text-muted)',
                margin: '0 0 1rem 0.35rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
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
                      // A mesma superfície dos cartões do menu, com um brilho
                      // da cor da atividade no topo: dá para reconhecer cada
                      // uma pela cor sem pintar a tela inteira de degradê.
                      background: `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${activity.cor} 16%, transparent), transparent 70%), var(--color-card-bg)`,
                      border: '2px solid var(--color-card-border)',
                      borderRadius: '1.9rem',
                      width: '100%',
                      minHeight: '240px',
                      padding: '2rem',
                      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 28px var(--color-card-shadow)',
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
                        gap: '1.1rem',
                        width: '100%',
                      }}
                    >
                      <span
                        className="card-icon"
                        aria-hidden="true"
                        style={{
                          width: '6rem',
                          height: '6rem',
                          borderRadius: '30%',
                          background: `linear-gradient(155deg, color-mix(in srgb, ${activity.cor} 72%, #ffffff), ${activity.cor})`,
                          color: '#0f172a',
                          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 10px 24px rgba(0, 0, 0, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          position: 'relative',
                        }}
                      >
                        {activity.icon}
                        {activity.badge && (
                          // Preso ao canto do selo, como o aviso de um ícone de app.
                          <span
                            style={{
                              position: 'absolute',
                              top: '-0.55rem',
                              left: 'calc(100% - 1.1rem)',
                              background: '#ffffff',
                              color: '#0f172a',
                              padding: '0.25rem 0.7rem',
                              borderRadius: '999px',
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                            }}
                          >
                            {t(`lazer.itens.${activity.chave}.badge`)}
                          </span>
                        )}
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
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.6rem',
                            fontWeight: 700,
                            color: 'var(--color-text-base)',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {title}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '1.08rem',
                            color: 'var(--color-text-muted)',
                            fontWeight: 500,
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
