import React from 'react';
import { Bell } from 'lucide-react';
import { BackButton, BACK_BUTTON_SIZE_PX } from './BackButton';
import { GazeButton } from './GazeButton';
import { useReminders } from '../../context/ReminderContext';

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
}

export const GazePageLayout: React.FC<GazePageLayoutProps> = ({
  children,
  showBack = true,
  backRoute,
  bare = false,
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
        background: bare ? '#000000' : 'var(--color-bg-base)',
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
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Cabeçalho de Navegação e Emergência Canônica */}
      {!bare && (
        <div
          style={{
            position: 'absolute',
            top: 'clamp(1rem, 2.5vh, 2rem)',
            left: 'clamp(1rem, 2.5vw, 3rem)',
            right: 'clamp(1rem, 2.5vw, 3rem)',
            height: BACK_BUTTON_SIZE_PX,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 9990,
          }}
        >
          {/* Voltar Canônico */}
          {showBack ? (
            <BackButton to={backRoute} />
          ) : (
            <div style={{ width: BACK_BUTTON_SIZE_PX }} />
          )}

          {/* Zona de Descanso Neutra */}
          <div
            data-no-dwell="true"
            className="gaze-rest-zone"
            style={{
              // 320 px era o valor de 8,0° na tela de referência, cravado. Em
              // tela estreita ele espremia o cabeçalho; o mínimo continua
              // sendo respeitado quando há espaço, e encolhe antes de empurrar
              // os outros dois elementos para fora.
              width: 'min(320px, 34vw)',
              flexShrink: 1,
              height: '4.5rem',
              background: 'transparent',
              border: '2px dashed var(--color-card-border)',
              borderRadius: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'default',
              userSelect: 'none',
            }}
          >
            👁 Zona de Descanso (Sem clique)
          </div>

          {/* Emergência Canônica (Gerenciada globalmente pelo EmergencyProvider) */}
          <div style={{ width: 200 }} />
        </div>
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
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div
            style={{
              background: 'var(--color-card-bg)',
              border: '3px solid var(--color-primary)',
              borderRadius: '2.5rem',
              padding: '3rem',
              maxWidth: '550px',
              width: '90%',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(27, 84, 168, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
              }}
            >
              <Bell size={40} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem', opacity: 0.6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Lembrete de Rotina
              </span>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 900, margin: 0, color: 'var(--color-text-base)' }}>
                {activeReminder.title}
              </h2>
              <span style={{ fontSize: '1.25rem', opacity: 0.7, fontWeight: 600 }}>
                Horário agendado: {activeReminder.time}
              </span>
            </div>

            <GazeButton
              onClick={dismissActiveReminder}
              style={{
                width: '280px',
                height: '76px',
                borderRadius: '1.75rem',
                background: 'var(--color-primary)',
                color: '#ffffff',
                boxShadow: '0 10px 20px rgba(27, 84, 168, 0.25)',
              }}
            >
              <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>Confirmar</span>
            </GazeButton>
          </div>
        </div>
      )}
    </div>
  );
};
