import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Mic, Volume2 } from 'lucide-react';
import type { GravacaoGuardada } from '@tracker/voz/vozGuardada';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { GazeButton } from '../../components/ui/GazeButton';
import { useAuth } from '../../context/AuthContext';
import { emitirFalaDoPaciente } from '../../cloud/eventos';
import { logSentence } from '../../utils/clinicalLogger';
import { vozClonadaLiberadaPelaLicenca } from '../../services/voz';
import { armazemDaVozGuardada, gravacoesDoPerfil } from '../../services/voz/vozGuardada/armazem';
import { tocarMensagemGuardada } from '../../services/voz/vozGuardada/tocar';

export type CelulaDaPagina = { tipo: 'mensagem'; indice: number } | { tipo: 'gravar' } | { tipo: 'mais'; proxima: number; total: number };

/**
 * As células de cada página da grade 3×2. Até 5 mensagens cabem numa página
 * com o cartão "Gravar frases"; com mais, cada página leva 4 mensagens, o
 * "Mais mensagens" e o "Gravar frases" — este no MESMO lugar em todas as
 * páginas, para o olhar aprender onde ele mora.
 */
export function paginasDasMensagens(total: number): CelulaDaPagina[][] {
  if (total <= 5) return [[...Array.from({ length: total }, (_, i) => ({ tipo: 'mensagem' as const, indice: i })), { tipo: 'gravar' }]];
  const porPagina = 4;
  const n = Math.ceil(total / porPagina);
  return Array.from({ length: n }, (_, p) => [
    ...Array.from({ length: Math.min(porPagina, total - p * porPagina) }, (_, i) => ({ tipo: 'mensagem' as const, indice: p * porPagina + i })),
    { tipo: 'mais' as const, proxima: (p + 1) % n, total: n },
    { tipo: 'gravar' as const },
  ]);
}

/** A linha do plano: calma, informativa, sem botão de compra nem bloqueio. */
export function linhaDoPlano(vozLiberada: boolean): string {
  return vozLiberada
    ? 'Gravar e ouvir as suas mensagens é sempre grátis. O seu plano inclui a voz do computador: uma gravação daqui pode virar a base dela.'
    : 'Gravar e ouvir as suas mensagens é sempre grátis. Com o plano Voz, o computador também aprende a falar qualquer frase com a sua voz.';
}

const alvo: React.CSSProperties = { height: '100%', width: '100%', borderRadius: 'var(--radius-xl, 2rem)' };

/**
 * Minha voz → mensagens guardadas (pedido de 19/10/2026): as frases que a
 * pessoa gravou com a própria voz, para tocar com um olhar — como as frases
 * rápidas, mas na voz dela. Vão para o histórico e para o celular do cuidador
 * como qualquer frase. Daqui também se chega à tela de gravar.
 */
export const MinhaVozScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentProfile } = useAuth();
  const perfilId = currentProfile?.id ?? null;
  const armazem = useMemo(() => armazemDaVozGuardada(), []);
  const [estado, setEstado] = useState<{ fase: 'carregando' } | { fase: 'erro'; erro: string } | { fase: 'pronto'; gravacoes: GravacaoGuardada[] }>({ fase: 'carregando' });
  const [pagina, setPagina] = useState(0);
  const [tocando, setTocando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await armazem.listar();
    if (!r.ok) {
      setEstado({ fase: 'erro', erro: r.erro });
      return;
    }
    // Da mais antiga para a mais nova: a ordem em que a pessoa gravou, que é
    // a ordem em que ela vai procurar.
    setEstado({ fase: 'pronto', gravacoes: gravacoesDoPerfil(r.gravacoes, perfilId).reverse() });
  }, [armazem, perfilId]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const tocar = async (g: GravacaoGuardada) => {
    setTocando(g.id);
    setAviso(null);
    // Mensagem guardada é fala do paciente, como uma frase rápida.
    logSentence(g.texto);
    emitirFalaDoPaciente(g.texto, 'frase');
    const r = await tocarMensagemGuardada(g, armazem);
    if (r.como === 'voz_do_computador') setAviso('A gravação não abriu agora; falei a frase com a voz do computador.');
    else if (r.como === 'nada' && r.motivo !== 'substituida') setAviso('Não consegui tocar agora. A frase está escrita no cartão.');
    setTocando((t) => (t === g.id ? null : t));
  };

  const gravacoes = estado.fase === 'pronto' ? estado.gravacoes : [];
  const paginas = paginasDasMensagens(gravacoes.length);
  const atual = paginas[Math.min(pagina, paginas.length - 1)] ?? [];
  const subtitulo =
    estado.fase !== 'pronto' || gravacoes.length === 0
      ? 'Guarde frases com a sua própria voz'
      : paginas.length > 1
        ? `Página ${Math.min(pagina, paginas.length - 1) + 1} de ${paginas.length} · Olhe para tocar`
        : 'Olhe para tocar';

  return (
    <GazePageLayout showBack={true} backRoute="/comunicacao" titulo="Minha voz" subtitulo={subtitulo}>
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: '0.9rem', minHeight: 0 }}>
        {estado.fase === 'carregando' && <p role="status" style={{ margin: 0, fontSize: '1.3rem', color: 'var(--color-text-muted)' }}>Abrindo as mensagens…</p>}
        {estado.fase === 'erro' && (
          <p role="alert" style={{ margin: 0, fontSize: '1.3rem', color: 'var(--tint-warn-text)' }}>{estado.erro}</p>
        )}

        {estado.fase === 'pronto' && gravacoes.length === 0 ? (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 'clamp(1rem, 3vw, 3rem)', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4.4vh, 3rem)', fontWeight: 800, color: 'var(--color-text-base)' }}>
                Ainda não há mensagens guardadas.
              </h2>
              <p style={{ margin: 0, fontSize: 'clamp(1.15rem, 2.4vh, 1.6rem)', lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
                Enquanto você ainda fala, dá para gravar frases com a sua própria voz. Depois, é só olhar para elas para que
                toquem — na sua voz, e não na do computador.
              </p>
            </div>
            <GazeButton onClick={() => navigate('/minha-voz/gravar')} variante="primaria" aria-label="Começar a gravar" style={alvo}>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
                <Mic size={64} aria-hidden="true" />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 3.4vh, 2.4rem)', fontWeight: 800 }}>Começar a gravar</span>
              </span>
            </GazeButton>
          </div>
        ) : estado.fase === 'pronto' ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            <GazeGrid columns={3} rows={2} rolarSoSeNaoCouber>
              {atual.map((c) => {
                if (c.tipo === 'mensagem') {
                  const g = gravacoes[c.indice];
                  const ativa = tocando === g.id;
                  return (
                    <GazeButton
                      key={g.id}
                      onClick={() => void tocar(g)}
                      aria-label={`Tocar: ${g.texto}`}
                      aria-pressed={ativa}
                      style={{ ...alvo, ...(ativa ? { outline: '6px solid var(--color-accent)', outlineOffset: '-10px' } : {}) }}
                    >
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7rem', padding: '1rem', textAlign: 'center' }}>
                        <Volume2 size={44} aria-hidden="true" color={ativa ? 'var(--color-accent)' : 'var(--color-primary)'} />
                        <span
                          style={{
                            fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.2, color: 'var(--color-text-base)',
                            fontSize: g.texto.length > 60 ? 'clamp(1rem, 2vh, 1.3rem)' : 'clamp(1.3rem, 2.7vh, 1.9rem)',
                            display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}
                        >
                          {g.texto}
                        </span>
                        {ativa && <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-accent)' }}>Tocando…</span>}
                      </span>
                    </GazeButton>
                  );
                }
                if (c.tipo === 'mais') {
                  return (
                    <GazeButton
                      key="mais"
                      onClick={() => setPagina(c.proxima)}
                      aria-label={c.proxima === 0 ? 'Voltar à primeira página' : `Mais mensagens: página ${c.proxima + 1} de ${c.total}`}
                      style={{ ...alvo, border: '2px dashed var(--state-hover-border)', background: 'var(--state-active-bg)', color: 'var(--color-primary)' }}
                    >
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                        <ChevronRight size={52} aria-hidden="true" />
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800 }}>
                          {c.proxima === 0 ? 'Primeira página' : 'Mais mensagens'}
                        </span>
                        <span style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.85 }}>página {c.proxima + 1} de {c.total}</span>
                      </span>
                    </GazeButton>
                  );
                }
                return (
                  <GazeButton key="gravar" onClick={() => navigate('/minha-voz/gravar')} aria-label="Gravar frases com a minha voz" style={alvo}>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', textAlign: 'center' }}>
                      <Mic size={48} aria-hidden="true" color="var(--color-primary)" />
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.3rem, 2.7vh, 1.9rem)', fontWeight: 800, color: 'var(--color-text-base)' }}>
                        Gravar frases
                      </span>
                      <span style={{ fontSize: 'clamp(1rem, 1.8vh, 1.2rem)', fontWeight: 600, color: 'var(--color-text-muted)' }}>com a minha voz</span>
                    </span>
                  </GazeButton>
                );
              })}
            </GazeGrid>
          </div>
        ) : null}

        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {aviso && <p role="status" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--tint-warn-text)' }}>{aviso}</p>}
          {armazem.onde === 'memoria' && (
            <p style={{ margin: 0, fontSize: '1.05rem', color: 'var(--tint-warn-text)' }}>
              Neste modo de teste, as gravações ficam só até fechar o IrisFlow.
            </p>
          )}
          <p data-testid="linha-do-plano" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-text-muted)' }}>
            {linhaDoPlano(vozClonadaLiberadaPelaLicenca())}
          </p>
        </div>
      </div>
    </GazePageLayout>
  );
};
