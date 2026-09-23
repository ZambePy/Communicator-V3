import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, X, Volume2, Keyboard, MessageSquare, Cloud, CloudOff, LogIn, Sparkles } from 'lucide-react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { GazeButton } from '../../components/ui/GazeButton';
import { EstadoVazio } from '../../components/ui/EstadoDaTela';
import { useCloud } from '../../cloud/CloudContext';
import { emitirFalaDoPaciente } from '../../cloud/eventos';
import { falar } from '../../services/voz';
import {
  registrarFalaDoPaciente,
  sugerirFrases,
  ultimaPerguntaDoCuidador,
} from '../../services/assistente';
import type { Message } from '../../cloud/types';
import { DicaContextual } from '../../components/ui/DicaContextual';
import { FaixaDeMissao } from '../../components/FaixaDeMissao';
import { cumprirMissao } from '../tutorial/missao';

/**
 * Conversa com o cuidador — o outro lado da aba "Conversa" do app mobile.
 *
 * O que o cuidador escreve no celular chega aqui (e é falado em voz alta ao
 * chegar, em qualquer tela). O que o paciente responde vai para o celular:
 * Sim/Não, uma frase rápida ou texto livre pelo teclado. Tudo passa pelo
 * barramento `cloud/eventos.ts`; esta tela não conhece o Supabase.
 */

const RESPOSTAS_PADRAO = ['Estou bem', 'Preciso de ajuda', 'Obrigado', 'Depois', 'Estou com sede', 'Quero descansar'];

const hora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const ConversationScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cloud = useCloud();
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cloud.vinculo) void cloud.carregarConversa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.vinculo?.device_id]);

  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cloud.mensagens.length]);

  const respostasRapidas = useMemo(() => {
    const remotas = cloud.frasesRemotas.map((f) => f.text).filter(Boolean);
    return (remotas.length ? remotas : RESPOSTAS_PADRAO).slice(0, 6);
  }, [cloud.frasesRemotas]);

  /**
   * A pergunta que ainda está no ar. Some assim que o paciente responde — o
   * assistente não deve continuar oferecendo "Sim, por favor" para uma pergunta
   * que já foi respondida.
   */
  const perguntaNoAr = useMemo(() => ultimaPerguntaDoCuidador(cloud.mensagens), [cloud.mensagens]);

  /**
   * Seis alvos, uma decisão de prioridade: enquanto há pergunta no ar, as
   * sugestões do assistente ocupam a frente e as frases rápidas completam o
   * resto. Sem pergunta, valem as frases que o cuidador cadastrou — elas são
   * escolha humana e ganham de qualquer heurística.
   */
  const respostas = useMemo(() => {
    const sugeridas = perguntaNoAr
      ? sugerirFrases({ mensagemDoCuidador: perguntaNoAr, maximo: 4 }).map((s) => s.texto)
      : [];
    const vistas = new Set(sugeridas.map((t) => t.toLowerCase()));
    const complemento = respostasRapidas.filter((r) => !vistas.has(r.toLowerCase()));
    return {
      itens: [...sugeridas, ...complemento].slice(0, 6),
      sugeridas: new Set(sugeridas),
    };
  }, [perguntaNoAr, respostasRapidas]);

  const responder = (texto: string, kind: Message['kind']) => {
    emitirFalaDoPaciente(texto, kind);
    // Resposta do paciente: sai na voz dele (clonada) quando houver.
    void falar(texto, { rate: 1 }).catch((e) => console.warn('[voz] falha ao falar:', e));
    // O assistente aprende PARA QUE pergunta esta resposta serviu — é o que faz
    // a décima vez custar uma fixação em vez de uma frase inteira.
    registrarFalaDoPaciente(texto, perguntaNoAr);
    // Missão do tutorial, quando houver uma: o que ele pediu foi RESPONDER, e
    // é aqui que a resposta sai. Silenciosa fora do tutorial.
    cumprirMissao('conversa');
  };

  const nomeDoCuidador = 'cuidador';
  const ultimas = cloud.mensagens.slice(-12);

  if (!cloud.configurada || !cloud.vinculo) {
    return (
      <GazePageLayout showBack backRoute="/menu" titulo="Conversa com o cuidador">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 'var(--space-5)', textAlign: 'center' }}>
          {/* Também aqui: sem conta ligada a conversa não roda, e quem chegou
              pelo tutorial precisa de um caminho de volta que não seja
              adivinhar. O passo não é obrigatório — ninguém fica preso. */}
          <FaixaDeMissao missao="conversa" instrucao={t('tutorial.conversa.missao')} />
          <span aria-hidden="true" className="estado-da-tela__icone" style={{ width: '6rem', height: '6rem' }}>
            <CloudOff size={44} />
          </span>
          <h2 className="t-display" style={{ margin: 0, color: 'var(--color-text-base)' }}>Sem conta ligada</h2>
          <p className="t-body-lg" style={{ maxWidth: '56ch', margin: 0, color: 'var(--color-text-muted)' }}>
            {cloud.configurada
              ? 'Este computador ainda não está ligado a uma conta IrisFlow. Entre com o e-mail e a senha da assinatura para receber e responder mensagens do celular do cuidador.'
              : 'A conversa com o celular do cuidador precisa da conta IrisFlow configurada neste computador (frontend/.env.local). Sem ela, o aplicativo funciona só localmente.'}
          </p>
          {cloud.configurada && (
            <GazeButton onClick={() => navigate('/login')} variante="primaria" width={360} height={200} isolado style={{ borderRadius: 'var(--radius-lg)' }}>
              <LogIn size={30} aria-hidden="true" /> <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>Entrar com a conta</span>
            </GazeButton>
          )}
        </div>
      </GazePageLayout>
    );
  }

  return (
    <GazePageLayout
      showBack
      backRoute="/menu"
      titulo={`Conversa com o ${nomeDoCuidador}`}
      subtitulo={`${cloud.vinculo.beneficiary_name} · ${cloud.online ? (cloud.realtime === 'conectado' ? 'ao vivo' : 'sincronizando') : 'sem internet — as respostas ficam na fila'}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: '1rem', boxSizing: 'border-box' }}>
        <FaixaDeMissao missao="conversa" instrucao={t('tutorial.conversa.missao')} />
        <DicaContextual id="conversa" />
        <div
          aria-live="polite"
          data-no-dwell="true"
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.9rem',
            borderRadius: 'var(--radius-pill)',
            background: cloud.online ? 'var(--tint-ok-bg)' : 'var(--tint-warn-bg)',
            border: `1px solid ${cloud.online ? 'var(--tint-ok-border)' : 'var(--tint-warn-border)'}`,
            color: cloud.online ? 'var(--tint-ok-text)' : 'var(--tint-warn-text)',
            fontSize: '0.9rem',
            fontWeight: 700,
          }}
        >
          {cloud.online ? <Cloud size={18} aria-hidden="true" /> : <CloudOff size={18} aria-hidden="true" />}
          {cloud.filaPendente > 0 ? `${cloud.filaPendente} na fila` : cloud.online ? 'conectado' : 'offline'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: '1.5rem', flex: 1, minHeight: 0 }}>
          {/* mensagens */}
          <div
            ref={listaRef}
            role="log"
            aria-label="Mensagens"
            style={{
              overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem',
              padding: '1rem', borderRadius: 'var(--radius-lg)',
              background: 'var(--color-card-bg)',
              border: '1px solid var(--color-card-border)',
              boxShadow: 'var(--shadow-1)',
            }}
          >
            {ultimas.length === 0 && (
              <EstadoVazio
                titulo="Nenhuma mensagem ainda"
                texto="Quando o cuidador escrever no celular, a mensagem aparece aqui e é falada em voz alta."
                icone={<MessageSquare size={30} aria-hidden="true" />}
                style={{ margin: 'auto', border: 'none' }}
              />
            )}
            {ultimas.map((m) => {
              const doCuidador = m.sender === 'cuidador';
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: doCuidador ? 'flex-start' : 'flex-end' }}>
                  <div
                    style={{
                      maxWidth: '85%', padding: '0.9rem 1.2rem', borderRadius: 'var(--radius-md)',
                      background: doCuidador ? 'var(--color-primary-fill)' : 'var(--tint-ok-bg)',
                      color: doCuidador ? 'var(--color-primary-contrast)' : 'var(--color-text-base)',
                      border: doCuidador ? 'none' : '2px solid var(--tint-ok-border)',
                      fontSize: m.kind === 'simnao' ? '1.8rem' : '1.35rem', fontWeight: m.kind === 'simnao' ? 900 : 600, lineHeight: 1.35,
                    }}
                  >
                    {m.text}
                    <div style={{ fontSize: '0.85rem', opacity: 0.75, marginTop: '0.3rem', fontWeight: 500 }}>
                      {doCuidador ? nomeDoCuidador : 'você'} · {hora(m.created_at)}{doCuidador && !m.spoken ? ' · nova' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* respostas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <GazeGrid columns={2} rows={2} gap={16}>
                <GazeButton onClick={() => responder('Sim', 'simnao')} style={{ height: '100%', background: '#16a34a', color: '#fff', border: '3px solid #15803d', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Check size={56} /> <span style={{ fontSize: '2rem', fontWeight: 900 }}>Sim</span>
                  </div>
                </GazeButton>
                <GazeButton onClick={() => responder('Não', 'simnao')} style={{ height: '100%', background: '#dc2626', color: '#fff', border: '3px solid #991b1b', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <X size={56} /> <span style={{ fontSize: '2rem', fontWeight: 900 }}>Não</span>
                  </div>
                </GazeButton>
                <GazeButton onClick={() => cloud.repetirUltimaMensagem()} style={{ height: '100%', borderRadius: '1.5rem' }} aria-label="Repetir a última mensagem em voz alta">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Volume2 size={48} color="var(--color-primary)" aria-hidden="true" /> <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>Repetir</span>
                  </div>
                </GazeButton>
                <GazeButton onClick={() => navigate('/keyboard')} style={{ height: '100%', borderRadius: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <Keyboard size={48} color="var(--color-primary)" aria-hidden="true" /> <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>Escrever</span>
                  </div>
                </GazeButton>
              </GazeGrid>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <GazeGrid columns={3} rows={2} gap={12}>
                {respostas.itens.map((r) => {
                  const sugerida = respostas.sugeridas.has(r);
                  return (
                    <GazeButton
                      key={r}
                      onClick={() => responder(r, 'frase')}
                      style={{
                        height: '100%',
                        borderRadius: '1.25rem',
                        // A sugestão do assistente se distingue por um contorno
                        // âmbar, não por cor de fundo: o paciente precisa saber
                        // de onde veio a frase sem que o alvo mude de peso visual.
                        ...(sugerida ? { border: '3px solid var(--color-accent)' } : {}),
                      }}
                    >
                      <span style={{ fontSize: '1.15rem', fontWeight: 700, padding: '0 0.5rem', textAlign: 'center' }}>
                        {sugerida ? (
                          <Sparkles size={18} color="var(--color-accent)" style={{ verticalAlign: '-3px', marginRight: 6 }} />
                        ) : (
                          <MessageSquare size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />
                        )}
                        {r}
                      </span>
                    </GazeButton>
                  );
                })}
              </GazeGrid>
            </div>
          </div>
        </div>
      </div>
    </GazePageLayout>
  );
};
