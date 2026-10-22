import { describe, expect, it } from 'vitest'
import {
  A11Y_PRINCIPLES,
  BETA_PLAN,
  COMMITMENTS,
  COMPARISON,
  FAQ,
  HUMAN,
  ORIGIN,
  PLANS,
  PLAN_GUARANTEES,
  PRIVACY_LINE,
  PROBLEM,
  ROADMAP,
  SDGS,
  SEGMENTS,
  TEAM,
  VALUES,
} from './content'
import * as produto from './produto'
import * as cuidador from './cuidador'

/* Auditoria de 21/10/2026 (P3-8, P2-14, P2-15): o texto público das páginas de
   dentro não usa travessão nem ponto médio (vírgula, ponto e dois-pontos dizem
   o mesmo), fala da beta no feminino ("a beta", "na beta") e diz "a pessoa"
   quando fala de quem usa. As respostas do FAQ não carregam o vocabulário de
   projeto ("restrição autoimposta", "marcos faciais", "dado biométrico"). */

function textos(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor]
  if (Array.isArray(valor)) return valor.flatMap(textos)
  if (valor && typeof valor === 'object') return Object.values(valor).flatMap(textos)
  return []
}

const DAS_PAGINAS_DE_DENTRO = {
  A11Y_PRINCIPLES,
  BETA_PLAN,
  COMMITMENTS,
  COMPARISON,
  FAQ,
  HUMAN,
  ORIGIN,
  PLANS,
  PLAN_GUARANTEES,
  PRIVACY_LINE,
  PROBLEM,
  ROADMAP,
  SDGS,
  SEGMENTS,
  TEAM,
  VALUES,
  produto: Object.fromEntries(Object.entries(produto).filter(([, v]) => typeof v !== 'function')),
  cuidador: Object.fromEntries(Object.entries(cuidador).filter(([, v]) => typeof v !== 'function')),
}

describe('o jeito de escrever das páginas de dentro', () => {
  const todos = textos(DAS_PAGINAS_DE_DENTRO)

  it('há texto para conferir', () => {
    expect(todos.length).toBeGreaterThan(150)
  })

  it('sem travessão nem ponto médio', () => {
    expect(todos.filter((t) => /[—–]| · /.test(t))).toEqual([])
  })

  it('a beta é feminina: "a beta", "na beta", "durante a beta"', () => {
    expect(todos.filter((t) => /\b(o|no|do|ao|pelo|neste|deste|durante o|desse|nesse) beta\b/i.test(t))).toEqual([])
  })

  it('"o paciente" dá lugar a "a pessoa" nas frases que falam de quem usa (legendas das telas ficam)', () => {
    const faladoParaAFamilia = [
      ...textos(cuidador.CUIDADOR),
      ...textos(cuidador.RECURSOS_DO_CUIDADOR.map((r) => ({ titulo: r.titulo, texto: r.texto }))),
      ...textos(SEGMENTS),
      ...textos(FAQ),
      ...textos(A11Y_PRINCIPLES),
      ...textos(VALUES),
    ]
    expect(faladoParaAFamilia.filter((t) => /\b(o|do|ao|pelo) paciente\b/i.test(t))).toEqual([])
  })

  it('o FAQ fala como uma pessoa fala com a outra', () => {
    const faq = textos(FAQ).join('\n')
    for (const jargao of [
      'restrição autoimposta',
      'arquitetura técnica',
      'marcos faciais',
      'dado biométrico',
      'produto mínimo viável',
      'roteiro técnico',
      'preparo do posto',
      'preparação automática do posto',
    ]) {
      expect(faq, jargao).not.toContain(jargao)
    }
  })

  it('cada resposta do FAQ cabe em até 75 palavras', () => {
    const longas = FAQ.filter((f) => f.a.split(/\s+/).length > 75).map((f) => f.q)
    expect(longas).toEqual([])
  })

  it('a ressalva dos alertas diz o que acontece com o app fechado', () => {
    expect(cuidador.RESSALVA_DOS_ALERTAS).toBe(
      'Na beta, o alerta só aparece com o app do cuidador aberto. Com o app fechado, só depois que ele chegar às lojas.',
    )
    expect(cuidador.RESSALVA_DOS_ALERTAS).not.toMatch(/junto com a publicação/)
  })

  it('as quatro regras de acessibilidade dizem o que o botão faz, sem "requisito de projeto"', () => {
    const regras = textos(A11Y_PRINCIPLES).join('\n')
    expect(regras).not.toMatch(/requisito de projeto|janela explícita|célula de emergência|trilha de contexto/i)
    expect(A11Y_PRINCIPLES.map((p) => p.title)).toEqual([
      'O botão avisa em três momentos',
      'Voltar e Emergência ficam sempre no mesmo lugar',
      'Poucos botões, grandes e afastados',
      'Você sempre sabe onde está',
    ])
  })
})
