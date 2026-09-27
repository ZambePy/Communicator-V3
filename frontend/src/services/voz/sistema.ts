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
}

let prioritariasEmCurso = 0;

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
 * Fala `texto` e resolve `true` quando a fala terminou — ou quando o Chromium
 * esqueceu de avisar e o teto por tamanho venceu. Resolve `false` quando NÃO
 * falou: sem voz no sistema, texto vazio, ou a fala foi interrompida ou deu
 * erro. Quem confirma ao cuidador que a mensagem foi ouvida (`message.spoken`)
 * só confirma com `true` — antes a interrupção pelo alarme contava como
 * falada.
 */
export function falarComVozDoSistema(texto: string, opcoes: OpcoesDaVozDoSistema = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!vozDoSistemaDisponivel() || !texto.trim()) { resolve(false); return; }
    let terminou = false;
    const fim = (falou: boolean) => {
      if (terminou) return;
      terminou = true;
      if (opcoes.prioritaria) prioritariasEmCurso = Math.max(0, prioritariasEmCurso - 1);
      resolve(falou);
    };
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = opcoes.lang ?? 'pt-BR';
      u.rate = opcoes.rate ?? 0.9;
      if (opcoes.pitch !== undefined) u.pitch = opcoes.pitch;
      if (opcoes.volume !== undefined) u.volume = opcoes.volume;
      if (opcoes.prioritaria) prioritariasEmCurso++;
      u.onend = () => fim(true);
      u.onerror = () => fim(false);
      window.speechSynthesis.speak(u);
      setTimeout(() => fim(true), Math.min(20_000, 2_000 + texto.length * 80));
    } catch {
      fim(false);
    }
  });
}
