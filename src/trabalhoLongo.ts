/**
 * Aviso de trabalho SÍNCRONO longo na thread da página (revisão de segurança
 * de 19/10/2026).
 *
 * O treino da calibração e o diagnóstico leave-one-target-out travam a thread
 * por ~13 s no PC de referência — e a recoleta dos alvos ruins (M22) treina de
 * novo. O limite do vigia de página travada é 30 s (`src/vigiaDoRenderer.ts`):
 * num computador 2,5× mais lento, o vigia derrubaria a página no meio do
 * resultado da calibração. Quem treina avisa aqui ANTES de começar; a batida do
 * renderer (`frontend/src/services/batidaDoRenderer.ts`) desarma o vigia, e a
 * próxima volta do laço do rastreador o arma de novo. A saída do rastreamento
 * não muda.
 */

type Ouvinte = () => void;

const ouvintes = new Set<Ouvinte>();

/** Ouve os avisos de trabalho longo. Devolve a função que para de ouvir. */
export function ouvirTrabalhoLongo(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

/** Avisa que um trabalho síncrono longo vai começar agora. Nunca lança. */
export function avisarTrabalhoLongo(): void {
  for (const cb of ouvintes) {
    try {
      cb();
    } catch (e) {
      console.warn('[vigia] ouvinte do trabalho longo falhou', e);
    }
  }
}
