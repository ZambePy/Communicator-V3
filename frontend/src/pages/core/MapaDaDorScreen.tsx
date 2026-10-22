import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, ArrowLeft, ArrowRight, Check, MapPin, RotateCcw, SlidersHorizontal, Volume2 } from 'lucide-react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeGrid } from '../../components/ui/GazeGrid';
import { GazeButton } from '../../components/ui/GazeButton';
import { alvoMinimoPx } from '../../design/gazeMetrics';
import { useEmergency } from '../../context/EmergencyContext';
import { useSettings } from '../../context/SettingsContext';
import {
  emitirFalaDoPaciente, emitirPedidoDeAjuda, entregaDaMensagem, entregaDoPedido, ouvirEntrega, ouvirEntregaDaMensagem,
  TEXTO_DO_LIMITE_DE_CHAMADOS, type EntregaDaMensagem, type EntregaDoPedido,
} from '../../cloud/eventos';
import { novoIdDePedido } from '../../cloud/desktopSync';
import { falar } from '../../services/voz';
import { logDor, logSentence, type ResultadoDoRegistro } from '../../utils/clinicalLogger';
import { SilhuetaDoCorpo } from './dor/SilhuetaDoCorpo';
import { modoHospitalEmVigor } from './hospital/modoHospitalEmVigor';
import {
  FAIXAS, GRUPOS, OPCOES_DO_INICIO, PARTES, avisaOCelular, buscaDoPasso, codigoDoLocal, colunasDasFaixas, faixaDoNivel,
  fraseDaDor, intervaloDaFaixa, lerPasso, niveisDaFaixa, nomeDoLocal, ofereceEmergencia, opcoesDoGrupo,
  passoAnterior, passoDepoisDaFaixa, type FaixaDeDor, type IdDoGrupo, type LocalDaDor, type PassoDaDor,
} from './dor/regioesDoCorpo';

/** Espaço entre os alvos (o padrão da `GazeGrid`: 1,5° na geometria de referência). */
const ESPACO = 59;

const rotuloGrande: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(1.35rem, 2.8vh, 2.05rem)',
  fontWeight: 800,
  lineHeight: 1.15,
  color: 'var(--color-text-base)',
  textAlign: 'center',
};
const rotuloMenor: React.CSSProperties = {
  fontSize: 'clamp(1rem, 1.9vh, 1.3rem)',
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textAlign: 'center',
};
const alvo: React.CSSProperties = { height: '100%', width: '100%', borderRadius: 'var(--radius-xl, 2rem)' };
const pilha: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.7rem', padding: '0.75rem', width: '100%',
};

/**
 * Dez segmentos, os do nível acesos: a QUANTIDADE se lê sem depender da cor
 * (daltonismo, filtro âmbar, tela desbotada). Sempre junto do número e da
 * palavra.
 */
const BarraDeNivel: React.FC<{ nivel: number; cor: string; alta?: boolean }> = ({ nivel, cor, alta }) => (
  <span aria-hidden="true" style={{ display: 'flex', gap: 4, width: 'min(100%, 15rem)' }}>
    {Array.from({ length: 10 }, (_, i) => (
      <span
        key={i}
        style={{
          flex: 1,
          height: alta ? 'clamp(16px, 3vh, 30px)' : 'clamp(10px, 1.4vh, 16px)',
          borderRadius: 4,
          background: i < nivel ? cor : 'rgba(159, 176, 200, 0.22)',
          border: i < nivel ? 'none' : '1px solid rgba(159, 176, 200, 0.35)',
        }}
      />
    ))}
  </span>
);

/** Número em destaque, dentro de um selo da cor da faixa (texto escuro: contraste alto nos tons claros). */
const SeloDoNumero: React.FC<{ texto: string; cor: string; tamanho?: 'normal' | 'medio' | 'grande' }> = ({ texto, cor, tamanho = 'normal' }) => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: tamanho === 'grande' ? 'clamp(5.5rem, 13vh, 9rem)' : tamanho === 'medio' ? 'clamp(4.5rem, 11vh, 7.5rem)' : 'clamp(4rem, 9vh, 6.5rem)',
      maxWidth: '100%',
      padding: '0.2rem 0.9rem',
      boxSizing: 'border-box',
      borderRadius: '1.25rem',
      background: cor,
      color: '#0B1B33',
      fontFamily: 'var(--font-display)',
      fontWeight: 900,
      fontSize: tamanho === 'grande' ? 'clamp(3.2rem, 10vh, 6rem)' : tamanho === 'medio' ? 'clamp(2.4rem, 7.5vh, 4.4rem)' : 'clamp(2rem, 5.5vh, 3.4rem)',
      lineHeight: 1.1,
      whiteSpace: 'nowrap',
    }}
  >
    {texto}
  </span>
);

const Silhueta: React.FC<{ local: LocalDaDor | readonly LocalDaDor[]; vista?: 'frente' | 'costas'; cor?: string; altura?: string }> = ({
  local, vista, cor, altura = 'clamp(64px, 12.5vh, 150px)',
}) => {
  const primeiro = ehLista(local) ? local[0] : local;
  return <SilhuetaDoCorpo vista={vista ?? PARTES[primeiro.parte].vista} destaque={local} cor={cor} altura={altura} />;
};

const ehLista = (l: LocalDaDor | readonly LocalDaDor[]): l is readonly LocalDaDor[] => Array.isArray(l);

/** Largura disponível para a grade (para decidir 5 faixas numa linha ou 3 + 2). */
function useLarguraDe(ref: React.RefObject<HTMLElement | null>): number {
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return largura;
}

type EstadoDaFala = 'falando' | 'falou' | 'nao_falou';

interface Relato {
  local: LocalDaDor;
  nivel: number;
  frase: string;
  historico: ResultadoDoRegistro;
  /** Do nível 7 em diante a frase também vai como pedido de ajuda (o aviso que toca no celular). */
  comAviso: boolean;
}

/** Os ids do relato em curso: as respostas da nuvem chegam por eles. */
interface IdsDoEnvio {
  frase: string | null;
  aviso: string | null;
}

/** Um aviso no console por motivo — nunca um por relato repetido. */
const avisados = new Set<string>();
function avisarUmaVez(motivo: string, erro?: unknown): void {
  if (avisados.has(motivo)) return;
  avisados.add(motivo);
  console.warn(`[dor] ${motivo}`, erro ?? '');
}

/**
 * Mapa da dor (pedido de 19/10/2026): a pessoa mostra ONDE dói e QUANTO, só
 * com o olhar, e o computador fala a frase, manda ao cuidador como fala do
 * paciente e anota no histórico clínico. O vocabulário, a frase e a ordem dos
 * passos estão em `dor/regioesDoCorpo.ts`.
 *
 * O que a tela diz sobre o celular vem do envio de verdade (revisão de UX de
 * 20/10/2026, achado 3): antes era deduzido do vínculo e da internet ("Mandei
 * para o celular do cuidador"), e a frase só entra na conversa, sem push. Do
 * nível 7 em diante ela vai também como pedido de ajuda, que toca no celular —
 * como o "Chamar atenção" da tela Sim · Não.
 */
export const MapaDaDorScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [busca] = useSearchParams();
  const passo = lerPasso(busca);
  const { iniciarContagemDeEmergencia } = useEmergency();
  const { settings } = useSettings();

  const [relato, setRelato] = useState<Relato | null>(null);
  const [fala, setFala] = useState<EstadoDaFala>('falando');
  const turnoDaFala = useRef(0);
  const [entregaDaFrase, setEntregaDaFrase] = useState<EntregaDaMensagem | null>(null);
  const [entregaDoAviso, setEntregaDoAviso] = useState<EntregaDoPedido | null>(null);
  const idsRef = useRef<IdsDoEnvio>({ frase: null, aviso: null });

  // O que a nuvem responde sobre a frase e o aviso do relato em curso.
  useEffect(() => ouvirEntregaDaMensagem((id, entrega) => {
    if (idsRef.current.frase === id) setEntregaDaFrase(entrega);
  }), []);
  useEffect(() => ouvirEntrega((id, entrega) => {
    if (idsRef.current.aviso === id) setEntregaDoAviso(entrega);
  }), []);

  // Qualquer passo novo (inclusive o "Voltar") sai do resultado anterior.
  const chaveDoPasso = buscaDoPasso(passo);
  useEffect(() => {
    setRelato(null);
    idsRef.current = { frase: null, aviso: null };
  }, [chaveDoPasso]);

  const ir = (p: PassoDaDor) => navigate(`/dor${buscaDoPasso(p)}`);
  const anterior = passoAnterior(passo);
  // Para onde o mapa sai: a Comunicação, ou, no modo hospital (rodada 3,
  // 21/10/2026), a tela do quarto, de onde a dor foi aberta.
  const saida = modoHospitalEmVigor(settings) ? '/hospital' : '/comunicacao';
  // Depois de falar, "Voltar" sai do mapa: voltar ao número já dito
  // convidaria a mandar a mesma dor duas vezes.
  const voltarPara = relato || !anterior ? saida : `/dor${buscaDoPasso(anterior)}`;

  const falarFrase = (frase: string) => {
    const meu = ++turnoDaFala.current;
    setFala('falando');
    void falar(frase, { rate: 0.9 })
      .then((r) => {
        if (turnoDaFala.current !== meu) return;
        if (r.origem === 'nenhuma') {
          avisarUmaVez(`a frase não saiu em voz alta (${r.motivo ?? 'sem voz'})`);
          setFala('nao_falou');
        } else {
          setFala('falou');
        }
      })
      .catch((e) => {
        if (turnoDaFala.current !== meu) return;
        avisarUmaVez('falha ao falar a frase da dor', e);
        setFala('nao_falou');
      });
  };

  const anunciar = (local: LocalDaDor, nivel: number) => {
    const frase = fraseDaDor(local, nivel);
    const historico = logDor({ local: codigoDoLocal(local), lugar: nomeDoLocal(local), nivel, frase });
    if (historico === 'falhou') avisarUmaVez('o relato de dor não pôde ser gravado no histórico');
    // A frase também entra no histórico de frases: foi dita, como as outras.
    logSentence(frase);
    const comAviso = avisaOCelular(nivel);
    const idDaFrase = novoIdDePedido();
    const idDoAviso = comAviso ? novoIdDePedido() : null;
    // Os ids antes do envio: o barramento pode responder na hora (sem nuvem,
    // modo apresentação), dentro do próprio `emitir`.
    idsRef.current = { frase: idDaFrase, aviso: idDoAviso };
    setEntregaDaFrase(null);
    setEntregaDoAviso(null);
    // Para a conversa no celular do cuidador, como fala do paciente — pelo
    // barramento, que é quem decide se e como sai (modo apresentação, sem
    // vínculo, fila).
    emitirFalaDoPaciente(frase, 'frase', idDaFrase);
    // Dor forte: também como pedido de ajuda, o tipo que tem push e toca no
    // app do cuidador. A frase sozinha só aparece quando ele abrir o app.
    if (idDoAviso) emitirPedidoDeAjuda('ajuda', frase, idDoAviso);
    const jaDaFrase = entregaDaMensagem(idDaFrase);
    if (jaDaFrase) setEntregaDaFrase(jaDaFrase);
    const jaDoAviso = idDoAviso ? entregaDoPedido(idDoAviso) : null;
    if (jaDoAviso) setEntregaDoAviso(jaDoAviso);
    setRelato({ local, nivel, frase, historico, comAviso });
    falarFrase(frase);
  };

  const subtitulo = (() => {
    if (relato) return 'Dor informada';
    switch (passo.passo) {
      case 'onde': return 'Olhe para o lugar que dói';
      case 'qual': return 'Esquerdo e direito do SEU corpo';
      case 'quanto': return `${nomeDoLocal(passo.local)} · Quanto dói?`;
      case 'numero': return `${nomeDoLocal(passo.local)} · ${passo.faixa.rotulo}: qual número?`;
      case 'confirmar': return 'Confira antes de falar';
    }
  })();

  return (
    <GazePageLayout showBack={true} backRoute={voltarPara} titulo="Onde dói" subtitulo={subtitulo}>
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        {relato ? (
          <ResultadoDoRelato
            relato={relato}
            fala={fala}
            entregaDaFrase={entregaDaFrase}
            entregaDoAviso={entregaDoAviso}
            aoFalarDeNovo={() => falarFrase(relato.frase)}
            aoOutraDor={() => ir({ passo: 'onde' })}
            aoPronto={() => navigate(saida)}
            aoChamarAjuda={() =>
              iniciarContagemDeEmergencia({
                tipo: 'pain',
                rotulo: `${t('emergency.items.pain')} — ${nomeDoLocal(relato.local).toLowerCase()}, ${relato.nivel} de 10`,
              })
            }
          />
        ) : passo.passo === 'onde' ? (
          <PassoOnde aoEscolherLocal={(local) => ir({ passo: 'quanto', local })} aoEscolherGrupo={(grupo) => ir({ passo: 'qual', grupo })} />
        ) : passo.passo === 'qual' ? (
          <PassoQual grupo={passo.grupo} aoEscolher={(local) => ir({ passo: 'quanto', local })} />
        ) : passo.passo === 'quanto' ? (
          <PassoQuanto aoEscolher={(faixa) => ir(passoDepoisDaFaixa(passo.local, faixa))} />
        ) : passo.passo === 'numero' ? (
          <PassoNumero faixa={passo.faixa} aoEscolher={(nivel) => ir({ passo: 'confirmar', local: passo.local, nivel })} />
        ) : (
          <PassoConfirmar
            local={passo.local}
            nivel={passo.nivel}
            aoFalar={() => anunciar(passo.local, passo.nivel)}
            aoMudarNivel={() => ir({ passo: 'quanto', local: passo.local })}
            aoMudarLugar={() => ir({ passo: 'onde' })}
          />
        )}
      </div>
    </GazePageLayout>
  );
};

// ── Passos ──────────────────────────────────────────────────────────────────

const PassoOnde: React.FC<{ aoEscolherLocal: (l: LocalDaDor) => void; aoEscolherGrupo: (g: IdDoGrupo) => void }> = ({
  aoEscolherLocal, aoEscolherGrupo,
}) => (
  <div style={{ flex: 1, minHeight: 0 }}>
    <GazeGrid columns={4} rows={2} gap={ESPACO} rolarSoSeNaoCouber>
      {OPCOES_DO_INICIO.map((o) => {
        if (o.tipo === 'local') {
          const nome = nomeDoLocal(o.local);
          return (
            <GazeButton key={codigoDoLocal(o.local)} onClick={() => aoEscolherLocal(o.local)} aria-label={nome} style={alvo}>
              <span style={pilha}>
                <Silhueta local={o.local} />
                <span style={rotuloGrande}>{nome}</span>
              </span>
            </GazeButton>
          );
        }
        const g = GRUPOS[o.grupo];
        const todos = opcoesDoGrupo(o.grupo).map((linha) => linha[1]);
        return (
          <GazeButton key={o.grupo} onClick={() => aoEscolherGrupo(o.grupo)} aria-label={`${g.titulo}: ${g.descricao}`} style={alvo}>
            <span style={pilha}>
              <Silhueta local={todos} vista="costas" />
              <span style={rotuloGrande}>{g.titulo}</span>
              <span style={rotuloMenor}>{g.descricao}</span>
            </span>
          </GazeButton>
        );
      })}
    </GazeGrid>
  </div>
);

const PassoQual: React.FC<{ grupo: IdDoGrupo; aoEscolher: (l: LocalDaDor) => void }> = ({ grupo, aoEscolher }) => (
  <>
    {/* A legenda dos lados, nas MESMAS posições das colunas. Texto, não só
        seta: "esquerdo de quem?" é a dúvida que esta tela existe para tirar. */}
    <div
      aria-hidden="true"
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(1.1rem, 2.3vh, 1.6rem)',
        color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        <ArrowLeft size={28} aria-hidden="true" /> Seu lado esquerdo
      </span>
      <span>Os dois lados</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        Seu lado direito <ArrowRight size={28} aria-hidden="true" />
      </span>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>
      <GazeGrid columns={3} rows={2} gap={ESPACO} rolarSoSeNaoCouber>
        {opcoesDoGrupo(grupo).flat().map((local) => {
          const nome = nomeDoLocal(local);
          return (
            <GazeButton key={codigoDoLocal(local)} onClick={() => aoEscolher(local)} aria-label={nome} style={alvo}>
              <span style={pilha}>
                <Silhueta local={local} vista="costas" />
                <span style={rotuloGrande}>{nome}</span>
              </span>
            </GazeButton>
          );
        })}
      </GazeGrid>
    </div>
  </>
);

const PassoQuanto: React.FC<{ aoEscolher: (f: FaixaDeDor) => void }> = ({ aoEscolher }) => {
  const ref = useRef<HTMLDivElement>(null);
  const largura = useLarguraDe(ref);
  const colunas = colunasDasFaixas(largura, alvoMinimoPx(), ESPACO);
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0 }}>
      <GazeGrid columns={colunas} rows={colunas === 5 ? 1 : 2} gap={ESPACO} rolarSoSeNaoCouber>
        {FAIXAS.map((f) => (
          <GazeButton
            key={f.id}
            onClick={() => aoEscolher(f)}
            aria-label={`${f.rotulo}: ${intervaloDaFaixa(f)}`}
            data-faixa={f.id}
            style={{ ...alvo, borderTop: `6px solid ${f.cor}` }}
          >
            <span style={{ ...pilha, gap: '1.1rem' }}>
              <SeloDoNumero texto={f.de === f.ate ? String(f.de) : `${f.de}–${f.ate}`} cor={f.cor} tamanho="medio" />
              <span style={rotuloGrande}>{f.rotulo}</span>
              <BarraDeNivel nivel={f.ate} cor={f.cor} alta />
            </span>
          </GazeButton>
        ))}
      </GazeGrid>
    </div>
  );
};

const PassoNumero: React.FC<{ faixa: FaixaDeDor; aoEscolher: (n: number) => void }> = ({ faixa, aoEscolher }) => (
  <div style={{ flex: 1, minHeight: 0 }}>
    <GazeGrid columns={3} rows={1} gap={ESPACO} rolarSoSeNaoCouber>
      {niveisDaFaixa(faixa).map((n) => (
        <GazeButton
          key={n}
          onClick={() => aoEscolher(n)}
          aria-label={`${n}, ${faixa.rotulo.toLowerCase()}`}
          style={{ ...alvo, borderTop: `6px solid ${faixa.cor}` }}
        >
          <span style={{ ...pilha, gap: '1rem' }}>
            <SeloDoNumero texto={String(n)} cor={faixa.cor} tamanho="grande" />
            <span style={rotuloGrande}>{faixa.rotulo}</span>
            <BarraDeNivel nivel={n} cor={faixa.cor} alta />
          </span>
        </GazeButton>
      ))}
    </GazeGrid>
  </div>
);

/** O que vai ser dito, grande, com o lugar aceso e o nível em número, palavra e barra. */
const CartaoDaFrase: React.FC<{ local: LocalDaDor; nivel: number }> = ({ local, nivel }) => {
  const faixa = faixaDoNivel(nivel);
  return (
    <div
      data-testid="frase-da-dor"
      style={{
        display: 'flex', alignItems: 'center', gap: 'clamp(1rem, 3vw, 2.5rem)',
        padding: 'clamp(0.75rem, 2vh, 1.5rem) clamp(1rem, 2.5vw, 2rem)',
        borderRadius: 'var(--radius-xl, 2rem)',
        background: 'var(--color-card-bg)',
        border: `2px solid ${faixa.cor}`,
        minHeight: 0,
      }}
    >
      <Silhueta local={local} cor={faixa.cor} altura="clamp(90px, 20vh, 220px)" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.15,
            fontSize: 'clamp(1.7rem, 4.6vh, 3.1rem)', color: 'var(--color-text-base)',
          }}
        >
          {fraseDaDor(local, nivel)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <SeloDoNumero texto={String(nivel)} cor={faixa.cor} />
          <span style={{ ...rotuloGrande, textAlign: 'left' }}>{faixa.rotulo}</span>
          <BarraDeNivel nivel={nivel} cor={faixa.cor} />
        </span>
      </div>
    </div>
  );
};

const PassoConfirmar: React.FC<{
  local: LocalDaDor; nivel: number; aoFalar: () => void; aoMudarNivel: () => void; aoMudarLugar: () => void;
}> = ({ local, nivel, aoFalar, aoMudarNivel, aoMudarLugar }) => (
  <>
    <CartaoDaFrase local={local} nivel={nivel} />
    <div style={{ flex: 1, minHeight: 0 }}>
      <GazeGrid columns={3} rows={1} gap={ESPACO} rolarSoSeNaoCouber>
        <GazeButton onClick={aoFalar} variante="primaria" aria-label="Falar e avisar o cuidador" style={alvo}>
          <span style={pilha}>
            <Volume2 size={56} aria-hidden="true" />
            <span style={{ ...rotuloGrande, color: 'inherit' }}>Falar e avisar</span>
          </span>
        </GazeButton>
        <GazeButton onClick={aoMudarNivel} aria-label="Mudar o nível" style={alvo}>
          <span style={pilha}>
            <SlidersHorizontal size={52} aria-hidden="true" />
            <span style={rotuloGrande}>Mudar o nível</span>
          </span>
        </GazeButton>
        <GazeButton onClick={aoMudarLugar} aria-label="Mudar o lugar" style={alvo}>
          <span style={pilha}>
            <MapPin size={52} aria-hidden="true" />
            <span style={rotuloGrande}>Mudar o lugar</span>
          </span>
        </GazeButton>
      </GazeGrid>
    </div>
  </>
);

/** `ok: null` = ainda sem resposta (nem ✓ nem !: "enviado" só depois de enviado). */
const Linha: React.FC<{ ok: boolean | null; children: React.ReactNode }> = ({ ok, children }) => (
  <li
    style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      color: ok === false ? 'var(--tint-warn-text)' : ok === null ? 'var(--color-text-muted)' : 'var(--color-text-base)',
    }}
  >
    <span aria-hidden="true" style={{ fontWeight: 900, width: '1.4rem', textAlign: 'center' }}>{ok === true ? '✓' : ok === false ? '!' : '…'}</span>
    <span>{children}</span>
  </li>
);

/**
 * A frase na conversa do cuidador (`message.send`). O servidor só grava, sem
 * push, e o app do cuidador só a mostra com o app aberto: "ele vê quando abrir
 * o app", nunca "o celular foi avisado" (revisão de UX de 20/10/2026, achado 3).
 */
function linhaDaConversa(e: EntregaDaMensagem | null): { ok: boolean | null; texto: string } {
  switch (e) {
    case 'gravada': return { ok: true, texto: 'Foi para a conversa no celular do cuidador; ele vê quando abrir o app.' };
    case 'na_fila': return { ok: false, texto: 'Sem internet agora: vai para a conversa no celular do cuidador quando a conexão voltar.' };
    case 'sem_nuvem': return { ok: false, texto: 'Este computador não está ligado ao celular de um cuidador.' };
    case 'falhou': return { ok: false, texto: 'Não consegui mandar a frase para o celular do cuidador.' };
    case 'ensaio': return { ok: false, texto: 'Modo apresentação: nada foi enviado ao celular.' };
    default: return { ok: null, texto: 'Mandando para a conversa no celular do cuidador…' };
  }
}

/** O aviso que toca no celular (o pedido de ajuda), do nível 7 em diante. */
function linhaDoAviso(e: EntregaDoPedido | null): { ok: boolean | null; texto: string } {
  switch (e) {
    case 'enviado': return { ok: true, texto: 'O celular do cuidador foi avisado.' };
    case 'na_fila': return { ok: false, texto: 'Sem internet agora: o celular do cuidador será avisado quando a internet voltar.' };
    case 'sem_push': return { ok: false, texto: 'Nenhum celular de cuidador foi avisado agora.' };
    case 'limitado': return { ok: false, texto: TEXTO_DO_LIMITE_DE_CHAMADOS };
    case 'push_incerto': return { ok: false, texto: 'Não deu para confirmar se o celular do cuidador recebeu o aviso.' };
    case 'falhou': return { ok: false, texto: 'Não deu para avisar o celular do cuidador.' };
    case 'sem_nuvem': return { ok: false, texto: 'Nenhum celular de cuidador está ligado a este computador.' };
    case 'ensaio': return { ok: false, texto: 'Modo apresentação: nada foi enviado ao celular.' };
    default: return { ok: null, texto: 'Avisando o celular do cuidador…' };
  }
}

const ResultadoDoRelato: React.FC<{
  relato: Relato;
  fala: EstadoDaFala;
  entregaDaFrase: EntregaDaMensagem | null;
  entregaDoAviso: EntregaDoPedido | null;
  aoFalarDeNovo: () => void;
  aoOutraDor: () => void;
  aoPronto: () => void;
  aoChamarAjuda: () => void;
}> = ({ relato, fala, entregaDaFrase, entregaDoAviso, aoFalarDeNovo, aoOutraDor, aoPronto, aoChamarAjuda }) => {
  const forte = ofereceEmergencia(relato.nivel);
  const conversa = linhaDaConversa(entregaDaFrase);
  const aviso = relato.comAviso ? linhaDoAviso(entregaDoAviso) : null;
  // Sem nuvem ou em apresentação, a frase e o aviso dizem a mesma coisa: uma linha basta.
  const avisoRepete = (entregaDoAviso === 'sem_nuvem' || entregaDoAviso === 'ensaio') && entregaDaFrase === entregaDoAviso;
  return (
    <>
      <CartaoDaFrase local={relato.local} nivel={relato.nivel} />
      <ul
        role="status"
        aria-live="polite"
        style={{
          listStyle: 'none', margin: 0, padding: '0 0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem 2rem',
          fontSize: 'clamp(1.05rem, 2vh, 1.35rem)', fontWeight: 700,
        }}
      >
        <Linha ok={fala !== 'nao_falou'}>
          {fala === 'falando' ? 'Falando em voz alta…' : fala === 'falou' ? 'Falei em voz alta.' : 'Não consegui falar em voz alta. A frase está escrita aqui.'}
        </Linha>
        <Linha ok={conversa.ok}>{conversa.texto}</Linha>
        {aviso && !avisoRepete && <Linha ok={aviso.ok}>{aviso.texto}</Linha>}
        {relato.historico === 'gravado' && <Linha ok>Anotado no histórico.</Linha>}
        {relato.historico === 'falhou' && <Linha ok={false}>Não consegui anotar no histórico deste computador.</Linha>}
      </ul>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GazeGrid columns={forte ? 4 : 3} rows={1} gap={ESPACO} rolarSoSeNaoCouber>
          <GazeButton onClick={aoFalarDeNovo} aria-label="Falar de novo" style={alvo}>
            <span style={pilha}>
              <RotateCcw size={52} aria-hidden="true" />
              <span style={rotuloGrande}>Falar de novo</span>
            </span>
          </GazeButton>
          <GazeButton onClick={aoOutraDor} aria-label="Outra dor" style={alvo}>
            <span style={pilha}>
              <MapPin size={52} aria-hidden="true" />
              <span style={rotuloGrande}>Outra dor</span>
            </span>
          </GazeButton>
          <GazeButton onClick={aoPronto} variante="primaria" aria-label="Pronto" style={alvo}>
            <span style={pilha}>
              <Check size={56} aria-hidden="true" />
              <span style={{ ...rotuloGrande, color: 'inherit' }}>Pronto</span>
            </span>
          </GazeButton>
          {/* A oferta de ajuda fica na ponta DIREITA: o olhar que acabou de
              escolher "Falar e avisar" está na esquerda, e o que aparece sob
              ele depois de falar é o inofensivo "Falar de novo". */}
          {forte && (
            <GazeButton
              onClick={aoChamarAjuda}
              // Nunca mais fácil de acionar que uma tecla comum, como o botão
              // de Emergência (FE-13). Abre a contagem (5 s por padrão; o
              // cuidador ajusta de 3 a 10 s) com CANCELAR.
              data-dwell-mult={1.3}
              aria-label="Chamar ajuda agora: emergência, com contagem para cancelar"
              className="emergency"
              style={alvo}
            >
              <span style={pilha}>
                <AlertOctagon size={56} aria-hidden="true" />
                <span style={{ ...rotuloGrande, color: 'inherit' }}>Chamar ajuda agora</span>
                <span style={{ ...rotuloMenor, color: 'inherit' }}>Emergência, com contagem</span>
              </span>
            </GazeButton>
          )}
        </GazeGrid>
      </div>
    </>
  );
};
