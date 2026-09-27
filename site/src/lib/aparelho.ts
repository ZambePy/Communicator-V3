/** Leituras do aparelho do visitante, isoladas para os testes trocarem. */

function ua(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent ?? ''
}

/** iPhone, iPad (inclusive o iPadOS que se diz "Macintosh") ou iPod. */
export function ehIOS(): boolean {
  const u = ua()
  if (/iPhone|iPad|iPod/i.test(u)) return true
  return /Macintosh/i.test(u) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1
}

export function ehAndroid(): boolean {
  return /Android/i.test(ua())
}

/** Celular ou tablet: onde o IrisFlow Communicator não instala. */
export function ehCelular(): boolean {
  return ehIOS() || ehAndroid()
}
