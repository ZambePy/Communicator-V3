import React, { useState } from 'react';
import { emitirFalaDoPaciente } from '../../cloud/eventos';
import { falar } from '../../services/voz';
import { Utensils, Droplets, Smile, Frown, Home, Phone, AlertCircle, Heart, ChevronRight, ChevronLeft, Play } from 'lucide-react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { GazeButton } from '../../components/ui/GazeButton';
import { DicaContextual } from '../../components/ui/DicaContextual';

const PICTOGRAMS = [
  { id: 1, label: 'Eu Quero Comer', Icon: Utensils, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  { id: 2, label: 'Estou com Sede', Icon: Droplets, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  { id: 3, label: 'Estou Bem', Icon: Smile, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
  { id: 4, label: 'Estou com Dor', Icon: AlertCircle, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
  { id: 5, label: 'Quero Ir ao Banheiro', Icon: Home, color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' },
  { id: 6, label: 'Chamar Família', Icon: Phone, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
  { id: 7, label: 'Obrigado(a)', Icon: Heart, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' },
  { id: 8, label: 'Não estou Bem', Icon: Frown, color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.1)' },
];

/** Só os textos, para a tela de Voz pré-sintetizar no cache da voz clonada. */
export const TEXTOS_DOS_PICTOGRAMAS = PICTOGRAMS.map((p) => p.label);

export const PictogramScreen: React.FC = () => {
  const [selectedText, setSelectedText] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const handleSpeak = (text: string) => {
    setSelectedText(text);
    void falar(text, { rate: 0.9 }).catch((e) => console.warn('[voz] falha ao falar:', e));
    emitirFalaDoPaciente(text, 'pictograma');
  };

  const itemsPerPage = 5;
  const startIndex = currentPage * itemsPerPage;
  const visiblePictograms = PICTOGRAMS.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(PICTOGRAMS.length / itemsPerPage);

  return (
    <GazePageLayout
      showBack={true}
      backRoute="/menu"
      titulo="Pictogramas"
      subtitulo={`Página ${currentPage + 1} de ${totalPages} · Olhe para selecionar e falar`}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
          gap: 'var(--space-4)',
        }}
      >
        <DicaContextual id="pictogramas" />

        {/* Última fala: o que acabou de ser dito, com "Falar de novo". */}
        <div
          className="surface"
          data-no-dwell="true"
          style={{
            padding: '0.75rem 0.75rem 0.75rem 1.5rem',
            minHeight: 96,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
            <span className="t-overline">{selectedText ? 'Última fala' : 'Nada dito ainda'}</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.6rem',
                fontWeight: 800,
                letterSpacing: '-0.015em',
                color: selectedText ? 'var(--color-primary)' : 'var(--color-text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {selectedText || 'Selecione um pictograma...'}
            </span>
          </div>
          {selectedText && (
            <GazeButton
              onClick={() => handleSpeak(selectedText)}
              variante="primaria"
              width={230}
              height={96}
              noWarn
              style={{ borderRadius: 'var(--radius-md)' }}
              aria-label={`Falar de novo: ${selectedText}`}
            >
              <Play size={22} fill="currentColor" aria-hidden="true" />
              <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>Falar de novo</span>
            </GazeButton>
          )}
        </div>

        {/* Grade de Pictogramas */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <GazeGrid columns={3} rows={2}>
            {visiblePictograms.map((pic) => (
              <GazeButton
                key={pic.id}
                onClick={() => handleSpeak(pic.label)}
                style={{
                  height: '100%',
                  borderRadius: 'var(--radius-xl)',
                  border: `2px solid ${pic.color}55`,
                }}
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    textAlign: 'center', 
                    padding: '1rem',
                    width: '100%',
                    gap: '1rem'
                  }}
                >
                  <div
                    style={{
                      background: pic.bg,
                      color: pic.color,
                      padding: '1.25rem',
                      borderRadius: '1.5rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <pic.Icon size={60} aria-hidden="true" />
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(1.25rem, 2vh, 1.55rem)',
                      fontWeight: 800,
                      letterSpacing: '-0.015em',
                      lineHeight: 1.2,
                      color: 'var(--color-text-base)',
                    }}
                  >
                    {pic.label}
                  </span>
                </div>
              </GazeButton>
            ))}

            {/* Paginação */}
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
                    Mais opções
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

            {/* Células vazias na última página: ocupam a grade sem oferecer alvo. */}
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
