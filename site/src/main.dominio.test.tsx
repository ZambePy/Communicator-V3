import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Ordem do boot do site (main.tsx), depois de juntar o domínio oficial
   (main, 13/10/2026) com o QR do celular (V2, 19/10/2026):
   1. quem abriu o endereço do Cloudflare Pages vai para o domínio, com o
      fragmento junto, e nada mais roda;
   2. só no domínio o código do QR sai da barra de endereço;
   3. depois, o resto e o React.
   Se a captura viesse antes, o código ficaria preso na memória da aba do
   pages.dev e o QR de um instalador antigo chegaria ao domínio sem ele. */

const h = vi.hoisted(() => ({ ordem: [] as string[], redirecionar: false }))

vi.mock('./seo/hostCanonico', () => ({
  irParaODominioOficial: vi.fn(() => {
    h.ordem.push('domínio')
    return h.redirecionar
  }),
}))
vi.mock('./lib/pareamento', () => ({
  capturarCodigoDoEndereco: vi.fn(() => {
    h.ordem.push('código do QR')
  }),
}))
vi.mock('./lib/recargaAposDeploy', () => ({
  ouvirFalhaDePreCarregamento: vi.fn(() => {
    h.ordem.push('recarga após deploy')
  }),
}))
vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(() => {
      h.ordem.push('React')
    }),
  })),
}))
vi.mock('./App', () => ({ default: () => null }))

describe('boot do site (main.tsx)', () => {
  beforeEach(() => {
    h.ordem.length = 0
    vi.resetModules()
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('no domínio oficial: confere o domínio, tira o código do QR da barra e só então monta', async () => {
    h.redirecionar = false
    await import('./main')
    expect(h.ordem).toEqual(['domínio', 'código do QR', 'recarga após deploy', 'React'])
  })

  it('no endereço do Pages: só redireciona; o código fica no fragmento para o domínio capturar', async () => {
    h.redirecionar = true
    await import('./main')
    expect(h.ordem).toEqual(['domínio'])
  })
})

describe('QR antigo apontando para o pages.dev', () => {
  it('o redirecionamento leva o #t= inteiro, e o domínio lê o mesmo código', async () => {
    const real = await vi.importActual<typeof import('./seo/hostCanonico')>('./seo/hostCanonico')
    const pareamento = await vi.importActual<typeof import('./lib/pareamento')>('./lib/pareamento')
    const codigo = 'A'.repeat(20) + '_-' + 'b9'.repeat(10) + 'z'
    expect(codigo).toMatch(pareamento.FORMATO_DO_CODIGO)

    const destino = real.destinoCanonico(
      `https://irisflow-communicator.pages.dev/parear#t=${codigo}`,
      'https://irisflow.ia.br',
    )
    expect(destino).toBe(`https://irisflow.ia.br/parear#t=${codigo}`)
    const url = new URL(destino!)
    expect(pareamento.lerCodigo(url.hash, url.search)).toBe(codigo)
  })
})
