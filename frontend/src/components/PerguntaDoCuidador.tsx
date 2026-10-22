import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useCloud } from '../cloud/CloudContext';
import { entregaDaMensagem, ouvirEntregaDaMensagem, type EntregaDaMensagem } from '../cloud/eventos';
import { falaDaPergunta, quandoFoiAPergunta, textoDaResposta, type RespostaDaPergunta } from '../cloud/perguntaDoCuidador';
import type { Message } from '../cloud/types';
import { useEmergency } from '../context/EmergencyContext';
import { avisarConteudoNovoSobOOlhar, dwellEstaSuspenso, useGaze } from '../context/GazeContext';
import { useSettings } from '../context/SettingsContext';
import { emergenciaAtiva, emergenciaPorFonte, ouvirEstadoDaEmergencia } from '../services/estadoDeEmergencia';
import { usePedidoDeSocorro } from '../services/emergencia/usePedidoDeSocorro';
import { ouvirPedido, vistoSendoDito } from '../services/emergencia/pedidoDeSocorro';
import { definirPerguntaNaTela } from '../services/perguntaNaTela';
import { falarComVozDoSistema } from '../services/voz/sistema';
import { falarDoPaciente } from '../services/voz/falaDoPaciente';
import { logSentence } from '../utils/clinicalLogger';
import { rotaMostraCursor } from '../rotasComCursor';
import { EscolhaLateral } from './ui/EscolhaLateral';

/**
 * Acima dos diálogos e avisos do app (99985 e abaixo) e ABAIXO da Emergência
 * (99990): a pergunta nunca cobre o socorro.
 */
export const Z_DA_PERGUNTA_DO_CUIDADOR = 99986;
/** Quanto tempo a resposta escolhida fica na tela antes de a pergunta fechar. */
const MOSTRAR_A_RESPOSTA_MS = 3500;
/** De quanto em quanto tempo confere o que não tem aviso (o ponto do teste de precisão, o Modo Computador). */
const INTERVALO_DA_CONFERENCIA_MS = 500;
/**
 * Quanto tempo o rastreamento precisa ficar BOM, depois de degradado, para a
 * pergunta voltar (histerese: um quadro bom entre dois ruins não a reabre, e a
 * pergunta falada de novo a cada piscar não vira um incômodo). Revisão final,
 * rodada 1, I2, 21/10/2026.
 */
export const BOM_DEPOIS_DO_DEGRADADO_MS = 4000;

/** O que aconteceu com a resposta, em palavras simples (o mesmo jeito do mapa da dor). */
function linhaDaEntrega(e: EntregaDaMensagem | null): string {
  switch (e) {
    case 'gravada': return 'A resposta foi para a conversa no celular do cuidador.';
    case 'na_fila': return 'Sem internet agora: a resposta vai para o celular do cuidador quando a conexão voltar.';
    case 'sem_nuvem': return 'Este computador não está ligado ao celular de um cuidador.';
    case 'falhou': return 'Não consegui mandar a resposta para o celular do cuidador.';
    case 'ensaio': return 'Modo apresentação: a resposta não foi enviada ao celular.';
    default: return 'Mandando a resposta para o celular do cuidador…';
  }
}

/** Pergunta curta, letra enorme; pergunta longa, menor, para caber na coluna do meio. */
function tamanhoDaPergunta(texto: string): string {
  if (texto.length <= 40) return 'clamp(2.25rem, 6.5vh, 4rem)';
  if (texto.length <= 100) return 'clamp(1.75rem, 4.8vh, 3rem)';
  return 'clamp(1.35rem, 3.6vh, 2.2rem)';
}

interface Respondida {
  pergunta: Message;
  resposta: RespostaDaPergunta;
  idDaResposta: string;
}

/**
 * A pergunta sim/não do cuidador, grande, por cima da tela (pedido de
 * 21/10/2026). O cuidador escreve no app; aqui a pergunta aparece no meio,
 * é falada pela voz do sistema (a voz do paciente não fala o que outra pessoa
 * escreveu), e o paciente responde olhando para um lado — NÃO à esquerda, SIM
 * à direita, como na tela Sim · Não —, pela coluna do olhar (`EscolhaLateral`).
 *
 * Quando aparece: só fora da emergência (a contagem, o pedido em curso, a tela
 * de socorro), da calibração (a coleta, o reajuste rápido, o teste de precisão,
 * as telas da jornada até ela, a checagem rápida da retomada) e do Modo
 * Computador, e com o rastreamento degradado (revisão final, rodada 1, I2: em
 * `degraded` o despachante só aceita a Emergência e a recuperação — as metades
 * SIM/NÃO não são recuperação, e a pergunta cobria o "Recalibre aqui", deixando
 * quem usa só o olhar sem comunicação nenhuma; ela volta depois de
 * `BOM_DEPOIS_DO_DEGRADADO_MS` de rastreamento bom). Enquanto não é seguro, a
 * pergunta espera na fila; se uma emergência começa com ela aberta, ela sai da
 * frente e volta depois, falada de novo, e a fala dela PARA ao sair (M2). A
 * Emergência fica sempre por cima. Depois de o cuidador VER o pedido de
 * socorro, a pergunta pode abrir — também na tela de socorro: é o jeito de ele
 * perguntar "está com dor?" enquanto vem (revisão de 21/10/2026, Important 1).
 *
 * Ao abrir, e ao fechar, avisa o despachante de que há conteúdo novo sob o
 * olhar: a metade em que o olhar estava parado não responde sozinha — o
 * paciente precisa olhar para o lado da resposta depois de a pergunta aparecer
 * —, e a tela de baixo, quando volta, também não.
 *
 * A pergunta não expira: mostra a hora em que foi feita e, se já passou de uma
 * hora, a fala começa por ela (revisão de 21/10/2026, Minor 4).
 *
 * A resposta sai UMA vez: a primeira escolha desliga as duas metades, e a
 * nuvem recusa uma segunda resposta para a mesma pergunta.
 */
/** A contagem da Emergência está aberta (a fonte `confirmacao`)? */
const contagemAberta = () => emergenciaPorFonte('confirmacao');

export const PerguntaDoCuidador: React.FC = () => {
  const { perguntasDoCuidador, responderPerguntaDoCuidador, fecharPerguntaDoCuidador } = useCloud();
  const { isConfirming } = useEmergency();
  const { state, reancorando, isDegraded } = useGaze();
  const { settings } = useSettings();
  const { pathname } = useLocation();
  const emEmergencia = useSyncExternalStore(ouvirEstadoDaEmergencia, emergenciaAtiva, emergenciaAtiva);
  const naContagem = useSyncExternalStore(ouvirEstadoDaEmergencia, contagemAberta, contagemAberta);
  const pedido = usePedidoDeSocorro();
  // "Seu cuidador viu o pedido às HH:MM" ainda sendo dita: a pergunta espera (M1).
  const vistoFalando = useSyncExternalStore(ouvirPedido, vistoSendoDito, vistoSendoDito);
  const horizontal = settings?.modoHorizontal === true;
  // Rastreamento degradado, com histerese: entra na hora, sai depois de alguns
  // segundos bons. Quem usa o acionador não depende do olhar para responder.
  const [degradadoRecente, setDegradadoRecente] = useState(isDegraded);
  useEffect(() => {
    if (isDegraded) {
      setDegradadoRecente(true);
      return undefined;
    }
    if (!degradadoRecente) return undefined;
    const t = setTimeout(() => setDegradadoRecente(false), BOM_DEPOIS_DO_DEGRADADO_MS);
    return () => clearTimeout(t);
  }, [isDegraded, degradadoRecente]);
  const rastreamentoDegradado = (isDegraded || degradadoRecente) && settings?.modoDeEntrada !== 'acionador';

  const [respondida, setRespondida] = useState<Respondida | null>(null);
  const respondidaRef = useRef<Respondida | null>(null);
  respondidaRef.current = respondida;
  const [entrega, setEntrega] = useState<EntregaDaMensagem | null>(null);
  /** A pergunta já respondida por esta tela: um segundo acionamento não chega à nuvem. */
  const respondendoRef = useRef<string | null>(null);

  const pendente = perguntasDoCuidador[0] ?? null;
  const mostrada = respondida?.pergunta ?? pendente;

  // O ponto do teste de precisão e o Modo Computador não avisam quando mudam:
  // conferidos de tempos em tempos, só enquanto há pergunta.
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!mostrada) {
      setOcupado(false);
      return undefined;
    }
    const conferir = () =>
      setOcupado(
        document.getElementById('accuracy-dot') !== null || (pathname === '/virtual-mouse' && dwellEstaSuspenso()),
      );
    conferir();
    const id = setInterval(conferir, INTERVALO_DA_CONFERENCIA_MS);
    return () => clearInterval(id);
  }, [mostrada, pathname]);

  // O cuidador já viu o pedido de socorro: a emergência em curso (o pedido, a
  // tela dele) não barra mais a pergunta. A contagem, sim — ali o paciente
  // decide se o socorro sai.
  // Visto, e a frase que o diz já acabou: a voz da pergunta (`cancel()`) a cortava (M1).
  const socorroVisto = pedido !== null && pedido.fase === 'visto' && !vistoFalando;
  const seguro =
    (!emEmergencia || socorroVisto) &&
    !naContagem &&
    !isConfirming &&
    !rastreamentoDegradado &&
    state !== 'calibrating' &&
    !reancorando &&
    !ocupado &&
    (pathname !== '/emergency' || socorroVisto) &&
    // A checagem rápida da retomada coleta amostras em três alvos (Minor 2).
    pathname !== '/retomada' &&
    rotaMostraCursor(pathname);
  const visivel = seguro && mostrada !== null;

  // A piscada do Sim · Não, embaixo, pausa enquanto a pergunta está à vista (Minor 3).
  useEffect(() => {
    definirPerguntaNaTela(visivel);
  }, [visivel]);
  useEffect(() => () => definirPerguntaNaTela(false), []);

  // Cada vez que uma pergunta (re)aparece: o olhar parado não responde, e ela é falada.
  const textoRef = useRef('');
  textoRef.current = mostrada ? falaDaPergunta(mostrada.text, mostrada.created_at) : '';
  const idQueApareceu = visivel && !respondida ? mostrada?.id ?? null : null;
  useEffect(() => {
    if (!idQueApareceu) return undefined;
    avisarConteudoNovoSobOOlhar();
    // A fala é desta pergunta: quando ela sai da frente (a Emergência abriu, o
    // rastreamento degradou, o cuidador a fechou), a fala PARA e solta a marca
    // prioritária — senão o "ALERTA MÉDICO" esperava atrás dela por até 120 s
    // (revisão final, rodada 1, M2). Responder não para: a voz do paciente que
    // vem a seguir já cortou esta, e o `cancel()` do sinal cortaria a dele.
    const parar = new AbortController();
    void falarComVozDoSistema(textoRef.current, { rate: 0.95, prioritaria: true, sinal: parar.signal }).catch(() => false);
    return () => {
      if (!respondidaRef.current) parar.abort();
    };
  }, [idQueApareceu]);
  // Ao sair, a tela de baixo volta sob o olhar parado: ela também não aciona
  // sozinha (a metade do Sim · Não ou do teclado logo atrás da resposta).
  const estavaVisivelRef = useRef(false);
  useEffect(() => {
    if (estavaVisivelRef.current && !visivel) avisarConteudoNovoSobOOlhar();
    estavaVisivelRef.current = visivel;
  }, [visivel]);

  // O que aconteceu com a resposta enviada.
  useEffect(
    () =>
      ouvirEntregaDaMensagem((id, e) => {
        if (respondidaRef.current?.idDaResposta === id) setEntrega(e);
      }),
    [],
  );

  // A resposta fica alguns segundos na tela; depois a pergunta fecha (e a próxima, se houver, aparece).
  useEffect(() => {
    if (!respondida) return undefined;
    const t = setTimeout(() => setRespondida(null), MOSTRAR_A_RESPOSTA_MS);
    return () => clearTimeout(t);
  }, [respondida]);

  if (!visivel || !mostrada) return null;
  const quando = quandoFoiAPergunta(mostrada.created_at);

  const responder = (r: RespostaDaPergunta) => {
    const p = pendente;
    if (!p || respondidaRef.current || respondendoRef.current === p.id) return;
    respondendoRef.current = p.id;
    const idDaResposta = responderPerguntaDoCuidador(p.id, r);
    if (!idDaResposta) return;
    // Na voz do paciente, como no Sim · Não: se nada sair em voz alta, a
    // resposta aparece em letra grande (AvisoDeFalaQueNaoSaiu).
    void falarDoPaciente(r === 'sim' ? 'Sim' : 'Não', { rate: 0.9 });
    logSentence(textoDaResposta(r, p.text));
    setEntrega(entregaDaMensagem(idDaResposta));
    setRespondida({ pergunta: p, resposta: r, idDaResposta });
  };

  const realce = (r: RespostaDaPergunta): React.CSSProperties =>
    respondida?.resposta === r ? { outline: '8px solid #ffffff', outlineOffset: '-14px', opacity: 1 } : {};
  const rotuloDoLado = (r: RespostaDaPergunta) => (
    <>
      {r === 'sim' ? <Check size={110} strokeWidth={2.5} aria-hidden="true" /> : <X size={110} strokeWidth={2.5} aria-hidden="true" />}
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 9vh, 6rem)', fontWeight: 900 }}>
        {r === 'sim' ? 'SIM' : 'NÃO'}
      </span>
    </>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pergunta-do-cuidador-texto"
      data-testid="pergunta-do-cuidador"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        // No modo só horizontal a faixa da Emergência fica livre, à direita
        // (na tela de socorro ela não aparece: a largura toda).
        right: horizontal && pathname !== '/emergency' ? 'var(--faixa-da-emergencia-largura)' : 0,
        zIndex: Z_DA_PERGUNTA_DO_CUIDADOR,
        background: 'rgba(6, 10, 20, 0.97)',
        color: '#ffffff',
        boxSizing: 'border-box',
        // Fora do modo horizontal, o botão de Emergência do topo fica acima das metades.
        padding: horizontal
          ? 'clamp(1rem, 3vh, 2rem) var(--emergencia-folga, 28px) clamp(1rem, 3vh, 2rem) clamp(1rem, 2vw, 2rem)'
          : 'var(--reserva-emergencia-y, 140px) clamp(1rem, 2vw, 2rem) clamp(1rem, 3vh, 2rem)',
        display: 'flex',
        fontFamily: 'var(--font-body)',
      }}
    >
      <EscolhaLateral
        larguraDoMeio={34}
        esquerda={{
          nome: 'Responder NÃO',
          rotulo: rotuloDoLado('nao'),
          aoEscolher: () => responder('nao'),
          desligado: respondida !== null,
          estilo: { background: '#B42318', color: '#ffffff', border: 'none', ...realce('nao') },
        }}
        direita={{
          nome: 'Responder SIM',
          rotulo: rotuloDoLado('sim'),
          aoEscolher: () => responder('sim'),
          desligado: respondida !== null,
          estilo: { background: '#067647', color: '#ffffff', border: 'none', ...realce('sim') },
        }}
        centro={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(0.75rem, 2.5vh, 1.5rem)', width: '100%' }}>
            <span style={{ fontSize: 'clamp(0.95rem, 2.3vh, 1.25rem)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>
              {quando ? `Pergunta do cuidador, ${quando}` : 'Pergunta do cuidador'}
            </span>
            <h1
              id="pergunta-do-cuidador-texto"
              style={{ margin: 0, fontSize: tamanhoDaPergunta(mostrada.text), fontWeight: 800, lineHeight: 1.2, wordBreak: 'break-word' }}
            >
              {mostrada.text}
            </h1>
            {respondida ? (
              <div role="status" aria-live="assertive" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ margin: 0, fontSize: 'clamp(1.6rem, 4.5vh, 2.6rem)', fontWeight: 900, color: respondida.resposta === 'sim' ? '#4ADE80' : '#F87171' }}>
                  {respondida.resposta === 'sim' ? 'Você respondeu SIM.' : 'Você respondeu NÃO.'}
                </p>
                <p style={{ margin: 0, fontSize: 'clamp(1rem, 2.6vh, 1.4rem)', fontWeight: 600, lineHeight: 1.35, opacity: 0.9 }}>
                  {linhaDaEntrega(entrega)}
                </p>
              </div>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 'clamp(1.15rem, 3vh, 1.7rem)', fontWeight: 700, lineHeight: 1.35 }}>
                  Olhe para a esquerda para NÃO, ou para a direita para SIM.
                </p>
                {/* Do cuidador, ao lado do computador: o olhar não fecha a
                    pergunta (`data-no-dwell`, e a varredura do acionador também
                    pula), só o mouse e o teclado. */}
                <button
                  type="button"
                  data-no-dwell="true"
                  onClick={() => fecharPerguntaDoCuidador(mostrada.id)}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '1rem',
                    border: '2px solid rgba(255,255,255,0.55)',
                    background: 'transparent',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Fechar sem responder (cuidador)
                </button>
              </>
            )}
          </div>
        }
      />
    </div>
  );
};
