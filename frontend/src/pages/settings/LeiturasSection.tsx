import React, { useState } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { CHAVE_DAS_LEITURAS, lerLeituras, type Leitura } from '../entertainment/NewsScreen';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { EstadoVazio } from '../../components/ui/EstadoDaTela';

/**
 * LEITURAS — o que o cuidador guarda para o paciente ouvir em "Leituras".
 *
 * A tela de Leituras (`entertainment/NewsScreen`) só LÊ
 * `localStorage['irisflow_leituras']`; até aqui ninguém escrevia nela, e o
 * estado vazio de lá apontava para um formulário que não existia. Este é o
 * formulário: título + texto, gravados como `{ id, titulo, texto, criadoEm }`.
 *
 * Tudo local. É tela do cuidador — mouse e teclado — então os controles são
 * os comuns, sem mínimo de olhar.
 */

const gerarId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `leitura_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function gravarLeituras(leituras: Leitura[]): void {
  try {
    localStorage.setItem(CHAVE_DAS_LEITURAS, JSON.stringify(leituras));
  } catch {
    // Sem persistência a leitura some ao fechar. A tela avisa pelo estado.
  }
}

const quandoFoi = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return '';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const MAX_TITULO = 80;

export const LeiturasSection: React.FC<{ cardStyle?: React.CSSProperties }> = ({ cardStyle }) => {
  const [leituras, setLeituras] = useState<Leitura[]>(() => lerLeituras());
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const podeGuardar = texto.trim().length > 0;

  const guardar = (e?: React.FormEvent) => {
    e?.preventDefault();
    const corpo = texto.trim();
    if (!corpo) {
      setErro('Escreva o texto da leitura antes de guardar.');
      return;
    }
    const nova: Leitura = {
      id: gerarId(),
      titulo: titulo.trim().slice(0, MAX_TITULO) || `Leitura ${leituras.length + 1}`,
      texto: corpo,
      criadoEm: new Date().toISOString(),
    };
    // A mais nova primeiro: é a que o cuidador acabou de colar e quer conferir.
    const proximas = [nova, ...leituras];
    gravarLeituras(proximas);
    setLeituras(proximas);
    setTitulo('');
    setTexto('');
    setErro(null);
  };

  const apagar = (id: string) => {
    const proximas = leituras.filter((l) => l.id !== id);
    gravarLeituras(proximas);
    setLeituras(proximas);
  };

  return (
    <section aria-labelledby="leituras-title" style={cardStyle} data-testid="secao-leituras">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <BookOpen size={28} color="var(--color-primary)" aria-hidden="true" />
        <h2 id="leituras-title" className="t-h2" style={{ color: 'var(--color-text-base)', margin: 0 }}>
          Leituras
        </h2>
      </div>
      <p className="t-body" style={{ color: 'var(--color-text-muted)', margin: '0 0 1.25rem 0', maxWidth: '64ch' }}>
        Textos que o paciente ouve em voz alta no módulo Leituras: um trecho de livro, uma carta, o
        resumo do jogo. Fica só neste computador.
      </p>

      <form onSubmit={guardar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div>
          <label htmlFor="leitura-titulo" className="campo__rotulo">
            Título
          </label>
          <input
            id="leitura-titulo"
            type="text"
            className="campo"
            value={titulo}
            maxLength={MAX_TITULO}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Carta da Ana"
          />
        </div>
        <div>
          <label htmlFor="leitura-texto" className="campo__rotulo">
            Texto
          </label>
          <textarea
            id="leitura-texto"
            className="campo"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (erro) setErro(null);
            }}
            placeholder="Cole ou escreva aqui o texto que será lido em voz alta."
            rows={6}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'leitura-erro' : undefined}
          />
        </div>
        {erro && (
          <p
            id="leitura-erro"
            role="alert"
            style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: 'var(--tint-danger-text)' }}
          >
            {erro}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <PrimaryButton type="submit" disabled={!podeGuardar}>
            <Plus size={18} aria-hidden="true" /> Guardar leitura
          </PrimaryButton>
        </div>
      </form>

      <div style={{ marginTop: '1.5rem' }}>
        <h3 className="t-overline" style={{ margin: '0 0 0.75rem 0' }}>
          Guardadas ({leituras.length})
        </h3>
        {leituras.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma leitura guardada"
            texto="A primeira que você guardar aparece aqui e no módulo Leituras do paciente."
            icone={<BookOpen size={30} aria-hidden="true" />}
            style={{ padding: 'var(--space-5)' }}
            data-testid="leituras-vazio"
          />
        ) : (
          <ul
            style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            data-testid="lista-de-leituras"
          >
            {leituras.map((l) => (
              <li
                key={l.id}
                className="surface"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  padding: '1rem 1rem 1rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <strong className="t-h3" style={{ color: 'var(--color-text-base)' }}>
                    {l.titulo}
                  </strong>
                  <span
                    className="t-body"
                    style={{
                      color: 'var(--color-text-muted)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {l.texto}
                  </span>
                  {quandoFoi(l.criadoEm) && (
                    <span className="t-caption">{quandoFoi(l.criadoEm)}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => apagar(l.id)}
                  aria-label={`Apagar leitura: ${l.titulo}`}
                  className="btn btn--ghost"
                  style={{
                    flexShrink: 0,
                    color: 'var(--tint-danger-text)',
                    borderColor: 'var(--tint-danger-border)',
                    background: 'var(--tint-danger-bg)',
                    padding: '0.6rem 0.9rem',
                    minHeight: 44,
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" /> Apagar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
