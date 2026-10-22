import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* Acessibilidade do visual v3 (21/10/2026), conferida nos arquivos:
   - contraste AA dos pares de cor do tokens.css (texto ≥ 4,5:1; aro e foco ≥ 3:1),
     sobre o marinho da marca (o fundo desde que o dono recusou o quase preto);
   - o foco visível continua valendo (nenhum CSS do v3 apaga o contorno);
   - a seta do sistema nunca some (sem `cursor: none`);
   - o que anima no v3 é transform, opacity, o traço do anel (stroke-dashoffset)
     ou um recorte (clip-path: o título da abertura e o traço do arco) — nada
     que mexa no layout nem repinte a página a cada quadro. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(AQUI, '../..')
const tokens = readFileSync(resolve(SRC, 'styles/tokens.css'), 'utf8')
const global = readFileSync(resolve(SRC, 'styles/global.css'), 'utf8')

/** Os tokens --v3-* em hexadecimal, lidos do tokens.css. */
function coresV3(): Record<string, string> {
  const cores: Record<string, string> = {}
  for (const m of tokens.matchAll(/--(v3-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) cores[m[1]] = m[2].toLowerCase()
  return cores
}

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2)
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Os CSS do v3: os componentes novos e a abertura da home. */
function cssDoV3(): { arquivo: string; css: string }[] {
  const arquivos = readdirSync(AQUI)
    .filter((n) => n.endsWith('.css'))
    .map((n) => join(AQUI, n))
  arquivos.push(resolve(SRC, 'components/home/hero-produto.css'), resolve(SRC, 'components/home/capitulos.css'))
  return arquivos.map((arquivo) => ({ arquivo, css: readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))
}

describe('cores do v3', () => {
  const c = coresV3()

  it('existem os tokens que as outras páginas usam', () => {
    for (const nome of [
      'v3-noite',
      'v3-noite-2',
      'v3-superficie',
      'v3-superficie-2',
      'v3-superficie-3',
      'v3-papel',
      'v3-texto-2',
      'v3-texto-3',
      'v3-iris',
      'v3-fixacao',
      'v3-cartao-ativo',
      'v3-cartao-ativo-texto',
    ]) {
      expect(c[nome], nome).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('texto sobre os fundos escuros: pelo menos 4,5:1 (AA)', () => {
    for (const fundo of ['v3-noite', 'v3-noite-2', 'v3-superficie', 'v3-superficie-2', 'v3-superficie-3']) {
      for (const texto of ['v3-papel', 'v3-texto-2', 'v3-texto-3', 'v3-iris']) {
        expect(contraste(c[texto], c[fundo]), `${texto} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('texto no cartão ativo (azul da marca) e o botão claro: pelo menos 4,5:1', () => {
    expect(contraste(c['v3-papel'], c['v3-cartao-ativo'])).toBeGreaterThanOrEqual(4.5)
    expect(contraste(c['v3-cartao-ativo-texto'], c['v3-cartao-ativo'])).toBeGreaterThanOrEqual(4.5)
    expect(contraste(c['v3-noite'], c['v3-papel'])).toBeGreaterThanOrEqual(4.5)
  })

  it('o aro de fixação e o contorno do foco: pelo menos 3:1 em todo fundo, inclusive no cartão azul', () => {
    for (const fundo of ['v3-noite', 'v3-noite-2', 'v3-superficie', 'v3-superficie-2', 'v3-superficie-3', 'v3-cartao-ativo']) {
      expect(contraste(c['v3-fixacao'], c[fundo]), `fixação sobre ${fundo}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('o contorno do foco global (papel) e o trilho do foco nas chamadas: pelo menos 3:1 em todo fundo', () => {
    const fundos = ['v3-noite', 'v3-noite-2', 'v3-superficie', 'v3-superficie-2', 'v3-superficie-3', 'v3-cartao-ativo']
    for (const fundo of fundos) {
      expect(contraste(c['v3-papel'], c[fundo]), `papel sobre ${fundo}`).toBeGreaterThanOrEqual(3)
    }
    // o trilho (teal a 70 %) compõe sobre o marinho: conta com a mistura, não com o teal puro
    const misturar = (a: string, b: string, alfa: number) =>
      '#' + [0, 1, 2].map((i) => Math.round(parseInt(a.slice(1 + 2 * i, 3 + 2 * i), 16) * alfa + parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16) * (1 - alfa)).toString(16).padStart(2, '0')).join('')
    for (const fundo of ['v3-noite', 'v3-noite-2']) {
      expect(contraste(misturar(c['v3-fixacao'], c[fundo], 0.7), c[fundo]), `trilho sobre ${fundo}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('as faixas do site inteiro usam o marinho da marca: o chão #0B1B3A e o marinho fundo #081530', () => {
    expect(c['v3-noite-2']).toBe('#0b1b3a')
    expect(c['v3-noite']).toBe('#081530')
    expect(c['v3-cartao-ativo']).toBe('#1b54a8')
    // o quase preto e a grade do vídeo de referência saíram
    expect(tokens).not.toMatch(/--v3-grade|#03060d|#070c17/)

    const bloco = (seletor: string) => {
      const i = tokens.indexOf(`${seletor} {`)
      return tokens.slice(i, tokens.indexOf('}', i))
    }
    expect(bloco('.on-dark')).toMatch(/--bg:\s*var\(--v3-noite\)/)
    expect(bloco('.on-raised')).toMatch(/--bg:\s*var\(--v3-noite-2\)/)
  })
})

describe('foco, cursor e movimento no CSS do v3', () => {
  it('o foco visível global continua: contorno de pelo menos 2 px', () => {
    const m = global.match(/:focus-visible\s*\{[^}]*outline:\s*(\d+)px\s+solid/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(2)
  })

  it('nenhum CSS do v3 apaga o contorno do foco nem esconde a seta do sistema', () => {
    for (const { arquivo, css } of cssDoV3()) {
      expect(css, arquivo).not.toMatch(/outline\s*:\s*(none|0)\s*[;}]/)
      expect(css, arquivo).not.toMatch(/cursor\s*:\s*none/)
    }
  })

  it('só anima transform, opacity, o traço do anel ou um recorte', () => {
    let blocos = 0
    for (const { arquivo, css } of cssDoV3()) {
      for (const bloco of css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []) {
        blocos++
        const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
        const outras = props.filter((p) => !['transform', 'opacity', 'stroke-dashoffset', 'clip-path'].includes(p))
        expect(outras, `${arquivo}: ${bloco.slice(0, 60)}`).toEqual([])
      }
    }
    expect(blocos).toBeGreaterThan(2)
  })
})

/* Revisão de 21/10/2026 (M5, WCAG 1.4.11): com as superfícies mais escuras do
   v3, a borda dos campos de formulário foi de 1,53:1 para 1,48:1 contra a
   página (e 1,30:1 contra o preenchimento do campo). O critério pede 3:1 para
   a fronteira de um componente. A borda passou a ter token próprio, opaco
   (não depende do que está embaixo) e acima de 3:1 em TODAS as superfícies em
   que um campo pode estar. O resto do visual (preenchimento, foco, erro) não
   muda. */
describe('borda dos campos de formulário (WCAG 1.4.11)', () => {
  const hex = (nome: string): string => {
    const m = tokens.match(new RegExp(`--${nome}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`))
    expect(m, `token --${nome} (hexadecimal) no tokens.css`).not.toBeNull()
    return m![1].toLowerCase()
  }
  /** Os fundos em que um campo pode estar: a página, os cartões e o próprio preenchimento. */
  function superficies(): Record<string, string> {
    const bloco = (seletor: string) => {
      const i = tokens.indexOf(`${seletor} {`)
      return tokens.slice(i, tokens.indexOf('}', i))
    }
    const doBloco = (seletor: string, nome: string) => bloco(seletor).match(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})`))?.[1].toLowerCase()
    const c = coresV3()
    const lista: Record<string, string | undefined> = {
      'v3-noite (.on-dark)': c['v3-noite'],
      'v3-noite-2 (página)': c['v3-noite-2'],
      'bg-soft': tokens.match(/--bg-soft:\s*(#[0-9a-fA-F]{6})/)?.[1].toLowerCase(),
      'v3-superficie (cartão)': c['v3-superficie'],
      'v3-superficie-2 (campo)': c['v3-superficie-2'],
      'v3-superficie-3': c['v3-superficie-3'],
      '.on-dark surface': doBloco('.on-dark', 'surface'),
      '.on-dark surface-2': doBloco('.on-dark', 'surface-2'),
      '.on-dark surface-3': doBloco('.on-dark', 'surface-3'),
    }
    for (const [nome, cor] of Object.entries(lista)) expect(cor, nome).toMatch(/^#[0-9a-f]{6}$/)
    return lista as Record<string, string>
  }

  it('--campo-borda tem pelo menos 3:1 contra a página, os cartões e o preenchimento do campo', () => {
    const borda = hex('campo-borda')
    for (const [nome, fundo] of Object.entries(superficies())) {
      expect(contraste(borda, fundo), `--campo-borda sobre ${nome}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('no passar do mouse a borda fica mais clara, não mais apagada (e segue acima de 3:1)', () => {
    const base = hex('campo-borda')
    const hover = hex('campo-borda-hover')
    const noite = coresV3()['v3-noite-2']
    expect(contraste(hover, noite)).toBeGreaterThan(contraste(base, noite))
    for (const [nome, fundo] of Object.entries(superficies())) {
      expect(contraste(hover, fundo), `--campo-borda-hover sobre ${nome}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('o controle negativo: a borda de antes (rgba 12% sobre o campo) NÃO passava', () => {
    // #233047 = rgba(169,198,247,.12) sobre #111b2f, como o navegador pinta.
    expect(contraste('#233047', coresV3()['v3-noite-2'])).toBeLessThan(1.6)
    expect(contraste('#233047', coresV3()['v3-superficie-2'])).toBeLessThan(1.4)
  })

  const css = (arquivo: string) => readFileSync(resolve(SRC, arquivo), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const regra = (texto: string, seletor: string) => {
    const i = texto.indexOf(`${seletor} {`)
    expect(i, `regra ${seletor}`).toBeGreaterThanOrEqual(0)
    return texto.slice(i, texto.indexOf('}', i))
  }

  it('os campos usam o token: texto, seleção, área de texto, caixa de marcar, bolinha do rádio e as caixas do código', () => {
    const campo = css('components/ui/field.css')
    expect(regra(campo, '.field__input')).toMatch(/border:\s*1\.5px solid var\(--campo-borda\)/)
    expect(regra(campo, '.field__input:hover')).toMatch(/border-color:\s*var\(--campo-borda-hover\)/)
    expect(regra(campo, '.check__box')).toMatch(/border:\s*1\.5px solid var\(--campo-borda\)/)
    expect(regra(css('components/beta/pesquisa.css'), '.escolha__marca')).toMatch(/border:\s*2px solid var\(--campo-borda\)/)
    const codigo = css('components/beta/codigo.css')
    expect(regra(codigo, '.codigo__caixa')).toMatch(/border:\s*1px solid var\(--campo-borda\)/)
    // O pulso da caixa que espera o dígito parte da mesma borda (senão a caixa "pisca" para mais apagado).
    expect(codigo).toMatch(/@keyframes codigo-pulso[\s\S]*?0%,\s*100%\s*\{[^}]*border-color:\s*var\(--campo-borda\)/)
  })

  it('campo com valor válido: a borda teal também fica acima de 3:1 (não afina a fronteira)', () => {
    const campo = css('components/ui/field.css')
    const m = regra(campo, '.field--valid .field__input').match(/border-color:\s*var\(--(teal)\)/)
    expect(m).not.toBeNull()
    for (const [nome, fundo] of Object.entries(superficies())) {
      expect(contraste(hex('teal'), fundo), `--teal sobre ${nome}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('o foco é um contorno de 3 px em papel (neutro; o teal ficou para a confirmação) e o erro segue vermelho', () => {
    const campo = css('components/ui/field.css')
    expect(regra(campo, '.field__input:focus')).toMatch(/border-color:\s*var\(--papel\)/)
    expect(regra(campo, '.field__input:focus')).toMatch(/outline:\s*3px solid var\(--papel\)/)
    expect(regra(campo, '.field--error .field__input')).toMatch(/border-color:\s*var\(--danger\)/)
  })
})
