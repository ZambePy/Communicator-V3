import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Camera, ArrowLeft, Trash2, X, ZoomIn, Palette } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { lerAlbum, removerDoAlbum, LIMITE_DO_ALBUM, type ImagemDoAlbum } from './album';

/**
 * GALERIA — só o que o paciente fez.
 *
 * Havia quatro fotos de exemplo vindas do unsplash.com. Saíram por três
 * motivos: o app roda offline (e a CSP não libera essa origem), então
 * apareciam quatro quadros quebrados; "Baixar" numa imagem de outra origem
 * era bloqueado pelo `will-navigate` do Electron; e um álbum que começa com
 * fotos de estranhos não é o álbum de ninguém. O estado vazio diz o que fazer.
 *
 * Todo alvo do paciente é `GazeButton` com altura ≥ 72 px. A miniatura inteira
 * (≥ 320×240) é o alvo de abrir a foto — um único alvo grande por cartão, em
 * vez de miniatura crua + "Ver Foto" de 130×50 lado a lado, que ficavam ambos
 * abaixo do mínimo e disputavam o mesmo olhar.
 *
 * Não há "Baixar Foto": abre o diálogo nativo de salvar, que o olhar não tem
 * como fechar. A foto está no álbum; o arquivo é assunto do cuidador.
 */

/** Dwell do apagar: destrutivo e sem desfazer, então pede mais que um olhar. */
const DWELL_DE_APAGAR_MS = 2000;

const rotulo = (foto: ImagemDoAlbum): string => {
  const data = new Date(foto.timestamp).toLocaleDateString();
  return foto.filter === 'Desenho' ? `Desenho de ${data}` : `Foto de ${data}`;
};

export const GalleryScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<ImagemDoAlbum[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<ImagemDoAlbum | null>(null);

  useEffect(() => {
    setPhotos(lerAlbum());
  }, []);

  const handleDeletePhoto = (photoId: string) => {
    setPhotos(removerDoAlbum(photoId));
    setSelectedPhoto(null);
  };

  return (
    <main
      role="main"
      aria-labelledby="gallery-title"
      style={{
        // Altura fixa e rolagem só na grade: com o álbum cheio, quem rolava era
        // o documento, e as fotos passavam por baixo da Emergência (fixa).
        height: '100dvh',
        width: '100%',
        backgroundColor: 'var(--color-bg-base)',
        color: 'var(--color-text-base)',
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem 3rem',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Barra Superior com Botões Ampliados */}
      <header
        className="reserva-emergencia"
        style={{
          '--reserva-margem': '3rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <GazeButton
            onClick={() => navigate('/games')}
            width={200}
            height={72}
            isolado
            style={{
              borderRadius: '1.5rem',
              border: '2px solid var(--color-card-border)',
              background: 'var(--color-card-bg)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
            }}
            aria-label={t('lazer.voltarAria')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.35rem', fontWeight: 800 }}>
              <ArrowLeft size={28} /> Voltar
            </div>
          </GazeButton>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '1rem',
                background: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 8px 20px rgba(147, 51, 234, 0.35)',
              }}
            >
              <ImageIcon size={30} />
            </div>
            <div>
              <h1
                id="gallery-title"
                style={{
                  fontSize: '2rem',
                  fontWeight: 800,
                  margin: 0,
                  color: 'var(--color-text-base)',
                  letterSpacing: '-0.02em',
                }}
              >
                Galeria de Fotos
              </h1>
              <span style={{ fontSize: '1.05rem', opacity: 0.75, fontWeight: 500 }}>
                {photos.length === 0
                  ? 'Nenhuma foto ainda'
                  : `${photos.length} de ${LIMITE_DO_ALBUM} no álbum`}
              </span>
            </div>
          </div>
        </div>

        {/* Botão Ampliado de Tirar Nova Foto */}
        <GazeButton
          onClick={() => navigate('/photo')}
          width={260}
          height={72}
          isolado
          style={{
            borderRadius: '1.5rem',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#ffffff',
            border: '2px solid rgba(255,255,255,0.3)',
            boxShadow: '0 8px 24px rgba(37,99,235,0.35)',
          }}
          aria-label="Ir para a tela de Tirar Nova Foto"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.3rem', fontWeight: 800 }}>
            <Camera size={28} />
            <span>Tirar Nova Foto</span>
          </div>
        </GazeButton>
      </header>

      {photos.length === 0 ? (
        <section
          aria-label="Álbum vazio"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          <ImageIcon size={72} aria-hidden="true" style={{ opacity: 0.35 }} />
          <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
            Nenhuma foto ainda — tire a primeira.
          </p>
          <p style={{ margin: 0, fontSize: '1.15rem', opacity: 0.75, maxWidth: 560, lineHeight: 1.5 }}>
            As fotos da câmera e os desenhos que você guardar aparecem aqui. Tudo fica só neste
            computador.
          </p>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.5rem' }}>
            <GazeButton
              onClick={() => navigate('/photo')}
              width={300}
              height={96}
              isolado
              aria-label="Tirar a primeira foto"
              style={{
                borderRadius: '1.75rem',
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: '2px solid rgba(255,255,255,0.3)',
                boxShadow: '0 10px 26px rgba(37,99,235,0.35)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.35rem', fontWeight: 800 }}>
                <Camera size={30} /> Tirar a primeira foto
              </span>
            </GazeButton>
            <GazeButton
              onClick={() => navigate('/drawing')}
              width={300}
              height={96}
              isolado
              aria-label="Fazer um desenho"
              style={{
                borderRadius: '1.75rem',
                background: 'var(--color-card-bg)',
                border: '2px solid var(--color-card-border)',
                color: 'var(--color-text-base)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.35rem', fontWeight: 800 }}>
                <Palette size={30} /> Fazer um desenho
              </span>
            </GazeButton>
          </div>
        </section>
      ) : (
        <div
          role="list"
          aria-label="Fotos do álbum"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            alignContent: 'start',
            gap: '2rem',
            width: '100%',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '0.5rem 0.5rem 2rem',
          }}
        >
          {photos.map((photo) => {
            const alt = rotulo(photo);
            return (
              <div
                key={photo.id}
                role="listitem"
                style={{
                  borderRadius: '2rem',
                  overflow: 'hidden',
                  background: 'var(--color-card-bg)',
                  border: '2px solid var(--color-card-border)',
                  boxShadow: '0 12px 30px var(--color-card-shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {/* A miniatura inteira é o alvo: ≥ 320×240, bem acima do mínimo. */}
                <GazeButton
                  onClick={() => setSelectedPhoto(photo)}
                  aria-label={`Ver foto: ${alt}`}
                  style={{
                    width: '100%',
                    height: '260px',
                    padding: 0,
                    border: 'none',
                    borderRadius: 0,
                    background: '#000',
                    position: 'relative',
                    display: 'block',
                  }}
                >
                  <img
                    src={photo.dataUrl}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '260px', objectFit: 'cover', display: 'block' }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      bottom: '1rem',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 1.1rem',
                      borderRadius: '999px',
                      background: 'rgba(2, 6, 23, 0.7)',
                      color: '#ffffff',
                      fontSize: '1.1rem',
                      fontWeight: 800,
                    }}
                  >
                    <ZoomIn size={24} /> Ver foto
                  </span>
                </GazeButton>

                <div
                  style={{
                    padding: '1rem 1.25rem',
                    borderTop: '1px solid var(--color-card-border)',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: 'var(--color-text-base)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {alt}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Visualização em Tela Cheia */}
      {selectedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-photo-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.92)',
            backdropFilter: 'blur(16px)',
            // Abaixo da Emergência (99990), que continua acionável por cima.
            zIndex: 99985,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // O topo livre até abaixo da Emergência: o cartão centralizado
            // chegava ao canto superior direito com fotos altas.
            padding: 'var(--reserva-emergencia-y) 2.5rem 2.5rem',
            overflowY: 'auto',
            animation: 'fadeIn 0.3s ease-out both',
          }}
        >
          <div
            style={{
              background: 'var(--color-card-bg)',
              border: '3px solid var(--color-card-border)',
              borderRadius: '2.5rem',
              padding: '2rem 2.5rem',
              maxWidth: '1100px',
              width: '95%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.5rem',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '1rem' }}>
              <h2
                id="modal-photo-title"
                style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--color-text-base)' }}
              >
                {rotulo(selectedPhoto)}
              </h2>

              <GazeButton
                onClick={() => setSelectedPhoto(null)}
                width={220}
                height={76}
                isolado
                style={{
                  borderRadius: '1.25rem',
                  border: '2px solid var(--color-card-border)',
                  background: 'var(--color-card-bg)',
                  flexShrink: 0,
                }}
                aria-label="Fechar visualização"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', fontWeight: 800 }}>
                  <X size={26} /> Fechar
                </div>
              </GazeButton>
            </div>

            <div
              style={{
                width: '100%',
                maxHeight: '520px',
                borderRadius: '1.75rem',
                overflow: 'hidden',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
              }}
            >
              <img
                src={selectedPhoto.dataUrl}
                alt={rotulo(selectedPhoto)}
                style={{
                  maxWidth: '100%',
                  maxHeight: '520px',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', width: '100%', justifyContent: 'center' }}>
              <GazeButton
                onClick={() => handleDeletePhoto(selectedPhoto.id)}
                data-dwell-ms={DWELL_DE_APAGAR_MS}
                width={260}
                height={76}
                isolado
                style={{
                  borderRadius: '1.5rem',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: '#ffffff',
                  border: '2px solid rgba(255,255,255,0.3)',
                  boxShadow: '0 8px 24px rgba(220,38,38,0.3)',
                }}
                aria-label="Excluir foto do álbum"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem', fontWeight: 800 }}>
                  <Trash2 size={26} />
                  <span>Excluir Foto</span>
                </div>
              </GazeButton>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
