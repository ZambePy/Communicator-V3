// Varredura com ACIONADOR (pedido de 18/10/2026: "Plano B quando o olhar
// piora").
//
// Um acionador é um botão grande ligado ao computador por USB — o paciente o
// aperta com o que ainda se move (a mão, o queixo, o pé, a sobrancelha com um
// sensor). Ele chega ao computador como uma tecla (Espaço, Enter, F-alguma) ou
// como um clique de mouse. Com ele, a tela é percorrida sozinha, um botão por
// vez, e apertar seleciona o destacado. Não depende de olhar, de calibração nem
// de câmera: é o caminho que continua quando o rastreamento não dá mais.
//
// Diferente da varredura por PISCADA (`scanning.ts`), que liga sozinha quando o
// olhar some e nunca toca a emergência (piscar é involuntário), aqui o gesto é
// deliberado — apertar um botão. Mesmo assim a emergência não entra na volta da
// varredura: um aperto acidental no instante em que o destaque passa por ela
// chamaria socorro. O caminho da emergência é SEGURAR o acionador
// (`PRESSAO_LONGA_EMERGENCIA_MS`, ajustável), que abre a contagem regressiva
// normal — e o CANCELAR dela entra na varredura, então o paciente consegue
// desfazer com um aperto curto. Com o socorro em curso (a contagem aberta, o
// pedido em andamento), segurar não escolhe nada: segurar é o gesto do
// socorro, e não pode cancelá-lo nem calar o alarme (revisão de UX de
// 20/10/2026, achado 1). Sem o botão de Emergência na tela e sem socorro em
// curso (a tela de emergência antes do pedido), segurar escolhe o destacado.
//
// Este módulo é puro (sem DOM, sem relógio próprio): recebe eventos com o
// instante e devolve o novo estado e o que fazer. O componente
// `VarreduraComAcionador` cuida do DOM e do relógio.

/** Tempo em cada item, padrão. Ajustável em Configurações (800–4000 ms). */
export const PASSO_PADRAO_MS = 1500;
export const PASSO_MIN_MS = 800;
export const PASSO_MAX_MS = 4000;

/** Segurar o acionador por isto abre a contagem da emergência — o padrão. */
export const PRESSAO_LONGA_EMERGENCIA_MS = 2000;

/**
 * Faixa do ajuste da pressão longa (revisão de UX de 19/10/2026, item 7: o
 * limiar era fixo). Abaixo de 1 s, o aperto comum de quem solta devagar já
 * chama a emergência — e alarme falso repetido ensina a família a não levar o
 * alarme a sério. Acima de 4 s, segurar cansa quem tem ELA e o socorro demora
 * a abrir. É também a fronteira entre o aperto curto e o longo: com a
 * contagem aberta (5 s), só o aperto curto (soltar antes do limiar) cancela —
 * a pressão longa não escolhe nada ali (revisão de UX de 20/10/2026, achado 1).
 */
export const PRESSAO_LONGA_MIN_MS = 1000;
export const PRESSAO_LONGA_MAX_MS = 4000;

export function limitarPressaoLonga(ms: number | null | undefined): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return PRESSAO_LONGA_EMERGENCIA_MS;
  return Math.min(PRESSAO_LONGA_MAX_MS, Math.max(PRESSAO_LONGA_MIN_MS, Math.round(ms)));
}

/** "2 s", "2,5 s": como os tempos do acionador aparecem na tela. */
export function textoDosSegundos(ms: number): string {
  return `${String(Math.round(ms / 100) / 10).replace('.', ',')} s`;
}

/**
 * Depois de uma seleção a tela costuma mudar (navegação, teclado que troca de
 * grupo): a varredura espera um instante e recomeça do primeiro item da tela
 * nova. Recomeçar do início é a convenção da comunicação alternativa — o
 * paciente sabe onde a volta começa.
 */
export const PAUSA_APOS_SELECAO_MS = 700;

/**
 * Aperto curto demais é ressalto do contato do acionador (bounce), não
 * intenção: ignorado. Os acionadores comuns ressaltam por 5–30 ms.
 */
export const APERTO_MINIMO_MS = 40;

export interface EstadoDaVarredura {
  /** Item destacado (índice na lista atual), ou `null` antes do primeiro passo. */
  indice: number | null;
  /** Instante do último avanço do destaque. */
  ultimoPassoMs: number;
  /** Desde quando o acionador está apertado, ou `null`. */
  apertadoDesde: number | null;
  /**
   * A pressão longa já agiu neste aperto — abriu a emergência, escolheu o
   * destacado (sem o botão dela na tela) ou passou do limiar sem efeito (ver
   * `pressaoLongaSemEfeito`): o soltar não escolhe.
   */
  pressaoLongaAgiu: boolean;
  /**
   * O aperto passou do limiar com um socorro em curso (ou sobre um item que só
   * aceita aperto curto) e por isso não escolheu nada. No soltar, o destaque
   * segue de onde estava, sem voltar ao primeiro item (revisão de UX de
   * 20/10/2026, achado 1).
   */
  pressaoLongaSemEfeito: boolean;
  /**
   * Este aperto só pode chamar a emergência: começou com a varredura pausada,
   * durante a medição ou numa tecla dentro de um campo de texto. Soltar não
   * escolhe nada (revisão de UX de 19/10/2026, itens 3, 8 e 9).
   */
  soEmergencia: boolean;
  /** Antes disto o destaque não anda (pausa depois de uma seleção). */
  pausadoAte: number;
}

export type EventoDaVarredura =
  | {
      tipo: 'tique';
      nowMs: number;
      nItens: number;
      passoMs: number;
      /** Limiar da pressão longa (ajuste); sem valor válido, `PRESSAO_LONGA_EMERGENCIA_MS`. */
      pressaoLongaMs?: number;
      /**
       * O botão de Emergência está na tela? Sem ele (a contagem aberta, a tela
       * de emergência) a pressão longa escolhe o destacado — a não ser com um
       * socorro em curso. Sem a informação, vale o comportamento de antes:
       * abrir a emergência.
       */
      emergenciaNaTela?: boolean;
      /**
       * Há um socorro em curso: a contagem da emergência aberta ou um pedido
       * em andamento. Sem o botão de Emergência na tela, a pressão longa não
       * escolhe nada (revisão de UX de 20/10/2026, achado 1).
       */
      socorroEmCurso?: boolean;
      /**
       * O item destacado só aceita aperto curto (o "Sim, parar" do alarme):
       * a pressão longa nunca o escolhe.
       */
      destacadoSoComApertoCurto?: boolean;
    }
  | { tipo: 'apertou'; nowMs: number; soEmergencia?: boolean }
  | { tipo: 'soltou'; nowMs: number; nItens: number };

export type AcaoDaVarredura =
  | { tipo: 'selecionar'; indice: number }
  | { tipo: 'emergencia' }
  | null;

export function criarEstadoDaVarredura(nowMs = 0): EstadoDaVarredura {
  return {
    indice: null, ultimoPassoMs: nowMs, apertadoDesde: null, pressaoLongaAgiu: false, pressaoLongaSemEfeito: false,
    soEmergencia: false, pausadoAte: 0,
  };
}

export function limitarPasso(ms: number | null | undefined): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return PASSO_PADRAO_MS;
  return Math.min(PASSO_MAX_MS, Math.max(PASSO_MIN_MS, Math.round(ms)));
}

/** Avança a varredura em um evento. Puro. */
export function passoDaVarredura(
  e: EstadoDaVarredura,
  ev: EventoDaVarredura,
): { estado: EstadoDaVarredura; acao: AcaoDaVarredura } {
  switch (ev.tipo) {
    case 'tique': {
      // Segurando o acionador: o destaque PARA (quem segura está escolhendo o
      // item atual ou pedindo socorro; andar agora mudaria o que será
      // selecionado no soltar).
      if (e.apertadoDesde !== null) {
        if (!e.pressaoLongaAgiu && ev.nowMs - e.apertadoDesde >= limitarPressaoLonga(ev.pressaoLongaMs)) {
          if (ev.emergenciaNaTela !== false) {
            return { estado: { ...e, pressaoLongaAgiu: true }, acao: { tipo: 'emergencia' } };
          }
          // Socorro em curso (a contagem aberta, o pedido em andamento) ou um
          // item que só aceita aperto curto: segurar NÃO escolhe nada (revisão
          // de UX de 20/10/2026, achado 1). Segurar é o gesto do socorro: quem
          // segurava de novo "para garantir" escolhia o CANCELAR aos 2 s e
          // cancelava o próprio pedido, e dois "segurar" na tela do alarme
          // chegavam ao "Sim, parar". Perder um socorro de verdade é pior que
          // um alarme falso, e o limiar ajustável (1–4 s) já atende quem solta
          // devagar: cancelar e parar o alarme pedem um aperto curto.
          if (ev.socorroEmCurso === true || ev.destacadoSoComApertoCurto === true) {
            return { estado: { ...e, pressaoLongaAgiu: true, pressaoLongaSemEfeito: true }, acao: null };
          }
          // Sem o botão de Emergência na tela, segurar ESCOLHE o destacado, na
          // hora (revisão de UX de 19/10/2026, item 7). Antes virava
          // "emergência" de novo, sem botão para abrir: quem solta devagar
          // abria a contagem sem querer e nunca alcançava o CANCELAR — todo
          // aperto dele era longo —, e o alerta saía em 5 s.
          if (!e.soEmergencia && e.indice !== null && e.indice < ev.nItens) {
            return {
              estado: { ...e, pressaoLongaAgiu: true, indice: null, pausadoAte: ev.nowMs + PAUSA_APOS_SELECAO_MS },
              acao: { tipo: 'selecionar', indice: e.indice },
            };
          }
        }
        return { estado: e, acao: null };
      }
      if (ev.nItens <= 0) return { estado: { ...e, indice: null }, acao: null };
      if (ev.nowMs < e.pausadoAte) return { estado: e, acao: null };
      if (e.indice === null) {
        return { estado: { ...e, indice: 0, ultimoPassoMs: ev.nowMs }, acao: null };
      }
      // A lista pode ter encolhido (a tela mudou): o índice volta para dentro.
      const indice = e.indice >= ev.nItens ? 0 : e.indice;
      if (ev.nowMs - e.ultimoPassoMs < ev.passoMs) return { estado: { ...e, indice }, acao: null };
      return { estado: { ...e, indice: (indice + 1) % ev.nItens, ultimoPassoMs: ev.nowMs }, acao: null };
    }
    case 'apertou': {
      if (e.apertadoDesde !== null) return { estado: e, acao: null }; // repetição de tecla
      return {
        estado: { ...e, apertadoDesde: ev.nowMs, pressaoLongaAgiu: false, pressaoLongaSemEfeito: false, soEmergencia: ev.soEmergencia === true },
        acao: null,
      };
    }
    case 'soltou': {
      if (e.apertadoDesde === null) return { estado: e, acao: null };
      const duracao = ev.nowMs - e.apertadoDesde;
      const base = { ...e, apertadoDesde: null, pressaoLongaAgiu: false, pressaoLongaSemEfeito: false, soEmergencia: false };
      // Segurou além do limiar com o socorro em curso: nada foi escolhido, e o
      // destaque segue de onde estava, com um passo inteiro no item (quem quer
      // cancelar dá o aperto curto ali mesmo).
      if (e.pressaoLongaSemEfeito) return { estado: { ...base, ultimoPassoMs: ev.nowMs }, acao: null };
      // A pressão longa já agiu (emergência ou escolha): soltar não seleciona
      // nada, e a volta recomeça depois da pausa de sempre, contada daqui.
      if (e.pressaoLongaAgiu) return { estado: { ...base, indice: null, pausadoAte: ev.nowMs + PAUSA_APOS_SELECAO_MS }, acao: null };
      // Aperto que só podia chamar a emergência: soltar não escolhe nada.
      if (e.soEmergencia) return { estado: base, acao: null };
      if (duracao < APERTO_MINIMO_MS) return { estado: base, acao: null };
      if (e.indice === null || ev.nItens <= 0 || e.indice >= ev.nItens) return { estado: base, acao: null };
      return {
        estado: { ...base, indice: null, pausadoAte: ev.nowMs + PAUSA_APOS_SELECAO_MS },
        acao: { tipo: 'selecionar', indice: e.indice },
      };
    }
  }
}

/** Como o acionador chega ao computador: uma tecla (`KeyboardEvent.code`) ou um botão do mouse. */
export type EntradaDoAcionador = { tipo: 'tecla'; codigo: string } | { tipo: 'mouse'; botao: number };

/** Sem configuração, vale o que os acionadores USB mandam de fábrica: Espaço e Enter. */
export const ACIONADORES_PADRAO: EntradaDoAcionador[] = [
  { tipo: 'tecla', codigo: 'Space' },
  { tipo: 'tecla', codigo: 'Enter' },
  { tipo: 'tecla', codigo: 'NumpadEnter' },
];

/** Teclas que nunca viram acionador (navegação e saída do cuidador). */
const TECLAS_RESERVADAS = new Set(['Escape', 'Tab', 'F11', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

export function teclaPodeSerAcionador(codigo: string): boolean {
  return !!codigo && !TECLAS_RESERVADAS.has(codigo);
}

export function ehDoAcionador(
  configurado: EntradaDoAcionador | null | undefined,
  ev: { tipo: 'tecla'; codigo: string } | { tipo: 'mouse'; botao: number },
): boolean {
  const lista = configurado ? [configurado] : ACIONADORES_PADRAO;
  return lista.some((a) => (a.tipo === 'tecla' && ev.tipo === 'tecla' ? a.codigo === ev.codigo : a.tipo === 'mouse' && ev.tipo === 'mouse' ? a.botao === ev.botao : false));
}

/** Nome do acionador para a tela de Configurações. */
export function nomeDoAcionador(a: EntradaDoAcionador | null | undefined): string {
  if (!a) return 'Espaço ou Enter (padrão dos acionadores USB)';
  if (a.tipo === 'mouse') return a.botao === 0 ? 'Clique esquerdo' : a.botao === 2 ? 'Clique direito' : `Botão ${a.botao + 1} do mouse`;
  const nomes: Record<string, string> = { Space: 'Espaço', Enter: 'Enter', NumpadEnter: 'Enter do teclado numérico' };
  return nomes[a.codigo] ?? a.codigo.replace(/^Key/, '').replace(/^Digit/, '');
}
