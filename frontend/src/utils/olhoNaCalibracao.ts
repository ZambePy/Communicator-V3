// O ramo ocular (EyeNet) na tela de calibração.
//
// A EyeNet carrega em paralelo com a rede do rosto, mas a tela só esperava a
// L2CS. Com a rede do rosto desligada (`?ep=off&olho=onnx`, a EyeNet no lugar
// da L2CS-Net), nada esperava a EyeNet: a calibração podia começar com o
// bloco do olho zerado — e, se a EyeNet não carregasse, medir só a íris sob o
// rótulo do ramo ocular, sem nenhum aviso.

/** `livre`: pode calibrar. `aguardando`: a EyeNet ainda carrega. `falhou`: não carregou. */
export type OlhoNaCalibracao = 'livre' | 'aguardando' | 'falhou';

/**
 * @param eyeNet a flag `eyeNet` em vigor (`'off'` = ramo desligado).
 * @param status `getDiagnostics().olho.status` do engine; `null` antes de o
 *   engine existir.
 */
export function olhoNaCalibracao(eyeNet: string, status: string | null | undefined): OlhoNaCalibracao {
  if (eyeNet === 'off') return 'livre';
  if (status === 'pronto') return 'livre';
  if (status === 'erro') return 'falhou';
  return 'aguardando';
}
