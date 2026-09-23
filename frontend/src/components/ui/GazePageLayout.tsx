import React from 'react';
import { Bell } from 'lucide-react';
import { BackButton, BACK_BUTTON_SIZE_PX } from './BackButton';
import { GazeButton } from './GazeButton';
import { useReminders } from '../../context/ReminderContext';
import { SessaoChip } from './SessaoChip';

/**
 * Não existe `showEmergency` aqui, e é de propósito.
 *
 * Havia — declarada no tipo, aceita pelo TypeScript em oito telas, e
 * silenciosamente ignorada: a desestruturação nunca a extraía. Quem decide se
 * o botão de socorro aparece é o `EmergencyProvider`, globalmente, pela rota.
 * Uma prop que o compilador aceita e o componente ignora é pior que prop
 * nenhuma: a próxima tela que precisar esconder o socorro passaria
 * `showEmergency={false}`, veria o código compilar, e o botão apareceria assim
 * mesmo.
 */
interface GazePageLayoutProps {
  children: React.ReactNode;
  showBack?: boolean;
  backRoute?: string;
  /**
   * Modo "sem moldura": fundo preto, sem padding e sem o cabeçalho canônico
   * (voltar + zona de descanso). A tela passa a controlar 100% do viewport e
   * desenha a própria navegação. Usado pelo teclado de varredura, que precisa
   * de tela cheia preta e das teclas encostando nas bordas.
   * Os lembretes continuam sendo exibidos normalmente.
   */
  bare?: boolean;
  /**
   * Título da tela, no cabeçalho canônico (ao lado do Voltar). Opcional: a
   * Home não tem título, e telas que desenham o próprio cabeçalho também não.
   */
  titulo?: string;
  /** Uma linha abaixo do título — "olhe para selecionar", página 1 de 2… */
  subtitulo?: string;
}

export const GazePageLayout: React.FC<GazePageLayoutProps> = ({
  children,
  showBack = true,
  backRoute,
  bare = false,
  titulo,
  subtitulo,
}) => {
  const { activeReminder, dismissActiveReminder } = useReminders();

  return (
    <div
      style={{
        position: 'relative',
        // `100%`, não `100vw`: com barra de rolagem vertical, `100vw` inclui a
        // largura da barra e o elemento fica ~15 px mais largo que a área
        // visível — barra horizontal no `body` sem nada a rolar.
        width: '100%',
        height: '100dvh',
        background: bare ? '#000000' : 'var(--page-bg)',
        color: 'var(--color-text-base)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        // O padding era fixo: 9.5rem + 3rem = 200 px verticais, 26 % da altura
        // de uma tela de 768. O topo existe só para liberar o botão Voltar de
        // 96 px; num notebook esse espaço vale mais como conteúdo. Com
        // `clamp`, tela grande mantém a respiração original e tela pequena
        // devolve ~90 px à grade — sem encolher alvo nenhum.
        padding: bare
          ? 0
          : 'clamp(6.5rem, 4rem + 7vh, 9.5rem) clamp(1rem, 2.5vw, 3rem) clamp(1rem, 3vh, 3rem)',
        fontFamily: 'var(--font-body)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Cabeçalho de Navegação e Emergência Canônica */}
      {!bare && (
        <header className="gaze-header" style={{ height: BACK_BUTTON_SIZE_PX }}>
          {/* Voltar Canônico — quadrado, à esquerda */}
          {showBack ? (
            <BackButton to={backRoute} />
          ) : (
            <div style={{ width: BACK_BUTTON_SIZE_PX, flexShrink: 0 }} />
          )}

          {/* Título da tela. Quando não há, o espaço vai para a zona de
              descanso, que então centraliza. */}
          {titulo ? (
            <div className="gaze-header__titulo">
              <h1>{titulo}</h1>
              {subtitulo && <p>{subtitulo}</p>}
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}

          {/* Zona de Descanso Neutra */}
          <div data-no-dwell="true" className="gaze-rest-zone gaze-header__descanso">
            <span aria-hidden="true">👁</span> Zona de descanso
          </div>

          {/* Estado da sessão: só lê `html[data-gaze]`. */}
          <SessaoChip />

          {/* Emergência Canônica (gerenciada globalmente pelo EmergencyProvider) */}
          <div className="gaze-header__emergencia" />
        </header>
      )}

      {/* Conteúdo Principal */}
      <div
        style={{
          width: '100%',
          // `flex: 1` + `minHeight: 0` no lugar de `height: 100%`: é o par que
          // permite o conteúdo encolher dentro do pai e entregar a rolagem ao
          // filho (a grade), em vez de estourar a caixa e ser cortado.
          flex: 1,
          minHeight: 0,
          position: 'relative',
        }}
      >
        {children}
      </div>

      {/* Lembretes e Rotina */}
      {activeReminder && (
        <div
          style={{
            // Véu do modal: `inset: 0` cobre a janela inteira sem depender de
            // `100vw`, que com barra de rolagem fica mais largo que a área
            // visível e cria rolagem horizontal.
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.8)',
            backdropFilter: 'blur(4px)',
            // Abaixo da Emergência (99990): o véu do lembrete cobria a tela
            // inteira POR CIMA do botão de socorro — com um lembrete na tela,
            // o paciente não tinha como pedir ajuda até dispensá-lo.
            zIndex: 99980,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-body)',
          }}
        >
          <div
            style={{
              background: 'var(--color-bg-elevated)',
              border: '2px solid var(--color-primary)',
              borderRadius: 'var(--radius-xl)',
              padding: '3rem',
              maxWidth: '550px',
              width: '90%',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2rem',
              boxShadow: 'var(--shadow-3)',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'var(--color-primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
              }}
            >
              <Bell size={40} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span className="t-overline">Lembrete de Rotina</span>
              <h2 className="t-display" style={{ margin: 0, color: 'var(--color-text-base)' }}>
                {activeReminder.title}
              </h2>
              <span style={{ fontSize: '1.25rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                Horário agendado: {activeReminder.time}
              </span>
            </div>

            <GazeButton
              onClick={dismissActiveReminder}
              variante="primaria"
              width={280}
              height={96}
              isolado
              style={{ borderRadius: 'var(--radius-lg)' }}
            >
              <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>Confirmar</span>
            </GazeButton>
          </div>
        </div>
      )}
    </div>
  );
};
