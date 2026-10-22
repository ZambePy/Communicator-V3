import React, { useEffect, useRef, useState } from 'react';
import { useGaze, DWELL_SELECTOR, suspenderDwell } from '../context/GazeContext';
import { useSettings } from '../context/SettingsContext';
import {
  criarEstadoDaVarredura, passoDaVarredura, ehDoAcionador, limitarPasso, limitarPressaoLonga, textoDosSegundos,
  type EntradaDoAcionador, type EstadoDaVarredura,
} from '@tracker/interaction/varreduraPorAcionador';
import { playTone } from '../utils/emergencyAudio';
import { emergenciaPorFonte } from '../services/estadoDeEmergencia';
import { criarAnunciadorDaVarredura } from '../services/interaction/varreduraFalada';

// -----------------------------------------------------------------------------
// Varredura com ACIONADOR — o Plano B pedido em 18/10/2026 para quando o olhar
// piora. A lógica (passo, seleção, pressão longa) está em
// `src/interaction/varreduraPorAcionador.ts`, pura e testada; aqui fica o DOM:
// quais botões existem na tela, o destaque, o acionador (tecla ou mouse) e o
// clique.
//
// Diferenças deliberadas em relação à varredura por piscada (`ScanningMode`):
//  - liga por escolha do cuidador (Configurações → Plano B), não sozinha;
//  - o acionador é um gesto deliberado, então a contagem regressiva da
//    emergência entra na volta (o CANCELAR dela fica ao alcance); o botão de
//    Emergência em si NÃO entra — o caminho dele é segurar o acionador
//    (2 s por padrão, ajustável);
//  - com uma janela de diálogo modal aberta, só os botões dela entram na volta
//    (a de cima, se houver mais de uma).
//
// Segurar o acionador chama a emergência em QUALQUER situação em que o botão
// dela está na tela: varredura andando, pausada pelo cuidador, calibração,
// teste de precisão, tecla dentro de um campo de texto (revisão de UX de
// 19/10/2026, itens 3, 8 e 9). Fora da volta andando, o aperto só é observado
// para isso: não escolhe nada, e a tecla ou o clique seguem o caminho normal
// tanto quanto possível.
//
// Com o socorro em curso e sem o botão de Emergência na tela — a contagem
// aberta, a tela do pedido em andamento —, segurar não escolhe nada: cancelar
// e parar o alarme só com um aperto curto, e o "Sim, parar" nunca com a
// pressão longa (revisão de UX de 20/10/2026, achado 1). A faixa de baixo diz
// isso nessas telas.
//
// Varredura FALADA (rodada 3, 21/10/2026, ajuste `varreduraFalada`): a cada
// passo a voz do computador diz o nome do botão destacado, baixinho
// (`services/interaction/varreduraFalada`). Nunca fala por cima do paciente, do
// alarme nem da mensagem do cuidador — a voz do sistema começa com `cancel()`,
// que cortaria a fala deles. Se a voz do computador não responde, a faixa avisa.
// -----------------------------------------------------------------------------

const TICK_MS = 100;

/**
 * A pausa pelo Esc tem prazo (revisão de UX de 19/10/2026, item 3). Sem ele, o
 * cuidador apertava Esc, saía do quarto, e a varredura ficava parada para
 * sempre: o paciente sem nenhuma entrada. Passado isto, ela volta sozinha.
 */
export const PAUSA_MAXIMA_MS = 2 * 60_000;
/** O aviso grande "A varredura volta em 10 s" aparece este tempo antes da volta. */
export const AVISO_DA_VOLTA_MS = 10_000;

/** Diálogos modais: com um aberto, só os botões dele entram na varredura. */
const SELETOR_DE_MODAL = '[role="alertdialog"], [role="dialog"][aria-modal="true"]';

/** O botão flutuante de Emergência (`EmergencyProvider`). */
const SELETOR_DA_EMERGENCIA = 'button[data-emergency="true"]';

/** O CANCELAR da contagem da emergência (`EmergencyProvider`): na tela, a contagem está aberta. */
const SELETOR_DO_CANCELAR = '[data-cancelar-emergencia="true"]';

/**
 * Item que a pressão longa nunca escolhe — o "Sim, parar" do alarme
 * (`EmergencyEscalation`). Revisão de UX de 20/10/2026, achado 1.
 */
export const ATRIBUTO_SO_APERTO_CURTO = 'data-acionador-aperto-curto';

/**
 * Socorro em curso sem o botão de Emergência na tela: `contagem` (a contagem
 * aberta) ou `pedido` (a tela do pedido em andamento). Pelo CANCELAR na tela
 * e pelo sinal do `EmergencyProvider` (`estadoDeEmergencia`): qualquer um dos
 * dois basta — o CANCELAR aparece um quadro antes do sinal.
 */
export type SocorroNaTela = 'contagem' | 'pedido' | null;

function socorroSemOBotao(raiz: ParentNode = document): SocorroNaTela {
  if (raiz.querySelector(SELETOR_DO_CANCELAR) !== null || emergenciaPorFonte('confirmacao')) return 'contagem';
  if (emergenciaPorFonte('pedido')) return 'pedido';
  return null;
}

/** Tipos de `<input>` em que Espaço e Enter são do campo (texto, seletor de data), não um "clique". */
const TIPOS_DE_DIGITACAO = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week',
]);

function temCaixa(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Um diálogo que está mesmo na tela: escondido, ele não pode prender a varredura (ela ficaria sem itens). */
function modalVisivel(m: HTMLElement): boolean {
  if (m.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const estilo = getComputedStyle(m);
  if (estilo.display === 'none' || estilo.visibility === 'hidden') return false;
  if (temCaixa(m)) return true;
  // Caixa vazia (o diálogo só posiciona os filhos): vale se algum botão dele aparece.
  return Array.from(m.querySelectorAll(DWELL_SELECTOR)).some(temCaixa);
}

/** A camada em que um diálogo aparece: o maior `z-index` da cadeia até a raiz. */
function camadaDe(el: Element): number {
  let camada = 0;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const z = parseInt(getComputedStyle(n).zIndex, 10);
    if (Number.isFinite(z) && z > camada) camada = z;
  }
  return camada;
}

/**
 * O diálogo modal de CIMA, se houver (revisão de UX de 19/10/2026, item 17).
 * Pela camada, e não pela ordem no DOM: o reajuste rápido mora no
 * `GazeProvider`, antes do resto do app, e uma confirmação aberta debaixo dele
 * viria depois — a varredura percorreria botões que o preto do reajuste cobre.
 * Empate de camada: vale o que vem depois no DOM, que é pintado por cima.
 */
export function modalNoTopo(raiz: ParentNode = document): HTMLElement | null {
  let topo: HTMLElement | null = null;
  let camadaDoTopo = -Infinity;
  for (const m of Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR_DE_MODAL))) {
    if (!modalVisivel(m)) continue;
    const camada = camadaDe(m);
    if (camada >= camadaDoTopo) {
      topo = m;
      camadaDoTopo = camada;
    }
  }
  return topo;
}

/** Botões da tela na ordem de leitura (de cima para baixo, da esquerda para a direita). */
export function itensDaVarredura(raiz: ParentNode = document, modal: HTMLElement | null = modalNoTopo(raiz)): HTMLElement[] {
  const escopo: ParentNode = modal ?? raiz;
  const itens = Array.from(escopo.querySelectorAll<HTMLElement>(DWELL_SELECTOR)).filter((n) => {
    if ((n as HTMLButtonElement).disabled) return false;
    if (n.getAttribute('aria-disabled') === 'true') return false;
    if (n.dataset.noDwell === 'true') return false;
    if (n.dataset.emergency === 'true') return false;
    if (n.closest('[aria-hidden="true"], [inert], [hidden]')) return false;
    return temCaixa(n);
  });
  // Ordem de leitura: linhas com ~24 px de tolerância (botões da mesma fileira
  // raramente alinham ao pixel), depois da esquerda para a direita.
  return itens
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .sort((a, b) => (Math.abs(a.r.top - b.r.top) > 24 ? a.r.top - b.r.top : a.r.left - b.r.left))
    .map((x) => x.el);
}

/**
 * Campo onde se digita: lá Espaço e Enter são do campo (revisão de UX de
 * 19/10/2026, item 8 — viravam cliques da varredura e não entravam no texto).
 * Caixa de seleção, botão de opção e controle deslizante NÃO contam: com o foco
 * parado num deles depois de um clique do cuidador, o acionador do paciente
 * passaria a marcar e desmarcar a caixa em vez de escolher.
 */
export function ehCampoDeDigitacao(el: Element | null): boolean {
  if (!el) return false;
  if (el.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') return TIPOS_DE_DIGITACAO.has(((el as HTMLInputElement).type || 'text').toLowerCase());
  return false;
}

/** Foco dentro de uma janela de diálogo: o Esc é dela (fechar), não da pausa. */
function dentroDeDialogo(el: Element | null): boolean {
  return !!el?.closest('[role="dialog"], [role="alertdialog"], dialog');
}

/** Quem recebe a tecla: o alvo do evento ou, se ele veio da janela, o elemento com o foco. */
function alvoDaTecla(e: KeyboardEvent): Element | null {
  return e.target instanceof Element ? e.target : document.activeElement;
}

/** O acionador chega como tecla? Sem configuração, sim: Espaço/Enter. */
function acionadorPorTecla(a: EntradaDoAcionador | null | undefined): boolean {
  return !a || a.tipo === 'tecla';
}

/** Há uma calibração valendo? Sem ela o ponto do olhar é o do nariz: religar o clique pelo olhar não serviria. */
function calibracaoEmVigor(g: { calibration?: { isCalibrated?: () => boolean } }): boolean {
  try {
    return g.calibration?.isCalibrated?.() === true;
  } catch {
    return false;
  }
}

/**
 * Como um aperto do acionador é tratado — decidido quando ele começa:
 *  - `varredura`: a volta está andando; o aperto é dela, inteiro (a tecla ou o
 *    clique não chegam à página);
 *  - `campo`: tecla dentro de um campo de texto; ela é do campo;
 *  - `pausa`: varredura pausada pelo cuidador; a tecla e o clique seguem para a
 *    página, que é dele;
 *  - `medicao`: calibração ou teste de precisão; nada é escolhido.
 * Fora de `varredura`, o aperto só é observado para a pressão longa (emergência).
 */
type ModoDoAperto = 'varredura' | 'campo' | 'pausa' | 'medicao';

export interface SituacaoDaFaixa {
  pausado: boolean;
  /** Segundos até a volta, durante o aviso; `null` fora dele. */
  voltaEmS: number | null;
  segurando: boolean;
  emergenciaNaTela: boolean;
  medindo: boolean;
  focoNoCampo: boolean;
  pressaoLongaMs: number;
  /** Socorro em curso sem o botão de Emergência na tela (achado 1 de 20/10/2026). */
  socorro?: SocorroNaTela;
  /** O aperto em curso passou do limiar sem escolher nada (socorro em curso). */
  segurouSemEfeito?: boolean;
}

/** O texto da faixa de baixo, que diz o que o acionador faz agora. */
export function textoDaFaixa(s: SituacaoDaFaixa): string {
  const tempo = textoDosSegundos(s.pressaoLongaMs);
  const emergencia = s.emergenciaNaTela ? ` · segure ${tempo} para emergência` : '';
  if (s.segurando && s.emergenciaNaTela) return `Segure ${tempo} para chamar a emergência`;
  if (s.pausado) {
    // Estático durante o aviso: a faixa é lida pelo leitor de tela, e um
    // número mudando a cada segundo viraria dez anúncios.
    return s.voltaEmS !== null
      ? `A varredura volta em ${AVISO_DA_VOLTA_MS / 1000} s`
      : `Varredura pausada por até ${PAUSA_MAXIMA_MS / 60_000} min · Esc volta agora${emergencia}`;
  }
  if (s.medindo) return `Medição em andamento: a varredura espera${emergencia}`;
  if (s.focoNoCampo) return 'O acionador está escrevendo no campo de texto · clique fora dele para voltar à varredura';
  if (s.socorro) {
    // Revisão de UX de 20/10/2026, achado 1. Enquanto segura, a faixa NÃO
    // muda para "Solte para escolher": na contagem, isso convidaria quem
    // segura pedindo socorro a soltar — e soltar cedo é o aperto que cancela.
    // Passado o limiar, ela diz que segurar não fez nada.
    if (s.segurouSemEfeito) {
      return s.socorro === 'contagem'
        ? 'Segurar não cancela: o pedido de socorro continua'
        : 'Segurar não escolhe nada aqui · para escolher, aperte rápido';
    }
    return s.socorro === 'contagem' ? 'Para cancelar, aperte rápido' : 'Socorro em andamento · para escolher, aperte rápido';
  }
  if (s.segurando) return 'Solte para escolher';
  return `Acionador: aperte para escolher${emergencia} · Esc pausa`;
}

interface Destaque { left: number; top: number; width: number; height: number }

export function VarreduraComAcionador(): React.ReactElement | null {
  const { settings } = useSettings();
  const gaze = useGaze();
  const { state } = gaze;
  const ativo = settings.modoDeEntrada === 'acionador';
  const stateRef = useRef(state);
  stateRef.current = state;
  const configRef = useRef(settings);
  configRef.current = settings;
  const estadoRef = useRef<EstadoDaVarredura>(criarEstadoDaVarredura());
  const itensRef = useRef<HTMLElement[]>([]);
  const [destaque, setDestaque] = useState<Destaque | null>(null);
  const [segurando, setSegurando] = useState(false);
  /**
   * Pausa pelo cuidador (Esc). Com o acionador configurado como clique do
   * mouse, todo clique vira acionador — sem a pausa, quem ajuda não conseguiria
   * usar o mouse para mais nada. O ref muda NA HORA (o próximo evento já vê);
   * o estado, no próximo render.
   */
  const [pausado, setPausado] = useState(false);
  const pausadoRef = useRef(false);
  const pausadoDesdeRef = useRef(0);
  const [voltaEmS, setVoltaEmS] = useState<number | null>(null);
  const [emergenciaNaTela, setEmergenciaNaTela] = useState(true);
  const [medindo, setMedindo] = useState(false);
  const [focoNoCampo, setFocoNoCampo] = useState(false);
  const [socorro, setSocorro] = useState<SocorroNaTela>(null);
  const [segurouSemEfeito, setSegurouSemEfeito] = useState(false);
  /** A voz do computador não está respondendo à varredura falada (a faixa avisa o cuidador). */
  const [semSom, setSemSom] = useState(false);
  /** Depois de um aperto engolido pelo MOUSE, o `click` nativo que vem junto também é engolido. */
  const engolirCliqueAteRef = useRef(0);
  /** O modo do aperto em curso (ver `ModoDoAperto`), ou `null`. */
  const modoDoApertoRef = useRef<ModoDoAperto | null>(null);
  const calibrado = calibracaoEmVigor(gaze);

  // O olhar para de clicar enquanto o acionador manda (se o ajuste pedir). Com
  // a varredura PAUSADA ele volta (revisão de UX de 19/10/2026, item 3): antes,
  // pausada, ela deixava o paciente sem entrada nenhuma — nem o olhar. Só com
  // uma calibração valendo: sem ela o ponto é o do nariz, e o despachante de
  // dwell não clicaria em nada de qualquer jeito.
  const olharSuspenso = ativo && settings.acionadorDesligaOlhar && !(pausado && calibrado);
  useEffect(() => {
    if (!olharSuspenso) return;
    suspenderDwell(true, 'acionador');
    return () => suspenderDwell(false, 'acionador');
  }, [olharSuspenso]);

  useEffect(() => {
    if (!ativo) {
      setDestaque(null);
      return;
    }
    estadoRef.current = criarEstadoDaVarredura(performance.now());
    const anunciador = criarAnunciadorDaVarredura({ aoMudarSemSom: setSemSom });
    // O anúncio sai num turno à parte, DEPOIS de o anel do destaque ser desenhado:
    // `cancel()` + `speak()` da voz do computador podem segurar a thread (a
    // primeira fala acorda o sintetizador, perto de 1 s no Windows), e o anel é o
    // que o paciente vê. Um só pendente por vez, e a saída o desfaz: um anúncio
    // que sobrasse falaria depois de a varredura ter ido embora.
    let anuncioPendente: ReturnType<typeof setTimeout> | null = null;
    const anunciarDepois = (alvo: HTMLElement | null) => {
      if (anuncioPendente !== null) clearTimeout(anuncioPendente);
      anuncioPendente = setTimeout(() => {
        anuncioPendente = null;
        anunciador.destacar(alvo);
      }, 0);
    };

    const definirPausa = (p: boolean) => {
      const agora = performance.now();
      pausadoRef.current = p;
      pausadoDesdeRef.current = agora;
      // Pausar apaga o destaque; voltar recomeça a volta do primeiro item.
      estadoRef.current = { ...estadoRef.current, indice: null, ultimoPassoMs: agora };
      setVoltaEmS(null);
      setPausado(p);
    };

    const botaoDeEmergencia = () => document.querySelector<HTMLButtonElement>(SELETOR_DA_EMERGENCIA);

    const aplicar = (r: ReturnType<typeof passoDaVarredura>) => {
      estadoRef.current = r.estado;
      if (r.acao?.tipo === 'selecionar') {
        const alvo = itensRef.current[r.acao.indice];
        if (alvo && alvo.isConnected) {
          if (configRef.current.soundEnabled !== false) playTone(880, 0, 0.08, 0.12);
          alvo.click();
        }
      } else if (r.acao?.tipo === 'emergencia') {
        // O mesmo caminho do botão flutuante: abre a contagem regressiva (com
        // CANCELAR, que entra na varredura) ou, com um pedido já em andamento,
        // leva à tela dele.
        const fab = botaoDeEmergencia();
        if (!fab) {
          // O núcleo só pede a emergência com o botão na tela; chegar aqui é o
          // botão ter sumido entre a conferência e o clique.
          console.warn('[acionador] pressão longa sem botão de Emergência na tela');
          return;
        }
        // Pausada, a varredura volta: o cuidador que pausou pode ter saído do
        // quarto, e o CANCELAR da contagem precisa ficar ao alcance do acionador.
        if (pausadoRef.current) definirPausa(false);
        fab.click();
      }
    };

    // Nunca durante a calibração nem no teste de precisão: lá quem manda é o
    // olhar, e um clique da varredura corromperia a coleta. A exceção é um
    // diálogo modal POR CIMA da medição — a contagem da emergência aberta pela
    // pressão longa: o CANCELAR dela tem de ficar ao alcance (item 9).
    const medindoAgora = (modal: HTMLElement | null) =>
      modal === null && (stateRef.current === 'calibrating' || document.getElementById('accuracy-dot') !== null);

    const modoAgora = (alvo: Element | null, porTecla: boolean): ModoDoAperto => {
      if (porTecla && ehCampoDeDigitacao(alvo)) return 'campo';
      if (pausadoRef.current) return 'pausa';
      if (medindoAgora(modalNoTopo())) return 'medicao';
      return 'varredura';
    };

    const tique = () => {
      const agora = performance.now();
      if (pausadoRef.current) {
        const restante = PAUSA_MAXIMA_MS - (agora - pausadoDesdeRef.current);
        if (restante <= 0) definirPausa(false);
        else setVoltaEmS(restante <= AVISO_DA_VOLTA_MS ? Math.ceil(restante / 1000) : null);
      }
      const modal = modalNoTopo();
      const emMedicao = medindoAgora(modal);
      const varrendo = !pausadoRef.current && !emMedicao;
      // Pausada ou na medição a lista fica vazia: o destaque some, e a pressão
      // longa continua contando (o núcleo a confere antes da lista).
      itensRef.current = varrendo ? itensDaVarredura(document, modal) : [];
      const fab = botaoDeEmergencia();
      const config = configRef.current;
      // Socorro em curso só conta sem o botão de Emergência na tela: com ele
      // (o pedido em andamento, o paciente em outra tela), segurar continua
      // levando ao pedido, como sempre.
      const socorroAgora = fab === null ? socorroSemOBotao() : null;
      const destacadoAntes = estadoRef.current.indice !== null ? itensRef.current[estadoRef.current.indice] : undefined;
      setEmergenciaNaTela(fab !== null);
      setMedindo(emMedicao);
      setFocoNoCampo(acionadorPorTecla(config.acionador) && ehCampoDeDigitacao(document.activeElement));
      setSocorro(socorroAgora);
      aplicar(passoDaVarredura(estadoRef.current, {
        tipo: 'tique',
        nowMs: agora,
        nItens: itensRef.current.length,
        passoMs: limitarPasso(config.acionadorPassoMs),
        pressaoLongaMs: limitarPressaoLonga(config.acionadorPressaoLongaMs),
        emergenciaNaTela: fab !== null,
        socorroEmCurso: socorroAgora !== null,
        destacadoSoComApertoCurto: destacadoAntes?.getAttribute(ATRIBUTO_SO_APERTO_CURTO) === 'true',
      }));
      setSegurouSemEfeito(estadoRef.current.apertadoDesde !== null && estadoRef.current.pressaoLongaSemEfeito);
      const i = estadoRef.current.indice;
      const el = i !== null ? itensRef.current[i] : null;
      // Sem destaque (pausa, medição, a pausa depois de uma escolha) ou com o
      // ajuste desligado, o anunciador corta o que ainda toca dele.
      anunciarDepois(config.varreduraFalada === true ? el : null);
      if (!el) {
        setDestaque(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setDestaque((d) => (d && d.left === r.left && d.top === r.top && d.width === r.width && d.height === r.height
        ? d
        : { left: r.left, top: r.top, width: r.width, height: r.height }));
    };
    tique();
    const id = setInterval(tique, TICK_MS);

    const apertou = (modo: ModoDoAperto) => {
      modoDoApertoRef.current = modo;
      // Num campo de texto o aperto é quase sempre alguém digitando: a faixa
      // não pisca "Segure…" a cada Espaço.
      if (modo !== 'campo') setSegurando(true);
      aplicar(passoDaVarredura(estadoRef.current, { tipo: 'apertou', nowMs: performance.now(), soEmergencia: modo !== 'varredura' }));
    };
    const soltou = () => {
      modoDoApertoRef.current = null;
      setSegurando(false);
      setSegurouSemEfeito(false);
      aplicar(passoDaVarredura(estadoRef.current, { tipo: 'soltou', nowMs: performance.now(), nItens: itensRef.current.length }));
    };
    const engolir = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Fase de CAPTURA: com a volta andando, o Espaço/Enter do acionador não pode
    // também "clicar" o botão que estiver com o foco do teclado (seria uma
    // segunda seleção, no lugar errado). Fora dela, a tecla é engolida só no
    // necessário (revisão de UX de 19/10/2026, itens 8 e 9).
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = alvoDaTecla(e);
      if (e.code === 'Escape') {
        if (e.type !== 'keydown' || e.repeat) return;
        // Esc num campo de texto ou numa janela de diálogo é deles (desfazer,
        // fechar), não da pausa (item 3).
        if (ehCampoDeDigitacao(alvo) || dentroDeDialogo(alvo)) return;
        definirPausa(!pausadoRef.current);
        return;
      }
      if (!ehDoAcionador(configRef.current.acionador, { tipo: 'tecla', codigo: e.code })) return;
      if (e.type === 'keydown' && !e.repeat) apertou(modoAgora(alvo, true));
      const modo = modoDoApertoRef.current ?? modoAgora(alvo, true);
      if (modo === 'varredura' || estadoRef.current.pressaoLongaAgiu) {
        // Depois que a pressão longa agiu, o resto do aperto (repetições, o
        // soltar) não chega a nada — nem ao botão com o foco, debaixo da contagem.
        engolir(e);
      } else if (modo === 'medicao') {
        // Sem o efeito padrão (o botão com o foco, escondido sob a medição, não
        // é clicado), mas a página continua ouvindo a tecla. No botão de
        // Emergência com o foco, a tecla é dele: é o caminho do teclado na medição.
        if (!alvo?.closest(SELETOR_DA_EMERGENCIA)) e.preventDefault();
      } else if (modo === 'pausa' && e.repeat) {
        // Segurar para pedir socorro não vira uma rajada de Enter no botão com o foco.
        e.preventDefault();
      }
      if (e.type === 'keyup') soltou();
    };
    const aoMouse = (e: MouseEvent) => {
      if (!ehDoAcionador(configRef.current.acionador, { tipo: 'mouse', botao: e.button })) return;
      if (e.type === 'mousedown') {
        const modo = modoAgora(null, false);
        apertou(modo);
        // Pausada, o clique é do cuidador e segue. Na medição continua engolido,
        // como sempre: um clique onde o ponteiro estiver poderia acertar algo
        // que o paciente nem vê.
        if (modo !== 'pausa') engolir(e);
        return;
      }
      const modo = modoDoApertoRef.current ?? modoAgora(null, false);
      if (modo !== 'pausa' || estadoRef.current.pressaoLongaAgiu) {
        engolir(e);
        engolirCliqueAteRef.current = performance.now() + 400;
      }
      soltou();
    };
    const aoClique = (e: MouseEvent) => {
      if (performance.now() < engolirCliqueAteRef.current && e.isTrusted) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const aoMenuDeContexto = (e: MouseEvent) => {
      if (!ehDoAcionador(configRef.current.acionador, { tipo: 'mouse', botao: 2 })) return;
      // Pausada, o clique direito é do cuidador — a não ser logo depois de um
      // aperto engolido (a pressão longa que abriu a emergência).
      if (!pausadoRef.current || performance.now() < engolirCliqueAteRef.current) e.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar, true);
    window.addEventListener('keyup', aoTeclar, true);
    window.addEventListener('mousedown', aoMouse, true);
    window.addEventListener('mouseup', aoMouse, true);
    window.addEventListener('click', aoClique, true);
    window.addEventListener('contextmenu', aoMenuDeContexto, true);
    return () => {
      clearInterval(id);
      if (anuncioPendente !== null) clearTimeout(anuncioPendente);
      window.removeEventListener('keydown', aoTeclar, true);
      window.removeEventListener('keyup', aoTeclar, true);
      window.removeEventListener('mousedown', aoMouse, true);
      window.removeEventListener('mouseup', aoMouse, true);
      window.removeEventListener('click', aoClique, true);
      window.removeEventListener('contextmenu', aoMenuDeContexto, true);
      anunciador.encerrar();
      setSemSom(false);
      pausadoRef.current = false;
      modoDoApertoRef.current = null;
      setDestaque(null);
      setSegurando(false);
      setSegurouSemEfeito(false);
      setSocorro(null);
      setPausado(false);
      setVoltaEmS(null);
    };
  }, [ativo]);

  if (!ativo) return null;
  const margem = 8;
  // Quem está usando o mouse ganha mais 2 min. Caminho do cuidador: sem dwell
  // (o olhar do paciente não pode prolongar a própria pausa) e fora da volta.
  const continuarPausada = () => {
    pausadoDesdeRef.current = performance.now();
    setVoltaEmS(null);
  };
  return (
    <>
      {destaque && (
        <div
          aria-hidden="true"
          data-testid="destaque-do-acionador"
          style={{
            position: 'fixed',
            left: destaque.left - margem,
            top: destaque.top - margem,
            width: destaque.width + 2 * margem,
            height: destaque.height + 2 * margem,
            border: '6px solid #FBBF24',
            borderRadius: 20,
            boxShadow: '0 0 0 4px rgba(9, 27, 51, 0.85), 0 0 28px rgba(251, 191, 36, 0.55)',
            pointerEvents: 'none',
            // Acima até da confirmação da emergência (999999): o CANCELAR dela
            // é destacado pela varredura.
            zIndex: 1000001,
            transition: 'left 120ms ease, top 120ms ease, width 120ms ease, height 120ms ease',
          }}
        />
      )}
      {pausado && voltaEmS !== null && (
        // O aviso grande antes da volta (revisão de UX de 19/10/2026, item 3):
        // com o acionador no clique do mouse, o próximo clique do cuidador já
        // vai escolher um botão.
        <div
          data-testid="aviso-da-volta"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000001,
            padding: '2rem 2.5rem',
            borderRadius: 24,
            background: 'rgba(9, 27, 51, 0.96)',
            color: '#F8FAFC',
            border: '3px solid #FBBF24',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
            textAlign: 'center',
            maxWidth: 'min(90vw, 40rem)',
            pointerEvents: 'none',
          }}
        >
          <p style={{ margin: 0, fontSize: '2.6rem', fontWeight: 800, lineHeight: 1.2 }}>
            A varredura volta em {voltaEmS} s
          </p>
          <button
            type="button"
            data-no-dwell="true"
            onClick={continuarPausada}
            style={{
              pointerEvents: 'auto',
              marginTop: '1.5rem',
              padding: '1rem 1.75rem',
              borderRadius: '1rem',
              border: 'none',
              background: '#F8FAFC',
              color: '#091B33',
              fontSize: '1.25rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Continuar pausada
          </button>
        </div>
      )}
      {semSom && settings.varreduraFalada && (
        // A voz do computador não respondeu à varredura falada (sem voz
        // instalada, sintetizador travado): sem este aviso o cuidador acharia
        // que a varredura falada está funcionando e ninguém ouviria nada.
        <div
          role="status"
          aria-live="polite"
          data-testid="varredura-falada-sem-som"
          style={{
            position: 'fixed',
            left: 16,
            bottom: 72,
            zIndex: 1000001,
            padding: '0.6rem 1rem',
            borderRadius: 999,
            background: 'rgba(127, 29, 29, 0.96)',
            color: '#F8FAFC',
            border: '1px solid rgba(252, 165, 165, 0.8)',
            fontSize: '1rem',
            fontWeight: 700,
            pointerEvents: 'none',
          }}
        >
          Varredura falada sem som: a voz do computador não respondeu
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          zIndex: 1000001,
          padding: '0.6rem 1rem',
          borderRadius: 999,
          background: 'rgba(9, 27, 51, 0.92)',
          color: '#F8FAFC',
          border: '1px solid rgba(251, 191, 36, 0.6)',
          fontSize: '1rem',
          fontWeight: 700,
          pointerEvents: 'none',
        }}
      >
        {textoDaFaixa({
          pausado,
          voltaEmS,
          segurando,
          emergenciaNaTela,
          medindo,
          focoNoCampo,
          pressaoLongaMs: limitarPressaoLonga(settings.acionadorPressaoLongaMs),
          socorro,
          segurouSemEfeito,
        })}
      </div>
    </>
  );
}
