/**
 * Varredura FALADA do Plano B (rodada 3, 21/10/2026): a voz do computador diz o
 * nome do botão destacado, baixinho, a cada passo da varredura por acionador.
 * Quem enxerga mal, ou está cansado demais para ler a tela, ouve o que o
 * acionador vai escolher antes de apertar.
 *
 * Este módulo é só a parte que decide O QUE e QUANDO falar. A volta, o destaque
 * e o DOM continuam em `components/VarreduraComAcionador.tsx`; a voz, em
 * `services/voz/sistema.ts`.
 *
 * O cuidado central: a voz do computador começa SEMPRE com
 * `speechSynthesis.cancel()`, que corta qualquer fala em curso — a frase do
 * paciente, o alarme do pedido de socorro, a mensagem que o cuidador mandou. A
 * varredura falada não pode ser a coisa que corta o único jeito de falar de
 * quem a usa. Por isso, enquanto qualquer um desses falar:
 *  - não anuncia, e o anúncio não fica na fila para depois (sairia por cima do
 *    fim da frase, ou atrasado demais para o botão que já passou);
 *  - nem corta o PRÓPRIO anúncio quando o destaque some, porque o `cancel()`
 *    não escolhe de quem é a fala. É o caso da escolha: o clique faz o paciente
 *    falar e, no mesmo tique, o destaque é apagado.
 */

import {
  falarComVozDoSistemaComDesfecho, falaPrioritariaEmCurso, pararVozDoSistema,
  type DesfechoDaVozDoSistema, type OpcoesDaVozDoSistema,
} from '../voz/sistema';
import { pacienteFalando } from '../voz/falaEmCurso';
import { emergenciaPorFonte } from '../estadoDeEmergencia';

/**
 * Volume do anúncio (0–1). Baixo de propósito: é um sussurro de apoio por cima
 * do silêncio da sala, que não deve competir com a voz do paciente (volume
 * cheio) nem com o alarme.
 */
export const VOLUME_DA_VARREDURA_FALADA = 0.35;
/** Um pouco mais ligeiro que a voz de aviso comum (0,9): o passo da varredura é curto. */
export const RITMO_DA_VARREDURA_FALADA = 1;

/** Um botão com texto comprido é anunciado só no começo: o passo seguinte vem em ~1–2 s. */
export const LIMITE_DO_ROTULO = 100;
/** Botão sem texto e sem nome acessível: a voz diz isso, em vez de calar e parecer travada. */
export const ROTULO_SEM_NOME = 'botão sem nome';

/**
 * Quanto se espera um anúncio COMEÇAR a soar antes de contá-lo como silêncio.
 * Acordar o sintetizador do Windows leva perto de um segundo. A voz do sistema
 * só dá um anúncio por "não começou" depois de 5 s (`PRAZO_PARA_COMECAR_MS`),
 * mas o passo da varredura (a partir de 1 s) o troca bem antes disso — daí o
 * relógio próprio.
 */
export const ESPERA_PARA_COMECAR_MS = 2_000;
/** Silêncios seguidos até a faixa avisar o cuidador (um só, por acaso, não avisa). */
export const FALHAS_SEGUIDAS_PARA_AVISAR = 3;
/** O console recebe o aviso no máximo uma vez por minuto. */
export const INTERVALO_DO_AVISO_NO_CONSOLE_MS = 60_000;

// ---------------------------------------------------------------------------
// O nome do botão.
// ---------------------------------------------------------------------------

const limpar = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();

/**
 * Os botões do app separam nomes com "·" ("Sim · Não"). Uma voz de computador
 * lê o ponto médio como "ponto", "ponto médio" ou nada, conforme a voz; uma
 * vírgula vira sempre uma pausa curta, que é o que o separador quer dizer.
 */
function paraFala(t: string): string {
  return t
    .replace(/\s*[·•|]\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '');
}

function limitar(t: string): string {
  if (t.length <= LIMITE_DO_ROTULO) return t;
  const corte = t.slice(0, LIMITE_DO_ROTULO);
  const ultimoEspaco = corte.lastIndexOf(' ');
  // Numa palavra inteira, a não ser que a primeira palavra já seja enorme.
  return (ultimoEspaco > LIMITE_DO_ROTULO / 2 ? corte.slice(0, ultimoEspaco) : corte).trim();
}

/**
 * O que a voz diz para um item da varredura: o nome acessível (`aria-label`,
 * `aria-labelledby`), senão o texto visível, senão `title`, o `alt` de uma
 * imagem ou o `placeholder` de um campo. Vazio quando não há nome nenhum.
 */
export function rotuloDoItem(item: Element): string {
  const doc = item.ownerDocument;
  const referenciados = limpar(
    (item.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => limpar(doc.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(' '),
  );
  const rotulo =
    limpar(item.getAttribute('aria-label'))
    || referenciados
    || limpar(item.textContent)
    || limpar(item.getAttribute('title'))
    || limpar(item.querySelector('img[alt]')?.getAttribute('alt'))
    || limpar(item.getAttribute('placeholder'));
  return limitar(paraFala(rotulo));
}

// ---------------------------------------------------------------------------
// Quem está falando.
// ---------------------------------------------------------------------------

/** Quem a varredura falada não pode cortar. */
export type QuemFala = 'paciente' | 'cuidador' | 'socorro';

/**
 * Há uma fala que não é da varredura em curso? O paciente (a frase dele, a
 * mensagem guardada, a espera pela voz clonada), a mensagem do cuidador sendo
 * lida, ou o pedido de socorro em andamento (o alarme fala de tempos em tempos).
 *
 * A contagem aberta (`confirmacao`) e a tela de escolha da emergência (`tela`)
 * NÃO entram: lá só há bipes, e ouvir "CANCELAR" ajuda.
 */
export function quemEstaFalando(): QuemFala | null {
  if (pacienteFalando()) return 'paciente';
  if (falaPrioritariaEmCurso()) return 'cuidador';
  if (emergenciaPorFonte('pedido')) return 'socorro';
  return null;
}

// ---------------------------------------------------------------------------
// O anunciador.
// ---------------------------------------------------------------------------

export interface DependenciasDoAnunciador {
  /** A voz do sistema (troca-se nos testes). */
  falar: (texto: string, opcoes: OpcoesDaVozDoSistema) => Promise<DesfechoDaVozDoSistema>;
  /** Corta a fala em curso (`speechSynthesis.cancel()`). */
  parar: () => void;
  /** A voz do computador não está respondendo (`true`, com o motivo) ou voltou (`false`). */
  aoMudarSemSom: (semSom: boolean, motivo?: string) => void;
}

export interface AnunciadorDaVarredura {
  /**
   * O item destacado AGORA (ou `null`, sem destaque). Chamado a cada tique da
   * varredura: só age quando o item muda.
   */
  destacar: (item: Element | null) => void;
  /** A varredura parou (desligada, desmontada): corta o anúncio que ainda toca e solta os relógios. */
  encerrar: () => void;
}

interface Anuncio {
  comecou: boolean;
  /** A voz já respondeu (falou, foi cortada ou falhou) — ou nós a cortamos. */
  terminou: boolean;
  /** Já entrou na contagem de silêncios (um anúncio conta uma vez só). */
  contado: boolean;
  relogio: ReturnType<typeof setTimeout> | null;
}

let ultimoAvisoNoConsole = -Infinity;

function avisarNoConsole(motivo: string): void {
  const agora = Date.now();
  if (agora - ultimoAvisoNoConsole < INTERVALO_DO_AVISO_NO_CONSOLE_MS) return;
  ultimoAvisoNoConsole = agora;
  console.warn(`[varredura-falada] a voz do computador não respondeu (${motivo}); a faixa da varredura avisa o cuidador.`);
}

export function criarAnunciadorDaVarredura(deps: Partial<DependenciasDoAnunciador> = {}): AnunciadorDaVarredura {
  const falar = deps.falar ?? falarComVozDoSistemaComDesfecho;
  const parar = deps.parar ?? pararVozDoSistema;
  const aoMudarSemSom = deps.aoMudarSemSom ?? (() => {});

  let ultimo: Element | null = null;
  let atual: Anuncio | null = null;
  let encerrado = false;
  let semSom = false;
  let falhasSeguidas = 0;

  const limparRelogio = (a: Anuncio) => {
    if (a.relogio !== null) {
      clearTimeout(a.relogio);
      a.relogio = null;
    }
  };
  const relogiosPendentes = new Set<Anuncio>();

  /** A voz soou: zera a contagem de silêncios e apaga o aviso, se estava aceso. */
  const registrarSom = () => {
    falhasSeguidas = 0;
    if (semSom && !encerrado) {
      semSom = false;
      aoMudarSemSom(false);
    }
  };

  /** Um silêncio. `imediata`: sem voz instalada, que não precisa de três para ser verdade. */
  const registrarSilencio = (a: Anuncio, motivo: string, imediata = false) => {
    if (encerrado || a.contado) return;
    a.contado = true;
    falhasSeguidas++;
    if (!imediata && falhasSeguidas < FALHAS_SEGUIDAS_PARA_AVISAR) return;
    if (semSom) return;
    semSom = true;
    aoMudarSemSom(true, motivo);
    avisarNoConsole(motivo);
  };

  /** Corta o anúncio nosso que ainda toca — se a fala em curso for mesmo a nossa. */
  const calarSeForMeu = () => {
    if (atual === null || atual.terminou) return;
    // O `cancel()` não escolhe de quem é a fala: com o paciente, o cuidador ou o
    // alarme falando, o nosso anúncio já foi cortado por eles, e cortar de novo
    // seria cortar a fala deles.
    if (quemEstaFalando() !== null) return;
    atual.terminou = true;
    parar();
  };

  const anunciar = (texto: string) => {
    const anuncio: Anuncio = { comecou: false, terminou: false, contado: false, relogio: null };
    atual = anuncio;
    anuncio.relogio = setTimeout(() => {
      anuncio.relogio = null;
      relogiosPendentes.delete(anuncio);
      if (!anuncio.comecou) registrarSilencio(anuncio, 'nao_comecou');
    }, ESPERA_PARA_COMECAR_MS);
    relogiosPendentes.add(anuncio);

    const aoComecar = () => {
      anuncio.comecou = true;
      limparRelogio(anuncio);
      relogiosPendentes.delete(anuncio);
      registrarSom();
    };

    let resposta: Promise<DesfechoDaVozDoSistema>;
    try {
      resposta = falar(texto, { volume: VOLUME_DA_VARREDURA_FALADA, rate: RITMO_DA_VARREDURA_FALADA, aoComecar });
    } catch (e) {
      resposta = Promise.reject(e);
    }
    resposta.then(
      (d) => {
        anuncio.terminou = true;
        if (d.falou) {
          aoComecar();
          return;
        }
        // Cortado pelo passo seguinte (ou por outra voz): não é defeito da voz.
        if (d.motivo === 'interrompida') return;
        registrarSilencio(anuncio, d.motivo, d.motivo === 'sem_voz');
      },
      () => {
        anuncio.terminou = true;
        registrarSilencio(anuncio, 'erro');
      },
    );
  };

  return {
    destacar(item) {
      if (encerrado || item === ultimo) return;
      ultimo = item;
      if (item === null) {
        calarSeForMeu();
        return;
      }
      // Sem fila: um anúncio atrasado sairia por cima do fim da frase do
      // paciente. O passo seguinte volta a falar.
      if (quemEstaFalando() !== null) return;
      anunciar(rotuloDoItem(item) || ROTULO_SEM_NOME);
    },

    encerrar() {
      if (encerrado) return;
      calarSeForMeu();
      encerrado = true;
      ultimo = null;
      for (const a of relogiosPendentes) limparRelogio(a);
      relogiosPendentes.clear();
    },
  };
}

/** Só para testes: libera o limite do aviso no console. */
export function _reiniciarAvisosDaVarreduraFalada(): void {
  ultimoAvisoNoConsole = -Infinity;
}
