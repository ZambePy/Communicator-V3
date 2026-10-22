/**
 * Voz do SISTEMA (`speechSynthesis` do Chromium/Windows).
 *
 * É a voz de reserva de tudo: sem plano Voz, sem voz importada, motor
 * ocupado ou fora do ar, ela fala. Uma promessa que resolve quando a fala
 * termina (ou quando o Chromium esquece de avisar — há um teto por tamanho
 * do texto, senão `message.spoken` para o cuidador nunca sairia).
 */

export interface OpcoesDaVozDoSistema {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
  /**
   * Fala que não pode ser cortada por avisos repetitivos (a mensagem do
   * cuidador): enquanto ela toca, `falaPrioritariaEmCurso()` é verdadeiro, e o
   * alarme da emergência espera em vez de dar `cancel()` por cima (FE-5).
   */
  prioritaria?: boolean;
  /** Chamado quando o som começa de fato (`onstart`). */
  aoComecar?: () => void;
  /**
   * Para SÓ esta fala quando o sinal é abortado (revisão final, rodada 1, M2,
   * 21/10/2026): a pergunta do cuidador sai da frente quando a Emergência abre, e
   * a fala prioritária dela seguia por até 120 s, com o alarme esperando atrás.
   * Abortar solta a marca prioritária, para o sintetizador e resolve com
   * `interrompida`. Se a fala já acabou (ou outra a cortou), o sinal não toca em
   * nada — não corta a fala de outro. `speechSynthesis.cancel()` esvazia a fila
   * toda: o sinal serve a quem fala sozinho, não a quem enfileira atrás de outro.
   */
  sinal?: AbortSignal;
}

/** Por que a voz do sistema não falou. */
export type MotivoDoSilencio =
  /** Sem `speechSynthesis` neste ambiente. */
  | 'sem_voz'
  /** Texto vazio. */
  | 'texto'
  /** Outra fala (ou o alarme) cancelou esta — não é defeito da voz. */
  | 'interrompida'
  /** O sintetizador devolveu erro. */
  | 'erro'
  /** Nem começou dentro do prazo: sintetizador travado, ou sem nenhuma voz instalada. */
  | 'nao_comecou';

export type DesfechoDaVozDoSistema = { falou: true } | { falou: false; motivo: MotivoDoSilencio };

let prioritariasEmCurso = 0;

/**
 * Falas em curso, guardadas até o fim. O Chromium pode recolher pelo coletor
 * de lixo um `SpeechSynthesisUtterance` que ninguém mais referencia, e aí
 * `onstart`/`onend` nunca chegam — é uma das razões conhecidas para "o
 * Chromium esqueceu de avisar".
 */
const emCurso = new Set<SpeechSynthesisUtterance>();

/**
 * Quanto se espera a fala COMEÇAR antes de dizer que ela não saiu. Acordar o
 * sintetizador do Windows pela primeira vez leva perto de um segundo; cinco
 * dão folga sem deixar o cuidador sem resposta.
 */
export const PRAZO_PARA_COMECAR_MS = 5_000;

/** Teto da fala por tamanho do texto: passado ele, sem `onend`, a fala é dada como terminada SE começou. */
export function tetoDaFalaMs(texto: string): number {
  return Math.min(20_000, 2_000 + texto.length * 80);
}

/**
 * Teto de SEGURANÇA da marca de fala prioritária, contado a partir do
 * `onstart`. Maior que o da resposta (o dobro do ritmo por caractere, com
 * folga), porque cobre só o caso de o Chromium não mandar nem `onend` nem
 * `onerror`: sem ele, o alarme da emergência ficaria calado para sempre
 * esperando uma fala que já acabou. Os bipes do alarme não dependem desta
 * marca — só a frase falada dele espera.
 */
export function tetoDaPrioridadeMs(texto: string): number {
  return Math.min(120_000, 5_000 + texto.length * 160);
}

/** Há uma fala prioritária (mensagem do cuidador) tocando agora? */
export function falaPrioritariaEmCurso(): boolean {
  return prioritariasEmCurso > 0;
}

export function vozDoSistemaDisponivel(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function pararVozDoSistema(): void {
  if (!vozDoSistemaDisponivel()) return;
  try {
    window.speechSynthesis.cancel();
  } catch { /* nada a parar */ }
}

/**
 * Fala `texto` e diz o que aconteceu.
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 9): o teto por
 * tamanho resolvia `true` mesmo quando a fala nem tinha começado — sistema sem
 * voz instalada, sintetizador travado — e o celular do cuidador recebia
 * "ouvida". E a marca de fala prioritária caía nesse mesmo teto (20 s), antes
 * do fim de uma mensagem longa: o alarme voltava a dar `cancel()` por cima da
 * resposta do cuidador. Agora:
 *   - `onstart` registra que a fala começou; no teto, ela só conta como falada
 *     se começou (o Chromium às vezes esquece o `onend`);
 *   - sem começar em `PRAZO_PARA_COMECAR_MS` (ou no teto, o que for maior), não
 *     falou;
 *   - a marca prioritária só cai em `onend`/`onerror`, com um teto de segurança
 *     maior contado do `onstart` — e cai junto se a fala nunca começou, porque
 *     aí não há o que proteger.
 */
export function falarComVozDoSistemaComDesfecho(
  texto: string,
  opcoes: OpcoesDaVozDoSistema = {},
): Promise<DesfechoDaVozDoSistema> {
  return new Promise((resolve) => {
    if (!vozDoSistemaDisponivel()) { resolve({ falou: false, motivo: 'sem_voz' }); return; }
    if (!texto.trim()) { resolve({ falou: false, motivo: 'texto' }); return; }
    let iniciou = false;
    let resolvida = false;
    let marcaPrioritaria = false;
    let timerDoTeto: ReturnType<typeof setTimeout> | null = null;
    let timerDeSeguranca: ReturnType<typeof setTimeout> | null = null;
    let u: SpeechSynthesisUtterance | null = null;
    const sinal = opcoes.sinal;
    // Já abortado antes de começar: nada a dizer, e nada a cortar.
    if (sinal?.aborted) { resolve({ falou: false, motivo: 'interrompida' }); return; }

    const responder = (d: DesfechoDaVozDoSistema) => {
      if (resolvida) return;
      resolvida = true;
      if (timerDoTeto !== null) {
        clearTimeout(timerDoTeto);
        timerDoTeto = null;
      }
      sinal?.removeEventListener('abort', aoAbortar);
      resolve(d);
    };
    /** O sinal abortou: para ESTA fala, se ela ainda é uma fala em curso. */
    function aoAbortar(): void {
      if (resolvida) return;
      encerrar();
      responder({ falou: false, motivo: 'interrompida' });
      try { window.speechSynthesis.cancel(); } catch { /* nada a parar */ }
    }
    /**
     * A fala acabou de vez (fim, erro, teto de segurança, ou o prazo sem nada
     * ter começado): solta a marca prioritária e a referência guardada.
     */
    const encerrar = () => {
      if (timerDeSeguranca !== null) {
        clearTimeout(timerDeSeguranca);
        timerDeSeguranca = null;
      }
      if (marcaPrioritaria) {
        marcaPrioritaria = false;
        prioritariasEmCurso = Math.max(0, prioritariasEmCurso - 1);
      }
      if (u) emCurso.delete(u);
    };

    try {
      window.speechSynthesis.cancel();
      u = new SpeechSynthesisUtterance(texto);
      u.lang = opcoes.lang ?? 'pt-BR';
      u.rate = opcoes.rate ?? 0.9;
      if (opcoes.pitch !== undefined) u.pitch = opcoes.pitch;
      if (opcoes.volume !== undefined) u.volume = opcoes.volume;
      if (opcoes.prioritaria) {
        prioritariasEmCurso++;
        marcaPrioritaria = true;
      }
      u.onstart = () => {
        // Já dada como "não saiu" (começou depois do prazo): não acende nada
        // na tela que contradiga o que já foi dito.
        if (iniciou || resolvida) return;
        iniciou = true;
        timerDeSeguranca = setTimeout(() => {
          timerDeSeguranca = null;
          if (marcaPrioritaria) {
            console.warn('[voz] a fala prioritária não avisou o fim; a marca foi solta pelo teto de segurança.');
          }
          encerrar();
        }, tetoDaPrioridadeMs(texto));
        try { opcoes.aoComecar?.(); } catch (e) { console.warn('[voz] aoComecar lançou:', e); }
      };
      u.onend = () => {
        encerrar();
        responder({ falou: true });
      };
      u.onerror = (ev: Event) => {
        encerrar();
        const erro = (ev as Partial<SpeechSynthesisErrorEvent> | undefined)?.error;
        responder({ falou: false, motivo: erro === 'interrupted' || erro === 'canceled' ? 'interrompida' : 'erro' });
      };
      emCurso.add(u);
      sinal?.addEventListener('abort', aoAbortar, { once: true });
      window.speechSynthesis.speak(u);
      timerDoTeto = setTimeout(() => {
        timerDoTeto = null;
        if (iniciou) {
          // Começou e o Chromium não avisou o fim: conta como falada. A marca
          // prioritária continua até `onend`/`onerror` ou o teto de segurança.
          responder({ falou: true });
          return;
        }
        // Nunca começou: "ouvida" seria mentira, e não há fala a proteger.
        encerrar();
        responder({ falou: false, motivo: 'nao_comecou' });
      }, Math.max(tetoDaFalaMs(texto), PRAZO_PARA_COMECAR_MS));
    } catch {
      encerrar();
      responder({ falou: false, motivo: 'erro' });
    }
  });
}

/**
 * Fala `texto` e resolve `true` quando a fala terminou — ou quando o Chromium
 * esqueceu de avisar o fim de uma fala que COMEÇOU e o teto por tamanho
 * venceu. Resolve `false` quando NÃO falou: sem voz no sistema, texto vazio,
 * a fala nem começou, foi interrompida ou deu erro. Quem confirma ao cuidador
 * que a mensagem foi ouvida (`message.spoken`) só confirma com `true` — antes
 * a interrupção pelo alarme contava como falada.
 */
export function falarComVozDoSistema(texto: string, opcoes: OpcoesDaVozDoSistema = {}): Promise<boolean> {
  return falarComVozDoSistemaComDesfecho(texto, opcoes).then((d) => d.falou);
}

/** Só para testes: zera a marca prioritária e as falas guardadas. */
export function _redefinirVozDoSistema(): void {
  prioritariasEmCurso = 0;
  emCurso.clear();
}
