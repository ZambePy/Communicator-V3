import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, Bell } from 'lucide-react';
import { GazePageLayout } from '../../components/ui/GazePageLayout';
import { GazeButton } from '../../components/ui/GazeButton';
import { EscolhaLateral, type LadoDaEscolha } from '../../components/ui/EscolhaLateral';
import { zonaLateralNoX } from '../../components/ui/zonasLaterais';
import { marcarTelaLateral } from '../../services/telaLateral';
import { perguntaNaTela } from '../../services/perguntaNaTela';
import { useGaze } from '../../context/GazeContext';
import { useSettings } from '../../context/SettingsContext';
import { falarDoPaciente } from '../../services/voz/falaDoPaciente';
import {
  emitirFalaDoPaciente, emitirPedidoDeAjuda, entregaDoPedido, ouvirEntrega, TEXTO_DO_LIMITE_DE_CHAMADOS, type EntregaDoPedido,
} from '../../cloud/eventos';
import { novoIdDePedido } from '../../cloud/desktopSync';
import { logSentence } from '../../utils/clinicalLogger';
import { playTone } from '../../utils/emergencyAudio';
import type { GazeSample } from '@tracker/tracker/engine';
import { criarEstadoSimNao, passoSimNao, type EstadoSimNao, type RespostaSimNao } from '@tracker/interaction/simNaoPorPiscada';
import {
  criarGuarda, passoDaGuarda, piscadaLongaEmCurso, piscadaSuspensa, registrarResposta, respostaLiberada,
  visualDoSimNao, mesmoVisual, VISUAL_LIVRE, TRAVA_DA_RESPOSTA_MS,
  type BotaoDoSimNao, type GuardaDoSimNao, type VisualDoSimNao,
} from './guardaDoSimNao';

/** Quanto tempo a resposta escolhida fica em destaque na tela (piscada desligada; ligada, vale a trava). */
const DESTAQUE_DA_RESPOSTA_MS = 2500;
/** "Chamar atenção" não repete antes disto (um olhar que fica no botão). */
const INTERVALO_DO_CHAMADO_MS = 20_000;
/** "CHAMANDO…" enquanto o chamado toca e a voz fala "Por favor, venha aqui". */
const CHAMANDO_MS = 2500;
/** Quanto tempo fica o "você já chamou há X s" do segundo toque. */
const AVISO_DO_SEGUNDO_TOQUE_MS = 4000;

/**
 * O que aconteceu com o chamado, em palavras simples (revisão de UX de
 * 19/10/2026, achado 14). Antes era "CHAMANDO…" para tudo — também sem
 * celular ligado, sem internet ou sem push —, e o paciente não tinha como
 * saber se alguém fora do quarto tinha sido avisado.
 */
function textoDoChamado(entrega: EntregaDoPedido | null): string {
  switch (entrega) {
    case 'enviado': return 'O celular do cuidador foi avisado.';
    case 'na_fila': return 'Sem internet agora: o celular do cuidador será avisado quando a internet voltar.';
    case 'sem_nuvem': return 'Nenhum celular de cuidador está ligado a este computador. O chamado tocou só aqui.';
    case 'sem_push': return 'Nenhum celular de cuidador foi avisado. O chamado tocou só aqui.';
    case 'limitado': return TEXTO_DO_LIMITE_DE_CHAMADOS;
    case 'push_incerto': return 'O pedido chegou, mas não deu para confirmar se o celular do cuidador recebeu o aviso.';
    case 'falhou': return 'Não deu para avisar o celular do cuidador. O chamado tocou só aqui.';
    case 'ensaio': return 'Modo apresentação: nada foi enviado ao celular do cuidador.';
    default: return 'Avisando o celular do cuidador…';
  }
}

/**
 * O botão sob o olhar (para o rearme da guarda), ou `undefined` quando a
 * amostra não diz para onde a pessoa olha: olho fechado, rosto perdido,
 * posição repetida (não medida) ou sem calibração.
 *
 * No modo só horizontal (21/10/2026) vale a COLUNA, como no despachante: com o
 * `y` de quem perdeu o olhar vertical, o ponto caía fora dos botões, o olhar
 * parado no NÃO não ficava preso durante a piscada, e as duas respostas
 * voltavam a sair (o achado 4 de novo).
 */
function botaoSobOOlhar(s: GazeSample, horizontal: boolean): BotaoDoSimNao | null | undefined {
  if (!s.hasFace || s.eyeState !== 'open' || s.posicaoMedida === false || s.uncalibrated === true) return undefined;
  if (horizontal) {
    if (!Number.isFinite(s.x)) return undefined;
    const v = zonaLateralNoX(s.x)?.closest<HTMLElement>('[data-simnao]')?.dataset.simnao;
    return v === 'sim' || v === 'nao' ? v : null;
  }
  if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || typeof document.elementFromPoint !== 'function') return undefined;
  const v = document.elementFromPoint(s.x, s.y)?.closest<HTMLElement>('[data-simnao]')?.dataset.simnao;
  return v === 'sim' || v === 'nao' || v === 'chamar' ? v : null;
}

interface Chamado {
  id: string;
  /** `Date.now()` do chamado. */
  em: number;
  entrega: EntregaDoPedido | null;
}

/**
 * Tela rápida "Sim · Não · Chamar atenção" (pedido de 18/10/2026: um toque, sem
 * teclado). É o Plano B quando o olhar piora: três alvos enormes — metade da
 * tela para NÃO (esquerda) e SIM (direita), uma faixa larga para CHAMAR — que
 * funcionam com a calibração já imprecisa ("olhe para o lado do sim"), com o
 * acionador (a varredura passa pelos três) e, se o cuidador ligar em
 * Configurações, com piscada longa: uma = SIM, duas = NÃO.
 *
 * Com a piscada ligada, o olhar e a piscada respondem pelos mesmos botões, e
 * uma guarda impede que respondam um por cima do outro (revisão de UX de
 * 19/10/2026, achado 4 — ver `guardaDoSimNao.ts`): uma resposta trava a outra
 * por 3 s; a piscada longa em curso tira o dwell dos botões (o progresso
 * guardado com o olho fechado não completa ao reabrir); e o olhar que ficou
 * parado num botão durante a piscada precisa sair dele antes de responder.
 *
 * O que sai: a resposta falada (na voz do paciente, se houver), registrada no
 * histórico e enviada ao celular do cuidador como "sim/não". "Chamar atenção"
 * toca um chamado aqui, fala "Por favor, venha aqui" e manda um pedido de
 * AJUDA ao celular (não é a emergência: sem contagem e sem alarme contínuo); o
 * botão diz se o celular foi avisado.
 */
export const SimNaoScreen: React.FC = () => {
  const { subscribe } = useGaze();
  const { settings } = useSettings();
  const piscadaLigada = settings.simNaoPorPiscada;
  // No modo acionador a varredura pula botão sem dwell: lá a tela não tira o
  // dwell dos botões (ver `visualDoSimNao`), e a trava vale só pela resposta.
  const marcarDwell = settings.modoDeEntrada !== 'acionador';
  // Modo só horizontal (21/10/2026): NÃO e SIM viram as duas metades da
  // `EscolhaLateral`, escolhidas pela coluna do olhar.
  const horizontal = settings.modoHorizontal === true;
  const horizontalRef = useRef(horizontal);
  horizontalRef.current = horizontal;
  // No modo só horizontal, a saída da tela de socorro volta para cá (revisão
  // de 21/10/2026, Important 1). Na tela comum, ela vai para o menu.
  useEffect(() => {
    if (horizontal) marcarTelaLateral('/sim-nao');
  }, [horizontal]);

  const [resposta, setResposta] = useState<RespostaSimNao | null>(null);
  const limparRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Guarda da piscada (achado 4) ──────────────────────────────────────────
  // Em refs: a amostra do olhar chega a cada quadro e não pode esperar o
  // React. O estado da piscada também: reinscrever no olhar não o apaga.
  const guardaRef = useRef<GuardaDoSimNao>(criarGuarda());
  const piscadaRef = useRef<EstadoSimNao>(criarEstadoSimNao());
  const [visual, setVisual] = useState<VisualDoSimNao>(VISUAL_LIVRE);
  const visualRef = useRef<VisualDoSimNao>(VISUAL_LIVRE);
  const piscadaLigadaRef = useRef(piscadaLigada);
  piscadaLigadaRef.current = piscadaLigada;
  const marcarDwellRef = useRef(marcarDwell);
  marcarDwellRef.current = marcarDwell;
  const fimDaTravaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Saiu a pergunta do cuidador: a piscada só volta a contar com o olho visto aberto. */
  const esperandoOlhoAbertoRef = useRef(false);

  /** Recalcula o que a tela marca e mostra; só redesenha quando muda. */
  const atualizarVisual = useCallback(() => {
    const v = piscadaLigadaRef.current
      ? visualDoSimNao(guardaRef.current, piscadaRef.current, performance.now(), marcarDwellRef.current)
      : VISUAL_LIVRE;
    if (mesmoVisual(v, visualRef.current)) return;
    visualRef.current = v;
    setVisual(v);
  }, []);

  // Ligar, desligar ou mudar a duração da piscada começa do zero.
  useEffect(() => {
    guardaRef.current = criarGuarda();
    piscadaRef.current = criarEstadoSimNao();
    atualizarVisual();
  }, [piscadaLigada, settings.piscadaLongaMs, atualizarVisual]);

  // ── Chamar atenção (achado 14) ────────────────────────────────────────────
  const [chamado, setChamado] = useState<Chamado | null>(null);
  const chamadoRef = useRef<Chamado | null>(null);
  const [chamando, setChamando] = useState(false);
  /** Segundo toque dentro dos 20 s: há quantos segundos foi o chamado. */
  const [segundoToqueHaS, setSegundoToqueHaS] = useState<number | null>(null);
  const timersDoChamadoRef = useRef<Record<'chamando' | 'janela' | 'segundoToque', ReturnType<typeof setTimeout> | null>>({
    chamando: null, janela: null, segundoToque: null,
  });
  const agendarNoChamado = (qual: 'chamando' | 'janela' | 'segundoToque', fn: () => void, ms: number) => {
    const t = timersDoChamadoRef.current;
    if (t[qual]) clearTimeout(t[qual]!);
    t[qual] = setTimeout(() => { t[qual] = null; fn(); }, ms);
  };

  const atualizarChamado = (c: Chamado | null) => {
    chamadoRef.current = c;
    setChamado(c);
  };

  // O que aconteceu com o pedido de ajuda do chamado em curso.
  useEffect(() => ouvirEntrega((id, entrega) => {
    const c = chamadoRef.current;
    if (!c || c.id !== id || c.entrega === entrega) return;
    atualizarChamado({ ...c, entrega });
  }), []);

  useEffect(() => () => {
    if (limparRef.current) clearTimeout(limparRef.current);
    if (fimDaTravaRef.current) clearTimeout(fimDaTravaRef.current);
    for (const t of Object.values(timersDoChamadoRef.current)) if (t) clearTimeout(t);
  }, []);

  const mostrar = (r: RespostaSimNao) => {
    setResposta(r);
    if (limparRef.current) clearTimeout(limparRef.current);
    limparRef.current = setTimeout(() => setResposta(null), DESTAQUE_DA_RESPOSTA_MS);
  };

  const responder = (r: RespostaSimNao) => {
    if (piscadaLigada) {
      const agora = performance.now();
      // Uma resposta trava a outra: pelo olhar, pela piscada, pelo mouse,
      // pelo teclado ou pelo acionador.
      if (!respostaLiberada(guardaRef.current, agora)) return;
      guardaRef.current = registrarResposta(guardaRef.current, r, agora);
      // A resposta já veio: uma piscada que esperava a segunda não decide mais nada.
      piscadaRef.current = criarEstadoSimNao();
      if (fimDaTravaRef.current) clearTimeout(fimDaTravaRef.current);
      // O fim da trava redesenha mesmo sem amostra do olhar chegando.
      fimDaTravaRef.current = setTimeout(() => { fimDaTravaRef.current = null; atualizarVisual(); }, TRAVA_DA_RESPOSTA_MS + 20);
      atualizarVisual();
    }
    const texto = r === 'sim' ? 'Sim' : 'Não';
    mostrar(r);
    // Pela fala do paciente: se nada sair em voz alta, a resposta aparece em
    // letra grande na tela (AvisoDeFalaQueNaoSaiu), em vez de sumir.
    void falarDoPaciente(texto, { rate: 0.9 });
    logSentence(texto);
    emitirFalaDoPaciente(texto, 'simnao');
  };

  const chamar = () => {
    const agora = Date.now();
    const anterior = chamadoRef.current;
    if (anterior && agora - anterior.em < INTERVALO_DO_CHAMADO_MS) {
      // Dentro dos 20 s não sai outro pedido (um olhar que fica no botão não
      // pode inundar o celular), e o botão diz há quanto tempo foi o chamado,
      // em vez de um "CHAMANDO…" que não fazia nada.
      setSegundoToqueHaS(Math.max(1, Math.round((agora - anterior.em) / 1000)));
      agendarNoChamado('segundoToque', () => setSegundoToqueHaS(null), AVISO_DO_SEGUNDO_TOQUE_MS);
      return;
    }
    const c: Chamado = { id: novoIdDePedido(), em: agora, entrega: null };
    atualizarChamado(c);
    setSegundoToqueHaS(null);
    setChamando(true);
    agendarNoChamado('chamando', () => setChamando(false), CHAMANDO_MS);
    agendarNoChamado('janela', () => {
      if (chamadoRef.current?.id !== c.id) return;
      atualizarChamado(null);
      setSegundoToqueHaS(null);
    }, INTERVALO_DO_CHAMADO_MS);
    // Chamado de três notas, alto o bastante para o cômodo ao lado.
    playTone(660, 0, 0.25, 0.5);
    playTone(880, 0.3, 0.25, 0.5);
    playTone(1100, 0.6, 0.4, 0.5);
    setTimeout(() => {
      void falarDoPaciente('Por favor, venha aqui.', { rate: 0.9 });
    }, 1100);
    emitirPedidoDeAjuda('ajuda', 'Está chamando você (tela Sim · Não)', c.id);
    // O barramento pode ter respondido na hora (sem nuvem, modo apresentação).
    const ja = entregaDoPedido(c.id);
    const atual = chamadoRef.current;
    if (ja && atual?.id === c.id && atual.entrega !== ja) atualizarChamado({ ...atual, entrega: ja });
  };

  // Piscada longa: uma = SIM, duas = NÃO (só se o cuidador ligou).
  const responderRef = useRef(responder);
  responderRef.current = responder;
  const piscadaLongaMs = settings.piscadaLongaMs;
  useEffect(() => {
    if (!piscadaLigada) return;
    return subscribe((s) => {
      // A pergunta do cuidador por cima (revisão de 21/10/2026, Minor 3): a
      // piscada não responde o Sim · Não de baixo — uma piscada longa sob a
      // pergunta virava um "Sim" solto aqui. A piscada recomeça do zero.
      const fechado = !s.hasFace ? null : s.eyeState === 'closed' ? true : s.eyeState === 'open' ? false : null;
      if (perguntaNaTela() || (esperandoOlhoAbertoRef.current && fechado !== false)) {
        // E, depois dela, só com o olho visto ABERTO: uma piscada começada sob
        // a pergunta não termina como resposta aqui.
        esperandoOlhoAbertoRef.current = true;
        piscadaRef.current = criarEstadoSimNao();
        return;
      }
      esperandoOlhoAbertoRef.current = false;
      const agora = performance.now();
      let respostaDaPiscada: RespostaSimNao | null = null;
      if (piscadaSuspensa(guardaRef.current, agora)) {
        // Trava em curso (ou o olho fechou nela e ainda não reabriu): esta
        // amostra não vira piscada.
        piscadaRef.current = criarEstadoSimNao();
      } else {
        const r = passoSimNao(piscadaRef.current, { fechado, nowMs: agora }, piscadaLongaMs);
        piscadaRef.current = r.estado;
        respostaDaPiscada = r.resposta;
      }
      guardaRef.current = passoDaGuarda(guardaRef.current, {
        agoraMs: agora,
        fechado,
        piscadaEmCurso: piscadaLongaEmCurso(piscadaRef.current, agora, piscadaLongaMs),
        sob: botaoSobOOlhar(s, horizontalRef.current),
      });
      if (respostaDaPiscada) responderRef.current(respostaDaPiscada);
      atualizarVisual();
    });
  }, [subscribe, piscadaLigada, piscadaLongaMs, atualizarVisual]);

  const base: React.CSSProperties = {
    height: '100%',
    width: '100%',
    border: 'none',
    borderRadius: 'var(--radius-xl, 2rem)',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
  };
  // Com a piscada ligada, o destaque é o da trava (3 s); desligada, o de antes.
  const destaque: RespostaSimNao | null = piscadaLigada ? visual.respondida : resposta;
  const realce = (ligado: boolean): React.CSSProperties =>
    ligado ? { outline: '8px solid #ffffff', outlineOffset: '-14px', filter: 'brightness(1.15)' } : {};
  // Botão que não responde agora (a outra resposta na trava, a piscada
  // decidindo, o olhar parado que precisa sair): esmaecido, para a pausa ser
  // visível e não parecer defeito. A aparência e o ponteiro ficam explícitos
  // porque `data-no-dwell` num GazeButton também o pinta como desabilitado e
  // desliga o ponteiro (index.css, "Estado desabilitado") — e aqui o botão só
  // está sem dwell: o mouse e o teclado continuam valendo, a resposta em
  // destaque não pode sair apagada, e o `elementFromPoint` da guarda precisa
  // continuar achando o botão sob o olhar.
  const aparencia = (b: BotaoDoSimNao): React.CSSProperties => ({
    opacity: piscadaLigada && b !== destaque && (visual.semDwell[b] || (visual.respondida !== null && b !== 'chamar')) ? 0.45 : 1,
    pointerEvents: 'auto',
    cursor: 'pointer',
  });
  const semDwell = (b: BotaoDoSimNao) => (visual.semDwell[b] ? 'true' : undefined);

  const linhaDoChamado = chamado
    ? `${segundoToqueHaS !== null ? `Você já chamou há ${segundoToqueHaS} s. ` : ''}${textoDoChamado(chamado.entrega)}`
    : null;

  const subtitulo = !piscadaLigada
    ? 'Olhe para o lado da resposta'
    : visual.respondida
      ? `Você respondeu ${visual.respondida === 'sim' ? 'SIM' : 'NÃO'}. Espere um instante para responder de novo.`
      : visual.esperandoSegunda
        ? 'Uma piscada longa. Para NÃO, pisque longo de novo; para SIM, é só esperar.'
        : 'Olhe para o lado da resposta · ou pisque longo: uma vez = SIM, duas = NÃO';

  const anuncio = destaque === 'sim'
    ? 'Sim'
    : destaque === 'nao'
      ? 'Não'
      : linhaDoChamado
        ? `${chamando ? 'Chamando atenção. ' : ''}${linhaDoChamado}`
        : '';

  if (horizontal) {
    // Só as duas metades: o "Chamar atenção" era uma faixa embaixo, e quem
    // perdeu o olhar vertical não chega nela. O socorro fica na faixa da
    // Emergência, na borda direita (EmergencyProvider).
    const ladoDoSimNao = (r: RespostaSimNao): LadoDaEscolha => ({
      nome: r === 'sim' ? 'Sim' : 'Não',
      rotulo: (
        <>
          {r === 'sim'
            ? <Check size={120} strokeWidth={2.5} aria-hidden="true" />
            : <X size={120} strokeWidth={2.5} aria-hidden="true" />}
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 9vh, 6rem)', fontWeight: 900 }}>
            {r === 'sim' ? 'SIM' : 'NÃO'}
          </span>
        </>
      ),
      aoEscolher: () => responder(r),
      estilo: {
        border: 'none',
        color: '#ffffff',
        background: r === 'sim' ? '#067647' : '#B42318',
        ...realce(destaque === r),
        ...aparencia(r),
      },
      dados: { 'data-simnao': r, 'data-no-dwell': semDwell(r) },
    });
    return (
      <GazePageLayout showBack={true} backRoute="/menu" titulo="Sim · Não" subtitulo={subtitulo}>
        <EscolhaLateral
          esquerda={ladoDoSimNao('nao')}
          direita={ladoDoSimNao('sim')}
          centro={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
              {destaque && (
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 8vh, 5rem)', fontWeight: 900, color: destaque === 'sim' ? '#4ADE80' : '#F87171' }}>
                  {destaque === 'sim' ? 'SIM' : 'NÃO'}
                </span>
              )}
              <p style={{ margin: 0, fontSize: 'clamp(1.25rem, 3.2vh, 1.9rem)', fontWeight: 800, color: 'var(--color-text-base)' }}>
                ← NÃO · SIM →
              </p>
              <p style={{ margin: 0, fontSize: 'clamp(1rem, 2.6vh, 1.4rem)', fontWeight: 600, lineHeight: 1.35, color: 'var(--color-text-muted)' }}>
                Para pedir socorro, olhe para a faixa vermelha na borda direita da tela.
              </p>
            </div>
          }
        />
        <p role="status" aria-live="assertive" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {anuncio}
        </p>
      </GazePageLayout>
    );
  }

  return (
    <GazePageLayout showBack={true} backRoute="/menu" titulo="Sim · Não" subtitulo={subtitulo}>
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: '1.25rem', height: '100%', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', minHeight: 0 }}>
          <GazeButton
            onClick={() => responder('nao')}
            aria-label="Não"
            data-simnao="nao"
            data-no-dwell={semDwell('nao')}
            style={{ ...base, background: '#B42318', ...realce(destaque === 'nao'), ...aparencia('nao') }}
          >
            <X size={120} strokeWidth={2.5} aria-hidden="true" />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 9vh, 6rem)', fontWeight: 900 }}>NÃO</span>
          </GazeButton>
          <GazeButton
            onClick={() => responder('sim')}
            aria-label="Sim"
            data-simnao="sim"
            data-no-dwell={semDwell('sim')}
            style={{ ...base, background: '#067647', ...realce(destaque === 'sim'), ...aparencia('sim') }}
          >
            <Check size={120} strokeWidth={2.5} aria-hidden="true" />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 9vh, 6rem)', fontWeight: 900 }}>SIM</span>
          </GazeButton>
        </div>
        <GazeButton
          onClick={chamar}
          aria-label="Chamar atenção"
          data-simnao="chamar"
          data-no-dwell={semDwell('chamar')}
          style={{
            ...base,
            height: 'clamp(140px, 22vh, 220px)',
            flexDirection: 'row',
            // Com a linha do estado do chamado, o conteúdo ocupa a largura
            // toda: sem este respiro, o contorno do destaque cobria o sino.
            padding: '0 clamp(1.75rem, 3.5vw, 3rem)',
            boxSizing: 'border-box',
            background: '#B54708',
            ...realce(chamando || segundoToqueHaS !== null),
            ...aparencia('chamar'),
          }}
        >
          <Bell size={64} strokeWidth={2.2} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.3rem', minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5.5vh, 3.5rem)', fontWeight: 900, lineHeight: 1.05 }}>
              {chamando ? 'CHAMANDO…' : 'CHAMAR ATENÇÃO'}
            </span>
            {linhaDoChamado && (
              <span data-testid="estado-do-chamado" style={{ fontSize: 'clamp(1.05rem, 2.6vh, 1.4rem)', fontWeight: 700, lineHeight: 1.25, textAlign: 'left' }}>
                {linhaDoChamado}
              </span>
            )}
          </span>
        </GazeButton>
      </div>
      <p role="status" aria-live="assertive" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {anuncio}
      </p>
    </GazePageLayout>
  );
};
