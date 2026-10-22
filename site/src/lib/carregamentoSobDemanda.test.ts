import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ============================================================
   O supabase-js (216 KB, 57 KB comprimido) não vai no pedaço de entrada
   (auditoria de 21/10/2026, P2-3). Estes testes seguram as três pontas:

   - nenhum arquivo do site o importa de forma estática, fora do
     clienteSupabase.ts (que só é carregado por import());
   - as leituras públicas (programa beta, planos) vão direto ao REST, com
     tempo limite;
   - o cliente só é carregado quando há motivo (sessão guardada, link de
     e-mail com tokens, ou alguém o pediu).
   ============================================================ */

function arquivosDeCodigo(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosDeCodigo(caminho)
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : []
  })
}

describe('import estático do supabase-js', () => {
  it('só o clienteSupabase.ts importa o pacote de verdade (os demais, no máximo o tipo)', () => {
    const raiz = path.resolve(__dirname, '..')
    const infratores = arquivosDeCodigo(raiz).filter((arquivo) => {
      if (arquivo.endsWith(path.join('lib', 'clienteSupabase.ts'))) return false
      const texto = readFileSync(arquivo, 'utf8')
      return texto
        .split('\n')
        .some((linha) => /from\s+['"]@supabase\/supabase-js['"]/.test(linha) && !/^\s*import\s+type\b/.test(linha))
    })
    expect(infratores.map((a) => path.relative(raiz, a))).toEqual([])
  })
})

describe('lerLinhasPublicas (REST direto, sem o supabase-js)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('pede a tabela com a chave anônima e devolve as linhas', async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify([{ id: 'essencial' }]), { status: 200 }))
    vi.stubGlobal('fetch', fetchFalso)
    const { lerLinhasPublicas } = await import('./leituraPublica')

    const linhas = await lerLinhasPublicas('plans', { select: 'id', active: 'eq.true' })

    expect(linhas).toEqual([{ id: 'essencial' }])
    const [url, opcoes] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://abc.supabase.co/rest/v1/plans?select=id&active=eq.true')
    expect(opcoes.headers).toMatchObject({ apikey: 'chave-anon', Authorization: 'Bearer chave-anon' })
  })

  it('rejeita resposta de erro, corpo que não é lista e build sem configuração', async () => {
    const { lerLinhasPublicas } = await import('./leituraPublica')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await expect(lerLinhasPublicas('plans', {})).rejects.toThrow(/401/)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"x"}', { status: 200 })))
    await expect(lerLinhasPublicas('plans', {})).rejects.toThrow(/inesperada/)

    vi.stubEnv('VITE_SUPABASE_URL', '')
    await expect(lerLinhasPublicas('plans', {})).rejects.toThrow(/configuração/)
  })

  it('banco pendurado: aborta no tempo limite em vez de esperar para sempre', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, opcoes: RequestInit) =>
          new Promise((_ok, falha) => {
            opcoes.signal?.addEventListener('abort', () => falha(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )
    const { lerLinhasPublicas } = await import('./leituraPublica')

    const pedido = lerLinhasPublicas('beta_program', {}, 4000)
    const resultado = expect(pedido).rejects.toThrow('aborted')
    await vi.advanceTimersByTimeAsync(4001)
    await resultado
  })
})

describe('obterCliente e haSessaoGuardada', () => {
  const criarCliente = vi.fn(() => ({ auth: {} }))

  beforeEach(() => {
    vi.resetModules()
    criarCliente.mockClear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon')
    vi.doMock('./clienteSupabase', () => ({ criarCliente }))
    window.localStorage.clear()
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    vi.doUnmock('./clienteSupabase')
    vi.unstubAllEnvs()
    window.localStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('importar lib/supabase não carrega o cliente', async () => {
    await import('./supabase')
    expect(criarCliente).not.toHaveBeenCalled()
  })

  it('o cliente é criado uma vez, na primeira chamada, e quem esperava é avisado', async () => {
    const m = await import('./supabase')
    const avisado = vi.fn()
    m.aoCarregarCliente(avisado)

    const [a, b] = await Promise.all([m.obterCliente(), m.obterCliente()])

    expect(a).toBe(b)
    expect(criarCliente).toHaveBeenCalledTimes(1)
    expect(criarCliente).toHaveBeenCalledWith('https://abc.supabase.co', 'chave-anon')
    expect(avisado).toHaveBeenCalledWith(a)
    expect(m.clienteCarregado()).toBe(a)

    // quem pede depois recebe na hora
    const tardio = vi.fn()
    m.aoCarregarCliente(tardio)
    expect(tardio).toHaveBeenCalledWith(a)
  })

  it('sem sessão guardada e sem tokens no endereço, o visitante não abre o cliente', async () => {
    const m = await import('./supabase')
    expect(m.haSessaoGuardada()).toBe(false)
    await expect(m.clienteSeHouverSessao()).resolves.toBeNull()
    expect(criarCliente).not.toHaveBeenCalled()
  })

  it('com a sessão guardada pelo supabase-js (sb-<projeto>-auth-token), abre o cliente', async () => {
    const m = await import('./supabase')
    expect(m.chaveDaSessao()).toBe('sb-abc-auth-token')
    window.localStorage.setItem('sb-abc-auth-token', '{"access_token":"x"}')

    expect(m.haSessaoGuardada()).toBe(true)
    await expect(m.clienteSeHouverSessao()).resolves.not.toBeNull()
    expect(criarCliente).toHaveBeenCalledTimes(1)
  })

  it('link de e-mail com tokens no fragmento (recuperação, convite) também abre o cliente', async () => {
    window.history.replaceState(null, '', '/nova-senha#access_token=abc&type=recovery')
    const m = await import('./supabase')
    expect(m.haSessaoGuardada()).toBe(true)
  })

  it('falha ao criar o cliente (o pedaço não chegou) rejeita, e a chamada seguinte tenta de novo', async () => {
    criarCliente.mockImplementationOnce(() => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })
    const m = await import('./supabase')

    await expect(m.obterCliente()).rejects.toThrow(/dynamically imported/)
    expect(m.clienteCarregado()).toBeNull()

    await expect(m.obterCliente()).resolves.not.toBeNull()
    expect(criarCliente).toHaveBeenCalledTimes(2)
  })

  it('sem URL e chave no build, obterCliente devolve nulo e client() explica com a mensagem de indisponível', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const m = await import('./supabase')
    await expect(m.obterCliente()).resolves.toBeNull()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(m.client()).rejects.toThrow(m.MSG_INDISPONIVEL)
  })
})
