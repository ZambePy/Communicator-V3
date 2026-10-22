/**
 * "O paciente está falando agora" — um sinal de módulo, minúsculo (rodada 3,
 * 21/10/2026).
 *
 * Existe para a varredura falada do Plano B (`services/interaction/varreduraFalada`):
 * ela anuncia cada botão destacado com a voz do computador, e a voz do
 * computador começa SEMPRE com `speechSynthesis.cancel()`, que corta qualquer
 * fala em curso. Sem saber que o paciente está falando, o anúncio do botão
 * seguinte cortaria a frase dele no meio — a pior coisa que a varredura poderia
 * fazer a quem só tem esse jeito de falar.
 *
 * A marca vale do instante em que a fala é pedida até ela acabar — inclusive a
 * espera pela voz clonada (até 4 s sem som nenhum) e a leitura da gravação do
 * disco —, porque é nesse silêncio que um anúncio entraria por baixo e as duas
 * vozes sairiam juntas. Quem marca são os dois caminhos da fala do paciente:
 * `falar()` (`services/voz/index.ts`) e `tocarMensagemGuardada`
 * (`services/voz/vozGuardada/tocar.ts`).
 *
 * Fica num módulo próprio, sem importar nada, para ninguém precisar da voz do
 * sistema só para perguntar isto (os testes de `index.ts` trocam `./sistema` e
 * `./local` por falsos).
 */

/**
 * Teto de segurança de cada marca. Se uma fala nunca avisar o fim — o motor de
 * voz que não responde ao IPC, um áudio que nunca decodifica —, a marca cairia
 * só quando a tela fechasse, e a varredura falada ficaria muda pelo resto da
 * sessão sem ninguém saber por quê. Noventa segundos cobrem com folga a frase
 * mais longa que alguém digita; passado isso, a marca é solta e o console diz.
 */
export const TETO_DA_MARCA_MS = 90_000;

/** Uma marca por fala em curso, com o relógio do teto de cada uma. */
const marcas = new Map<symbol, ReturnType<typeof setTimeout>>();

/** O console recebe o aviso do teto no máximo uma vez por minuto. */
const INTERVALO_DO_AVISO_MS = 60_000;
let ultimoAviso = -Infinity;

/** Há uma fala do paciente (ou a espera por ela) em curso agora? */
export function pacienteFalando(): boolean {
  return marcas.size > 0;
}

/**
 * Marca uma fala do paciente e devolve quem a solta. Soltar duas vezes, ou
 * depois de o teto já ter soltado, não desconta a marca de outra fala.
 */
export function marcarFalaDoPaciente(): () => void {
  const marca = Symbol('fala-do-paciente');
  const teto = setTimeout(() => {
    if (!marcas.delete(marca)) return;
    const agora = Date.now();
    if (agora - ultimoAviso < INTERVALO_DO_AVISO_MS) return;
    ultimoAviso = agora;
    console.warn(
      `[voz] uma fala do paciente não avisou o fim em ${TETO_DA_MARCA_MS / 1000} s; a marca foi solta e a varredura falada volta a falar.`,
    );
  }, TETO_DA_MARCA_MS);
  marcas.set(marca, teto);
  return () => {
    const relogio = marcas.get(marca);
    if (relogio === undefined) return;
    clearTimeout(relogio);
    marcas.delete(marca);
  };
}

/**
 * Roda `fala` com a marca ligada, do instante da chamada (síncrono: o anúncio
 * de um botão pode vir no mesmo tique em que o paciente escolheu a frase) até
 * ela terminar — com sucesso ou com erro.
 */
export async function comAFalaDoPacienteMarcada<T>(fala: () => Promise<T>): Promise<T> {
  const soltar = marcarFalaDoPaciente();
  try {
    return await fala();
  } finally {
    soltar();
  }
}

/** Só para testes: solta todas as marcas. */
export function _reiniciarFalaEmCurso(): void {
  for (const relogio of marcas.values()) clearTimeout(relogio);
  marcas.clear();
  ultimoAviso = -Infinity;
}
