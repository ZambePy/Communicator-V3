import React, { useEffect, useState } from 'react';
import { emitirFalaDoPaciente } from '../../cloud/eventos';
import { falar } from '../../services/voz';
import { Heart, Plus, Trash2, Volume2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeButton } from '../../components/ui/GazeButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { EstadoVazio } from '../../components/ui/EstadoDaTela';

interface Favorite {
  id: string;
  text: string;
  createdAt: string;
}

const storageKey = (userId: string) => `irisflow_favorites_${userId}`;

const loadFavorites = (userId: string): Favorite[] => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Favorite[]) : [];
  } catch {
    return [];
  }
};

const speak = (text: string) => {
  emitirFalaDoPaciente(text, 'frase');
  void falar(text, { rate: 0.9 }).catch((e) => console.warn('[voz] falha ao falar:', e));
};

export const MyOptionsScreen: React.FC = () => {
  const { currentProfile } = useAuth();
  const userId = currentProfile?.id ?? 'guest';

  const [favorites, setFavorites] = useState<Favorite[]>(() => loadFavorites(userId));
  const [newText, setNewText] = useState('');

  useEffect(() => {
    localStorage.setItem(storageKey(userId), JSON.stringify(favorites));
  }, [favorites, userId]);

  const addFavorite = () => {
    const text = newText.trim();
    if (!text) return;
    setFavorites((f) => [
      ...f,
      { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() },
    ]);
    setNewText('');
  };

  const removeFavorite = (id: string) => {
    setFavorites((f) => f.filter((fav) => fav.id !== id));
  };

  return (
    <GazePageLayout
      showBack={true}
      backRoute="/menu"
      titulo="Minhas Opções"
      subtitulo="Frases favoritas — olhe em Falar para dizer uma delas"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          maxWidth: 'min(1200px, 100%)',
          margin: '0 auto',
          boxSizing: 'border-box',
          gap: 'var(--space-5)',
        }}
      >
        {/* Adicionar frase (Operado por cuidador com mouse/teclado) */}
        <section aria-labelledby="add-fav" className="surface" style={{ padding: 'var(--space-5)' }}>
          <h2 id="add-fav" className="t-h3" style={{ color: 'var(--color-text-base)', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Heart color="var(--color-danger)" fill="var(--color-danger)" size={20} aria-hidden="true" />
            Adicionar frase favorita
          </h2>
          <p className="t-caption" style={{ margin: '0 0 1rem 0' }}>
            Para o cuidador, com mouse e teclado. A frase entra na lista abaixo, pronta para o olhar.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <input
              id="fav-input"
              type="text"
              className="campo"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFavorite()}
              placeholder="Ex.: Quero um copo de água"
              aria-label="Nova frase favorita"
              style={{ flex: 1, minWidth: 200, width: 'auto' }}
            />
            <PrimaryButton onClick={addFavorite} disabled={!newText.trim()}>
              <Plus size={18} aria-hidden="true" /> Adicionar
            </PrimaryButton>
          </div>
        </section>

        {/* Lista de Favoritos (Operado por paciente com gaze) */}
        <section
          aria-labelledby="fav-list-title"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h2
            id="fav-list-title"
            className="t-overline"
            style={{ margin: '0 0 0.75rem 0.5rem' }}
          >
            Seus favoritos ({favorites.length})
          </h2>

          {favorites.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum favorito ainda"
              texto="Adicione a primeira frase acima e ela aparece aqui, pronta para o olhar."
              icone={<Heart size={30} />}
            />
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {favorites.map((fav) => (
                <li
                  key={fav.id}
                  className="surface"
                  style={{
                    padding: '0.75rem 0.75rem 0.75rem 1.5rem',
                    display: 'flex',
                    gap: 'var(--space-4)',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      letterSpacing: '-0.015em',
                      color: 'var(--color-text-base)',
                    }}
                  >
                    {fav.text}
                  </span>

                  {/* Falar - GazeButton. 230×96: era 180×60, abaixo do alvo
                      mínimo de 5°. Sem `isolado`: o item de baixo é vizinho. */}
                  <GazeButton
                    onClick={() => speak(fav.text)}
                    variante="primaria"
                    width={230}
                    height={96}
                    noWarn
                    style={{ borderRadius: 'var(--radius-md)' }}
                    aria-label={`Falar: ${fav.text}`}
                  >
                    <Volume2 size={26} aria-hidden="true" />
                    <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>Falar</span>
                  </GazeButton>

                  {/* Remover - Botão comum (Cuidador) */}
                  <button
                    type="button"
                    onClick={() => removeFavorite(fav.id)}
                    aria-label={`Remover favorito: ${fav.text}`}
                    data-no-dwell="true"
                    className="btn btn--ghost"
                    style={{
                      color: 'var(--tint-danger-text)',
                      borderColor: 'var(--tint-danger-border)',
                      background: 'var(--tint-danger-bg)',
                      padding: '0.75rem',
                      minHeight: 48,
                    }}
                  >
                    <Trash2 size={20} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </GazePageLayout>
  );
};
