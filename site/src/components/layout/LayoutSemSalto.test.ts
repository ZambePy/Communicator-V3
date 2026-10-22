import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* Auditoria P3-14 (21/10/2026): no carregamento de uma rota lazy, o rodapé subia
   (CLS 0,16 em /cadastro a 768 px e 0,05 em /parear), porque o <main> tinha
   piso de 60vh e a página curta chegava depois do esqueleto de 100vh. Medido no
   navegador: ver o relatório. Aqui fica a regra que segura isso. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(AQUI, 'layout.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('o <main> não deixa o rodapé subir na carga da rota', () => {
  it('o piso do .main é a altura da janela (100vh), o mesmo do esqueleto', () => {
    const m = css.match(/(?:^|\})\s*\.main\s*\{([^}]*)\}/)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/min-height\s*:\s*100vh/)
  })
})
