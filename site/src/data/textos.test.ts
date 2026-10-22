import { describe, expect, it } from 'vitest'
import { FAQ } from './content'
import * as produto from './produto'
import * as home from './home'
import * as cuidador from './cuidador'

/* Revisão dos textos no ar (19/10/2026): a auditoria mediu a calibração de 13
   pontos em ~40 s de coleta (até ~50 s com as esperas) — "cerca de um minuto",
   e não "meio minuto"; e a frase de requisito pede um sistema só ("Windows 10
   ou 11"). */

/** Todo texto (string) dentro de um valor, em profundidade. */
function textos(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor]
  if (Array.isArray(valor)) return valor.flatMap(textos)
  if (valor && typeof valor === 'object') return Object.values(valor).flatMap(textos)
  return []
}

describe('textos do site', () => {
  it('a calibração leva cerca de um minuto em todo lugar que diz quanto tempo leva', () => {
    const tudo = [...textos(FAQ), ...textos(produto), ...textos(home), ...textos(cuidador)]
    expect(tudo.filter((t) => /meio minuto/i.test(t))).toEqual([])
    const resposta = FAQ.find((f) => f.q === 'Quanto tempo leva a calibração?')!
    expect(resposta.a).toMatch(/^Cerca de um minuto/)
  })

  it('o requisito do computador é "Windows 10 ou 11"', () => {
    const resposta = FAQ.find((f) => f.q === 'Preciso comprar algum equipamento?')!
    expect(resposta.a).toContain('Basta um computador com Windows 10 ou 11')
    expect(resposta.a).not.toContain('Windows 10 e 11')
  })
})

/* Revisão final (22/10/2026): a beta.12 (com o mapa da dor, "Mostrar onde dói")
   sai na noite de 22/10. A ressalva "chega na próxima versão" do cartão 06 e a
   abertura de "cinco coisas e uma que chega" saíram, e o site não pode voltar a
   dizer que algo da home "chega na próxima versão do instalador". */
describe('o mapa da dor entra na home como as outras cinco coisas', () => {
  const cartao = () => home.RECURSOS_DO_OLHAR.find((r) => r.id === 'dor')!

  it('o cartão "Mostrar onde dói" não tem mais nota de que chega depois', () => {
    expect(cartao().titulo).toBe('Mostrar onde dói')
    expect(cartao().nota).toBeUndefined()
    expect(textos(cartao()).filter((t) => /próxima versão|beta 12|ainda não est/i.test(t))).toEqual([])
  })

  it('a abertura da seção diz que as seis coisas são de hoje', () => {
    const { texto } = home.O_QUE_UM_OLHAR_FAZ
    expect(texto).toMatch(/^Seis coisas que o irisflow faz hoje/i)
    expect(texto).not.toMatch(/próxima versão|cinco coisas/i)
  })

  it('nenhum texto da home promete algo para "a próxima versão do instalador"', () => {
    expect(textos(home).filter((t) => /pr[óo]xima vers[ãa]o do instalador|beta 12/i.test(t))).toEqual([])
  })
})
