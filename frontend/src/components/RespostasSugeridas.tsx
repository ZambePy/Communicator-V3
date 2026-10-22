import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Keyboard, Sparkles } from 'lucide-react';
import { normalizar } from '@tracker/assistente';
import { GazeButton } from './ui/GazeButton';
import { GazeGrid } from './ui/GazeGrid';
import { alvoMinimoPx } from '../design/gazeMetrics';
import { emergenciaAtiva, ouvirEstadoDaEmergencia } from '../services/estadoDeEmergencia';
import { sugerirRespostas } from '../services/assistente';
import {
  estaRecolhida,
  lerAceitacao,
  registrarSugestaoAceita,
  registrarSugestaoMostrada,
} from '../services/assistente/aceitacao';
import { sugestoesPermitidas } from '../services/assistente/quandoSugerir';
import { VAO_DA_FAIXA, planejarFaixa } from './planoDaFaixaDeRespostas';

/**
 * A faixa "Respostas sugeridas": até quatro respostas curtas, em botões grandes,
 * para a pergunta que o cuidador acabou de fazer (roadmap 1, rodada 3,
 * 21/10/2026). Com um olhar o paciente escolhe uma; responder uma pergunta
 * comum leva segundos em vez de minutos de teclado.
 *
 * Cinco regras que esta faixa cumpre sozinha, para quem a reaproveitar em outra
 * tela não precisar lembrar de nenhuma:
 *
 *   1. NUNCA FALA SOZINHA. A faixa só entrega o texto por `aoEscolher`, quando o
 *      paciente aciona um botão. Falar, emitir para o celular e aprender são
 *      coisas de quem a usa, depois dessa escolha.
 *   2. CADA BOTÃO SE DIZ "sugestão". Uma resposta que apareceu sozinha na tela
 *      não pode passar por uma frase que o paciente escreveu.
 *   3. SOME EM EMERGÊNCIA E NA TELA DA DOR (`quandoSugerir.ts`), e para
 *      mensagens que têm tela própria (Sim/Não do cuidador) ou que nem são de
 *      uma pessoa (sistema). E nunca aparece para PERGUNTA de dor ("A dor
 *      passou?"): `sugerirRespostas` devolve lista vazia para elas, nem a
 *      pronta nem a aprendida — uma resposta de sentido trocado sobre dor é
 *      perigosa (decisão de 21/10/2026, rodada de correção 1 da Task 7). A
 *      faixa vazia não é desenhada, nem contada como mostrada.
 *   4. MEDE quantas são aceitas, no computador (`aceitacao.ts`).
 *   5. RECOLHE se menos de 30% foram aceitas em 20 mostradas: sugestão que
 *      quase nunca serve é ruído em alvos grandes. Uma linha avisa e um botão de
 *      mouse traz de volta — de mouse de propósito: o paciente já mostrou, em
 *      20 perguntas, que não as quer, e um alvo de olhar a mais não vale o lugar.
 */

export interface RespostasSugeridasProps {
  /** A mensagem do cuidador que está no ar. Sem ela, a faixa não existe. */
  mensagem: { id: string; text: string; kind?: string } | undefined;
  /** O paciente escolheu esta resposta. É o ÚNICO caminho que leva a falar. */
  aoEscolher: (texto: string) => void;
  /** "Nenhuma": o paciente vai escrever a resposta. */
  aoNenhuma: () => void;
  /** Respostas que a tela já tem como botão fixo (Sim e Não): não se repetem aqui. */
  jaNaTela?: readonly string[];
}

const SEM_REPETIDAS: readonly string[] = [];

export const RespostasSugeridas: React.FC<RespostasSugeridasProps> = ({
  mensagem,
  aoEscolher,
  aoNenhuma,
  jaNaTela = SEM_REPETIDAS,
}) => {
  const emergencia = useSyncExternalStore(ouvirEstadoDaEmergencia, emergenciaAtiva, emergenciaAtiva);
  const { pathname } = useLocation();
  const permitido = !!mensagem && sugestoesPermitidas({ pathname, emergencia, kind: mensagem.kind });

  const id = mensagem?.id;
  const texto = mensagem?.text;
  const repetidas = jaNaTela.join('\u0000');

  // Calculadas uma vez por mensagem: se o modelo mudar enquanto o paciente
  // olha para os botões, trocar os alvos debaixo do olhar dele seria pior que
  // qualquer sugestão melhor.
  const sugestoes = useMemo(() => {
    if (!permitido || !texto) return [];
    const fora = new Set(repetidas ? repetidas.split('\u0000').map((r) => normalizar(r)) : []);
    return sugerirRespostas(texto).filter((r) => !fora.has(normalizar(r)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitido, id, texto, repetidas]);

  // A decisão de recolher é tomada quando a mensagem chega, e não no meio dela:
  // a faixa não some debaixo do olhar porque a conta mudou.
  const recolhidaPelaTaxa = useMemo(
    () => estaRecolhida(lerAceitacao()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const [reaberta, setReaberta] = useState(false);

  const comSugestoes = permitido && sugestoes.length > 0;
  const visivel = comSugestoes && (!recolhidaPelaTaxa || reaberta);

  // A faixa mede a própria largura para saber quantos alvos de 5° cabem.
  const [caixa, setCaixa] = useState<HTMLElement | null>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    if (!caixa || typeof ResizeObserver === 'undefined') return;
    const medir = () => setLargura((l) => (l === caixa.clientWidth ? l : caixa.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caixa);
    return () => ro.disconnect();
  }, [caixa]);
  // Num navegador de verdade (há ResizeObserver) os alvos só são desenhados depois
  // de a largura ser medida. A medida roda antes da pintura, então o paciente não
  // vê nada diferente — mas sem esperar, o primeiro quadro teria cinco colunas de
  // ~120 px, abaixo do alvo mínimo, e o desenvolvedor veria seis avisos de "alvo
  // pequeno" a cada pergunta nova. No jsdom (sem layout nem ResizeObserver) o
  // plano é "tudo", como nos testes sempre foi.
  const larguraMedida = largura > 0 || typeof ResizeObserver === 'undefined';

  // "Mostrada" é a faixa com os alvos na tela: antes da medida eles não estão, e
  // contá-los puxaria a taxa de aceitação para baixo por botões que ninguém viu.
  useEffect(() => {
    if (visivel && larguraMedida && id) registrarSugestaoMostrada(id);
  }, [visivel, larguraMedida, id]);

  // A mensagem que já teve uma resposta escolhida não aceita outra: o segundo
  // clique (ou o segundo dwell antes de a tela trocar) falaria duas vezes.
  const respondidaRef = useRef<string | null>(null);
  const escolher = (resposta: string) => {
    if (!id || respondidaRef.current === id) return;
    respondidaRef.current = id;
    registrarSugestaoAceita(id);
    aoEscolher(resposta);
  };

  if (!comSugestoes) return null;

  if (!visivel) {
    return (
      <div
        role="status"
        data-testid="respostas-recolhidas"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.6rem 1rem',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-card-bg)',
          border: '1px solid var(--color-card-border)',
          color: 'var(--color-text-muted)',
          fontSize: '1rem',
          fontWeight: 600,
        }}
      >
        <span>Sugestões de resposta recolhidas: poucas foram escolhidas.</span>
        {/* Botão comum, só de mouse e teclado: `data-no-dwell` tira do olhar. */}
        <button
          type="button"
          data-no-dwell="true"
          className="btn btn--ghost"
          onClick={() => setReaberta(true)}
          style={{ minHeight: 44, padding: '0.4rem 1rem' }}
        >
          Mostrar de novo
        </button>
      </div>
    );
  }

  const piso = alvoMinimoPx();
  const plano = planejarFaixa({ largura, piso, quantidade: sugestoes.length });

  return (
    <section ref={setCaixa} aria-label="Respostas sugeridas" data-testid="respostas-sugeridas">
      <div
        data-no-dwell="true"
        style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem 0.6rem', marginBottom: '0.5rem' }}
      >
        <Sparkles size={20} color="var(--color-accent)" aria-hidden="true" />
        <strong style={{ fontSize: '1.1rem', color: 'var(--color-text-base)' }}>Sugestões de resposta</strong>
        <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>só falam se você escolher</span>
      </div>
      {/* Altura explícita, a do alvo mínimo: o `GazeGrid` tem `height: 100%`, e numa faixa
          com título esse 100% é a altura da FAIXA INTEIRA — os alvos passavam do fim
          dela pela altura do título (medido num Chromium, 21/10/2026). O espaço fica
          reservado desde o primeiro quadro, mesmo antes de os alvos serem desenhados:
          o registro de mensagens não muda de tamanho quando eles aparecem, e a pergunta
          (a última mensagem, no fim do registro) não sai da vista. */}
      <div style={{ height: piso }} data-testid="respostas-fileira">
        {larguraMedida && (
          // `rolarSoSeNaoCouber`: a zona de acerto de 12 px dos botões passa da única
          // linha, e numa grade com `overflow: auto` isso vira uma barra de rolagem
          // fantasma dentro da faixa — o mesmo que a Home e a Conversa evitam.
          <GazeGrid columns={plano.colunas} rows={1} gap={VAO_DA_FAIXA} rolarSoSeNaoCouber>
            {sugestoes.slice(0, plano.sugestoes).map((resposta) => (
              <GazeButton
                key={`sugestao:${resposta}`}
                onClick={() => escolher(resposta)}
                aria-label={`Sugestão de resposta: ${resposta}`}
                style={{
                  height: '100%',
                  borderRadius: '1.25rem',
                  // Tracejado âmbar: a sugestão se distingue pelo contorno, não
                  // pela cor de fundo — o alvo não muda de peso, e a diferença
                  // não depende de enxergar cor (o rótulo "sugestão" também está lá).
                  border: '3px dashed var(--color-accent)',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0 0.4rem',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, lineHeight: 1.2 }}>{resposta}</span>
                  <span
                    style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    sugestão
                  </span>
                </span>
              </GazeButton>
            ))}
            <GazeButton
              key="nenhuma"
              onClick={aoNenhuma}
              aria-label="Nenhuma destas, escrever a resposta"
              style={{ height: '100%', borderRadius: '1.25rem' }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                <Keyboard size={36} color="var(--color-primary)" aria-hidden="true" />
                <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>Nenhuma</span>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>escrever</span>
              </span>
            </GazeButton>
          </GazeGrid>
        )}
      </div>
    </section>
  );
};
