// Abertura do processo principal: o que NÃO pode impedir a janela de abrir.
//
// Sem dependência do Electron, para ser testado por unidade (como
// `electronSecurity.ts`).

/**
 * Registra um recurso OPCIONAL do app (voz, Modo Computador, backup,
 * impressão, atualização) sem poder derrubar a abertura.
 *
 * Revisão final de 22/10/2026: os registros rodavam em fila dentro do
 * `app.whenReady()`, antes de `createWindow()`. Se um deles lançasse (pasta
 * `voz/` sem permissão de escrita, disco cheio, antivírus segurando o
 * arquivo), a promessa do `whenReady` rejeitava e a janela NUNCA abria: o app
 * seguia vivo e invisível, e a instância única impedia abrir outro. Uma
 * ferramenta secundária indisponível não pode tirar do paciente o comunicador.
 *
 * Devolve o que o registro devolveu, ou `undefined` se ele lançou (e então
 * `aoFalhar` recebe o nome e o erro, uma vez). `aoFalhar` que lança também é
 * engolido: o aviso não pode ser o novo motivo da janela não abrir.
 */
export function registrarSemDerrubar<T>(
  nome: string,
  registrar: () => T,
  aoFalhar: (nome: string, erro: unknown) => void,
): T | undefined {
  try {
    return registrar();
  } catch (erro) {
    try {
      aoFalhar(nome, erro);
    } catch { /* ver acima */ }
    return undefined;
  }
}
