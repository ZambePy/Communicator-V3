import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookOpen, Volume2, Square } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';
import { falar, pararFala } from '../../services/voz';

/**
 * LEITURAS — textos que o cuidador guardou, lidos em voz alta pelo olhar.
 *
 * Era "Jornal do Dia", com três notícias fixas no código e um aviso de que
 * eram demonstração. Não há fonte de notícias e o app roda offline; inventar
 * uma faria o app apresentar texto falso como se fosse jornal. Então a tela
 * passou a ler o que ALGUÉM DE VERDADE escreveu para esta pessoa: um trecho
 * de livro, uma carta, o resumo do jogo — o que o cuidador colar.
 *
 * A fonte é `localStorage['irisflow_leituras']`, um array de
 * `{ id, titulo, texto, criadoEm }`. Esta tela só LÊ. Quem escreve é a tela
 * do cuidador (Configurações), que não faz parte deste módulo; enquanto ela
 * não tiver o formulário, o estado vazio diz o que falta e onde.
 *
 * Tudo local: nada é buscado nem enviado.
 */

export const CHAVE_DAS_LEITURAS = 'irisflow_leituras';

export interface Leitura {
  id: string;
  titulo: string;
  texto: string;
  /** ISO 8601. */
  criadoEm: string;
}

function ehLeitura(v: unknown): v is Leitura {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.texto === 'string' && o.texto.trim().length > 0;
}

/** Lê as leituras guardadas. Registro ilegível vira lista vazia. */
export function lerLeituras(): Leitura[] {
  try {
    const raw = localStorage.getItem(CHAVE_DAS_LEITURAS);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(ehLeitura).map((l, i) => ({
      id: typeof l.id === 'string' && l.id ? l.id : `leitura_${i}`,
      titulo: typeof l.titulo === 'string' && l.titulo.trim() ? l.titulo : `Leitura ${i + 1}`,
      texto: l.texto,
      criadoEm: typeof l.criadoEm === 'string' ? l.criadoEm : new Date(0).toISOString(),
    }));
  } catch {
    return [];
  }
}

export const NewsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  /** Id da leitura sendo lida, só para dar retorno visual — o paciente não tem
   *  como saber que o dwell "pegou" se nada mudar na tela. */
  const [lendo, setLendo] = useState<string | null>(null);

  useEffect(() => {
    setLeituras(lerLeituras());
  }, []);

  const ler = useCallback((l: Leitura) => {
    setLendo(l.id);
    void falar(`${l.titulo}. ${l.texto}`, { rate: 0.9 })
      .catch(() => {
        /* voz indisponível: o texto continua na tela, que é o essencial */
      })
      .finally(() => setLendo((atual) => (atual === l.id ? null : atual)));
  }, []);

  const parar = useCallback(() => {
    pararFala();
    setLendo(null);
  }, []);

  return (
    <main
      role="main"
      aria-labelledby="news-title"
      style={{
        // Altura fixa; quem rola é a lista (abaixo), não o documento — senão
        // as leituras passavam por baixo da Emergência, que é fixa.
        height: '100dvh',
        width: '100%',
        boxSizing: 'border-box',
        background: 'var(--color-bg-base)',
        color: 'var(--color-text-base)',
        padding: '2rem 3rem 0 3rem',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <header
        className="reserva-emergencia"
        style={{
          '--reserva-margem': '3rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          marginBottom: '1.5rem',
          flexShrink: 0,
        }}
      >
        <GazeButton
          onClick={() => navigate('/games')}
          width={200}
          height={72}
          isolado
          style={{
            borderRadius: '1.5rem',
            background: 'var(--color-card-bg)',
            border: '2px solid var(--color-card-border)',
            boxShadow: '0 6px 20px var(--color-card-shadow)',
          }}
          aria-label={t('lazer.voltarAria')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '1.3rem', fontWeight: 800 }}>
            <ArrowLeft size={28} /> Voltar
          </span>
        </GazeButton>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <span
            aria-hidden="true"
            style={{
              width: 52,
              height: 52,
              borderRadius: '1rem',
              background: 'linear-gradient(135deg, #475569, #1e293b)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BookOpen size={30} />
          </span>
          <div>
            <h1 id="news-title" style={{ fontSize: '2rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
              Leituras
            </h1>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '1.1rem', opacity: 0.75, fontWeight: 500 }}>
              Textos guardados para você, lidos em voz alta
            </p>
          </div>
        </div>
      </header>

      {leituras.length === 0 ? (
        <section
          aria-label="Nenhuma leitura guardada"
          style={{
            maxWidth: 760,
            margin: '3rem auto 0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            textAlign: 'center',
            padding: '2.5rem 2rem',
            borderRadius: '1.75rem',
            background: 'var(--color-card-bg)',
            border: '2px solid var(--color-card-border)',
          }}
        >
          <BookOpen size={64} aria-hidden="true" style={{ opacity: 0.35 }} />
          <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>Nenhuma leitura ainda.</p>
          <p style={{ margin: 0, fontSize: '1.15rem', lineHeight: 1.55, opacity: 0.8 }}>
            Quem cuida de você pode guardar textos aqui — um trecho de livro, uma carta, o resumo
            do jogo de ontem — e o computador lê em voz alta quando você olhar para o botão. Peça
            para adicionarem uma leitura em Configurações.
          </p>
        </section>
      ) : (
        <ol
          aria-label="Leituras guardadas"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.75rem',
            maxWidth: 900,
            width: '100%',
            margin: '0 auto',
            padding: '0.5rem 0.5rem 4rem',
            listStyle: 'none',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {leituras.map((item) => {
            const estaLendo = lendo === item.id;
            return (
              <li key={item.id}>
                <article
                  aria-labelledby={`leitura-${item.id}-title`}
                  style={{
                    background: 'var(--color-card-bg)',
                    border: `2px solid ${estaLendo ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
                    padding: '2rem 2.25rem',
                    borderRadius: '1.75rem',
                    boxShadow: '0 10px 26px var(--color-card-shadow)',
                  }}
                >
                  <h2
                    id={`leitura-${item.id}-title`}
                    style={{ fontSize: '1.6rem', fontWeight: 900, margin: '0 0 0.75rem 0' }}
                  >
                    {item.titulo}
                  </h2>
                  <p
                    style={{
                      fontSize: '1.3rem',
                      lineHeight: 1.6,
                      margin: 0,
                      opacity: 0.9,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {item.texto}
                  </p>

                  <div style={{ marginTop: '1.5rem' }}>
                    <GazeButton
                      onClick={() => (estaLendo ? parar() : ler(item))}
                      width={250}
                      height={76}
                      isolado
                      style={{
                        borderRadius: '1.5rem',
                        background: estaLendo
                          ? 'var(--color-card-bg)'
                          : 'linear-gradient(135deg, #1b54a8, #2563eb)',
                        color: estaLendo ? 'var(--color-primary)' : '#ffffff',
                        border: estaLendo
                          ? '3px solid var(--color-primary)'
                          : '2px solid rgba(255,255,255,0.3)',
                        boxShadow: '0 8px 22px rgba(27,84,168,0.3)',
                      }}
                      aria-label={
                        estaLendo
                          ? `Parar a leitura de ${item.titulo}`
                          : `Ouvir ${item.titulo} em voz alta`
                      }
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '1.25rem', fontWeight: 800 }}>
                        {estaLendo ? <Square size={26} /> : <Volume2 size={28} />}
                        {estaLendo ? 'Parar' : 'Ouvir'}
                      </span>
                    </GazeButton>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
};
