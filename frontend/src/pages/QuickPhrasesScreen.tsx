import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emitirFalaDoPaciente } from '../cloud/eventos';
import { falar } from '../services/voz';
import { MessageSquare, AlertCircle, Tv, Wind, Activity, ChevronRight, ChevronLeft } from 'lucide-react';
import { GazePageLayout } from '../components/ui/GazePageLayout';
import { GazeGrid } from '../components/ui/GazeGrid';
import { GazeButton } from '../components/ui/GazeButton';
import { logSentence } from '../utils/clinicalLogger';
import { DicaContextual } from '../components/ui/DicaContextual';
import { useAvisoDePrimeiroSucesso } from './useAvisoDePrimeiroSucesso';
import { FaixaDeMissao } from '../components/FaixaDeMissao';
import { cumprirMissao } from './tutorial/missao';

const PHRASES = [
  {
    id: 1,
    text: 'Gostaria de conversar',
    Icon: MessageSquare,
    iconColor: '#0d9488',
    bg: 'linear-gradient(135deg, rgba(13, 148, 136, 0.1), rgba(20, 253, 250, 0.05))',
  },
  {
    id: 2,
    text: 'Pode abrir a janela?',
    Icon: Wind,
    iconColor: '#0284c7',
    bg: 'linear-gradient(135deg, rgba(2, 132, 199, 0.1), rgba(240, 249, 255, 0.05))',
  },
  {
    id: 3,
    text: 'Quero descansar agora',
    Icon: Activity,
    iconColor: '#7c3aed',
    bg: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(245, 243, 255, 0.05))',
  },
  {
    id: 4,
    text: 'Pode mudar de posição?',
    Icon: AlertCircle,
    iconColor: '#d97706',
    bg: 'linear-gradient(135deg, rgba(217, 119, 6, 0.1), rgba(255, 251, 235, 0.05))',
  },
  {
    id: 5,
    text: 'Pode ligar a televisão?',
    Icon: Tv,
    iconColor: '#4f46e5',
    bg: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(238, 242, 255, 0.05))',
  },
  {
    id: 6,
    text: 'Preciso de um cobertor',
    Icon: Wind,
    iconColor: '#0891b2',
    bg: 'linear-gradient(135deg, rgba(8, 145, 178, 0.1), rgba(236, 254, 255, 0.05))',
  },
  {
    id: 7,
    text: 'Quero ouvir música',
    Icon: MessageSquare,
    iconColor: '#db2777',
    bg: 'linear-gradient(135deg, rgba(219, 39, 119, 0.1), rgba(253, 242, 248, 0.05))',
  },
  {
    id: 8,
    text: 'Preciso que alguém fique aqui',
    Icon: AlertCircle,
    iconColor: '#16a34a',
    bg: 'linear-gradient(135deg, rgba(22, 163, 74, 0.1), rgba(240, 253, 244, 0.05))',
  },
];

/** Só os textos, para a tela de Voz pré-sintetizar no cache da voz clonada. */
export const TEXTOS_DAS_FRASES_RAPIDAS = PHRASES.map((p) => p.text);

export const QuickPhrasesScreen: React.FC = () => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(0);
  useAvisoDePrimeiroSucesso();

  const handleSpeak = (text: string) => {
    void falar(text, { rate: 0.9 }).catch((e) => console.warn('[voz] falha ao falar:', e));
    logSentence(text);
    emitirFalaDoPaciente(text, 'frase');
    // Missão do tutorial, se houver uma em curso. Marcada AQUI e não no
    // `onClick` do cartão: o que o tutorial pediu foi "ouça o computador falar
    // uma frase", e é neste ponto que isso acontece. Silenciosa e idempotente
    // quando não há tutorial rodando, que é o caso comum.
    cumprirMissao('comunicacao');
  };

  const itemsPerPage = 5;
  const startIndex = currentPage * itemsPerPage;
  const visiblePhrases = PHRASES.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(PHRASES.length / itemsPerPage);

  return (
    <GazePageLayout
      showBack={true}
      backRoute="/menu"
      titulo="Frases Rápidas"
      subtitulo={`Página ${currentPage + 1} de ${totalPages} · Olhe para selecionar`}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <FaixaDeMissao missao="comunicacao" instrucao={t('tutorial.comunicacao.missao')} />
        <DicaContextual id="comunicacao" />

        <div style={{ flex: 1, minHeight: 0 }}>
          <GazeGrid columns={3} rows={2}>
            {visiblePhrases.map((phrase) => (
              <GazeButton
                key={phrase.id}
                onClick={() => handleSpeak(phrase.text)}
                style={{ height: '100%', borderRadius: 'var(--radius-xl)' }}
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    textAlign: 'center', 
                    padding: '1rem',
                    width: '100%'
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      background: phrase.bg,
                      padding: '0.9rem',
                      borderRadius: 'var(--radius-lg)',
                      color: phrase.iconColor,
                      marginBottom: '0.9rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <phrase.Icon size={52} strokeWidth={1.6} />
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(1.25rem, 2vh, 1.55rem)',
                      fontWeight: 800,
                      letterSpacing: '-0.015em',
                      lineHeight: 1.25,
                      color: 'var(--color-text-base)',
                    }}
                  >
                    {phrase.text}
                  </span>
                </div>
              </GazeButton>
            ))}

            {/* Sexto slot: Botão de Paginação */}
            {currentPage === 0 ? (
              <GazeButton
                onClick={() => setCurrentPage(1)}
                style={{
                  height: '100%',
                  borderRadius: 'var(--radius-xl)',
                  border: '2px dashed var(--state-hover-border)',
                  background: 'var(--state-active-bg)',
                  color: 'var(--color-primary)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', width: '100%' }}>
                  <ChevronRight size={56} aria-hidden="true" style={{ marginBottom: '0.5rem' }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.015em' }}>
                    Mais frases
                  </span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, opacity: 0.8, marginTop: '0.25rem' }}>
                    página 2 de {totalPages}
                  </span>
                </div>
              </GazeButton>
            ) : (
              <GazeButton
                onClick={() => setCurrentPage(0)}
                style={{
                  height: '100%',
                  borderRadius: 'var(--radius-xl)',
                  border: '2px dashed var(--state-hover-border)',
                  background: 'var(--state-active-bg)',
                  color: 'var(--color-primary)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', width: '100%' }}>
                  <ChevronLeft size={56} aria-hidden="true" style={{ marginBottom: '0.5rem' }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.015em' }}>
                    Primeira página
                  </span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, opacity: 0.8, marginTop: '0.25rem' }}>
                    página 1 de {totalPages}
                  </span>
                </div>
              </GazeButton>
            )}

            {/* Células vazias na última página: ocupam a grade 3×2 sem oferecer
                alvo nem desenhar quase nada — um cartão "desabilitado" com
                traço no meio parecia botão quebrado. */}
            {currentPage === 1 && (
              <>
                <div aria-hidden="true" style={{ borderRadius: 'var(--radius-xl)', border: '2px dashed var(--color-card-border)', opacity: 0.5 }} />
                <div aria-hidden="true" style={{ borderRadius: 'var(--radius-xl)', border: '2px dashed var(--color-card-border)', opacity: 0.5 }} />
              </>
            )}
          </GazeGrid>
        </div>
      </div>
    </GazePageLayout>
  );
};
