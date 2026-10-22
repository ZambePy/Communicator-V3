import { describe, expect, it, vi } from 'vitest'

/* main.tsx: o código do QR (/parear#t=…) sai da barra de endereço antes de o
   app montar — antes do roteador, das estatísticas e de qualquer pedido. */

const montado = vi.hoisted(() => ({ endereco: '' }))

vi.mock('./App', () => ({
  // O que o app veria ao montar.
  default: () => {
    montado.endereco = window.location.pathname + window.location.search + window.location.hash
    return null
  },
}))
vi.mock('./lib/recargaAposDeploy', () => ({ ouvirFalhaDePreCarregamento: () => undefined }))

describe('main.tsx e o código do QR', () => {
  it('guarda o código na memória e o apaga do endereço antes de o app montar', async () => {
    const codigo = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB'
    document.body.innerHTML = '<div id="root"></div>'
    window.history.replaceState(null, '', `/parear#t=${codigo}`)
    await import('./main')
    await vi.waitFor(() => expect(montado.endereco).toBe('/parear'))
    expect(window.location.href).not.toContain(codigo)
    const { codigoCapturado } = await import('./lib/pareamento')
    expect(codigoCapturado()).toBe(codigo)
  })
})
