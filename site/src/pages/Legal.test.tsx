import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Privacidade, Termos } from './Legal'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* ============================================================
   /privacidade diz a verdade sobre a câmera (revisão final de 21/10/2026):
   a página dizia "Este site não acessa a sua câmera", mas a home tem o
   "Teste com o seu olhar" e /meu-computador tem "Meu computador funciona?",
   e nos dois a câmera liga, no navegador de quem pede. Numa política de LGPD
   de um produto de saúde, a frase falsa é pior que o teste.
   ============================================================ */

function textoDaPagina(): string {
  const { container } = render(
    <MemoryRouter future={FUTURO_DO_ROTEADOR}>
      <Privacidade />
    </MemoryRouter>,
  )
  return container.textContent ?? ''
}

describe('/privacidade — a câmera do site', () => {
  it('não afirma que o site não acessa a câmera (os dois testes ligam a webcam)', () => {
    const texto = textoDaPagina()
    expect(texto).not.toMatch(/não acessa a sua câmera/i)
    expect(texto).not.toMatch(/sem ligá-la/i)
  })

  it('diz quando a câmera liga: só quando a pessoa pede, nos dois testes', () => {
    const texto = textoDaPagina()
    expect(texto).toMatch(/só liga a sua câmera quando você pede/i)
    expect(texto).toContain('Teste com o seu olhar')
    expect(texto).toContain('Meu computador funciona?')
  })

  it('diz que a imagem e os pontos do rosto ficam no navegador e não saem do computador', () => {
    const texto = textoDaPagina()
    expect(texto).toMatch(/a imagem e os pontos do rosto não saem do seu computador/i)
    expect(texto).toMatch(/não é gravada nem enviada/i)
  })

  it('a data da versão é a desta correção (21 de outubro de 2026)', () => {
    expect(textoDaPagina()).toContain('atualizada em 21 de outubro de 2026')
  })
})

/* Auditoria de 21/10/2026 (P3-1, P3-8): o texto público não usa travessão nem
   ponto médio (a vírgula, o ponto e os dois-pontos dizem o mesmo), e o número
   do item do índice fica na primeira linha quando o título quebra em duas. */
describe('textos legais, no jeito da casa', () => {
  const paginas = [
    ['/privacidade', Privacidade],
    ['/termos', Termos],
  ] as const

  it.each(paginas)('%s não tem travessão nem ponto médio', (_rota, Pagina) => {
    const { container } = render(
      <MemoryRouter future={FUTURO_DO_ROTEADOR}>
        <Pagina />
      </MemoryRouter>,
    )
    const texto = container.textContent ?? ''
    expect(texto).not.toMatch(/[—–]/)
    expect(texto).not.toMatch(/ · /)
  })

  it('a política abre dizendo "o rastreamento acontece no seu computador"', () => {
    const { container } = render(
      <MemoryRouter future={FUTURO_DO_ROTEADOR}>
        <Privacidade />
      </MemoryRouter>,
    )
    expect(container.textContent).toContain('O rastreamento acontece no seu computador e nenhuma imagem da câmera sai dele.')
  })

  it('o link do índice é um bloco, para o número ficar alinhado à primeira linha', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'legal.css'), 'utf8')
    const regra = css.match(/\.legal__toc a\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(regra).toMatch(/display:\s*block/)
    expect(regra).not.toMatch(/inline-block/)
  })
})
