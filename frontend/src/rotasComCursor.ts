/**
 * Em que telas o cursor de olhar pode aparecer.
 *
 * ## Por que uma regra de rota, e não só "está calibrado?"
 *
 * O `GazeContext` já esconde o cursor quando não há modelo. Isso não basta:
 * um perfil salvo carrega a calibração DELE, então na tela de escolha de
 * paciente `isCalibrated()` já é `true` e o cursor aparece — apontando com o
 * modelo de quem usou o computador por último, antes de alguém dizer quem vai
 * usar agora. É um cursor confiante e errado, na primeira tela que o cuidador
 * vê, e ele não tem como saber que aquilo não vale.
 *
 * O mesmo vale para as telas anteriores a essa: abertura, apresentação, login,
 * consentimento e o preparo. Ali ninguém opera pelo olhar — quem está no
 * comando é o cuidador, com mouse — e um ponto se mexendo na tela só distrai.
 *
 * ## Lista de EXCLUSÃO, não de inclusão
 *
 * De propósito. Se alguém acrescentar uma tela de paciente e esquecer de
 * registrá-la aqui, o cursor aparece onde talvez não precisasse — chato. Com
 * uma lista de inclusão, o mesmo esquecimento tiraria o cursor de uma tela
 * real, e o paciente ficaria sem o único ponteiro que ele tem. Os dois erros
 * não têm o mesmo tamanho.
 */

/**
 * Prefixos de rota em que o cursor NÃO aparece: a jornada até a calibração.
 *
 * `/calibration-check` e `/calibration/...` já estariam cobertos enquanto o
 * engine reporta `calibrating`, mas só DURANTE a coleta — a tela de preparo e
 * a de resultado ficavam de fora. Estão aqui para fechar a sequência inteira.
 */
export const ROTAS_SEM_CURSOR: readonly string[] = [
  '/intro',
  '/login',
  '/activated',
  '/consent',
  '/profiles',
  '/setup',
  '/calibration-check',
  '/calibration',
];

/**
 * Extrai o caminho de um `location.hash` do HashRouter.
 *
 * `'#/menu?x=1'` → `'/menu'`. Hash vazio (a abertura) → `'/'`.
 */
export function caminhoDoHash(hash: string): string {
  const semCerquilha = hash.startsWith('#') ? hash.slice(1) : hash;
  const semQuery = semCerquilha.split(/[?#]/)[0];
  if (semQuery === '' || semQuery === '/') return '/';
  return semQuery.endsWith('/') ? semQuery.slice(0, -1) : semQuery;
}

/** O cursor de olhar pode aparecer nesta rota? */
export function rotaMostraCursor(hashOuCaminho: string): boolean {
  const caminho = caminhoDoHash(hashOuCaminho);
  // A abertura (`/`) é o splash: decide para onde ir e sai sozinha.
  if (caminho === '/') return false;
  return !ROTAS_SEM_CURSOR.some((r) => caminho === r || caminho.startsWith(r + '/'));
}
