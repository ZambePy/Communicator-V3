// Modo de teste local (`npm run teste-local`): o app sem nuvem, sem conta e sem
// termo, para calibrar e medir direto no navegador.
//
// Só existe no build feito com `--mode teste-local`, que o comando gera numa
// pasta própria (`frontend/dist-teste-local`) e serve com o `vite preview`. É o
// build de PRODUÇÃO, como o do instalador: o servidor de desenvolvimento (React
// em modo dev, módulos sem empacotar) disputa a thread principal com o MediaPipe
// e deixa o cursor e a medição piores do que o produto de verdade.
//
// O Vite troca `import.meta.env.MODE` pelo texto do modo na compilação. No build
// do instalador ele vale `'production'` e esta função compila para
// `return false` (conferido no pacote gerado em 06/11/2026): nenhum instalador
// ou site liga o modo — nem com a URL, nem com o storage.
//
// Lido na hora (e não guardado numa constante) para os testes poderem trocar o
// modo com `vi.stubEnv`.

export function modoTesteLocal(): boolean {
  return import.meta.env.MODE === 'teste-local';
}

/** A conta (só de nome) do modo de teste local: no termo e na licença em memória. */
export const EMAIL_DO_TESTE_LOCAL = 'teste-local@irisflow.local';

/**
 * Porta do `vite preview` do teste local (`--strictPort` no `package.json`).
 * Fica fora da 4173 do build de medição: cada porta é uma origem, com o próprio
 * localStorage, e o termo, o paciente "Teste local" e as flags gravadas pela
 * URL não passam de um para o outro.
 */
export const PORTA_DO_TESTE_LOCAL = 4180;
