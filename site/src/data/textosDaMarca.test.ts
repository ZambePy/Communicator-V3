import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND } from './content'

/* Auditoria P3-8 (21/10/2026): travessão e ponto médio no texto público. O Agente B limpou as
   páginas e os dados dele; sobraram os que moram nos arquivos do sistema (marca, passo a passo,
   força da senha, painel de download, descrição da imagem de compartilhamento). Visível ou não
   (a meta description também é texto público), sai travessão e ponto médio. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(AQUI, '..')
const lerFonte = (caminho: string) => readFileSync(resolve(SRC, caminho), 'utf8')
const SEM_RASTRO = /[—·]/

describe('texto público do sistema, sem travessão nem ponto médio', () => {
  it('a marca: frase de apresentação e descrição das páginas', () => {
    expect(BRAND.claim).not.toMatch(SEM_RASTRO)
    expect(BRAND.seoDescription).not.toMatch(SEM_RASTRO)
    expect(BRAND.tagline).not.toMatch(SEM_RASTRO)
  })

  it('o "Etapa 2 de 4" do passo a passo usa dois-pontos', () => {
    const fonte = lerFonte('components/ui/Stepper.tsx')
    expect(fonte).toMatch(/Etapa \{[^}]+\} de \{steps\.length\}: <strong>/)
    expect(fonte).not.toMatch(/de \{steps\.length\} · /)
  })

  it('a força da senha e o botão "em breve" do download não usam travessão no texto', () => {
    expect(lerFonte('components/ui/PasswordStrength.tsx')).not.toMatch(/<span> — /)
    expect(lerFonte('components/ui/DownloadPanel.tsx')).not.toMatch(/\{p\.name\} — /)
  })

  it('a descrição da imagem de compartilhamento (index.html)', () => {
    const html = readFileSync(resolve(SRC, '../index.html'), 'utf8')
    const alt = html.match(/og:image:alt" content="([^"]*)"/)
    expect(alt, 'og:image:alt').not.toBeNull()
    expect(alt![1]).not.toMatch(SEM_RASTRO)
  })
})
