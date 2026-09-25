import { describe, expect, it } from 'vitest'
import { diaEMes, diaPorExtenso, diasAteOLancamento, jaLancou } from './lancamento'

/* A data do lançamento da beta (beta_program.launch_at) sempre no fuso de
   Brasília, e nunca travando a beta por um valor estranho. */

const LANCAMENTO = '2026-11-10T00:00:00-03:00'

describe('jaLancou', () => {
  it('compara com o instante do lançamento', () => {
    const t = Date.parse(LANCAMENTO)
    expect(jaLancou(LANCAMENTO, t - 1)).toBe(false)
    expect(jaLancou(LANCAMENTO, t)).toBe(true)
    expect(jaLancou(LANCAMENTO, t + 60_000)).toBe(true)
  })

  it('data ausente ou inválida conta como liberado (não trava a beta)', () => {
    expect(jaLancou(null)).toBe(true)
    expect(jaLancou(undefined)).toBe(true)
    expect(jaLancou('')).toBe(true)
    expect(jaLancou('amanhã')).toBe(true)
  })
})

describe('rótulos da data', () => {
  it('"10/11" e "10 de novembro" no fuso de Brasília, mesmo com o instante em UTC', () => {
    expect(diaEMes(LANCAMENTO)).toBe('10/11')
    expect(diaEMes('2026-11-10T03:00:00Z')).toBe('10/11')
    expect(diaPorExtenso('2026-11-10T03:00:00Z')).toBe('10 de novembro')
    // 02:59 UTC ainda é dia 9 em Brasília
    expect(diaEMes('2026-11-10T02:59:00Z')).toBe('09/11')
  })

  it('data inválida vira texto vazio', () => {
    expect(diaEMes('x')).toBe('')
    expect(diaPorExtenso('x')).toBe('')
  })
})

describe('diasAteOLancamento', () => {
  it('conta os dias inteiros que faltam; zero no dia ou depois', () => {
    const t = Date.parse(LANCAMENTO)
    expect(diasAteOLancamento(LANCAMENTO, t - 3 * 86_400_000)).toBe(3)
    expect(diasAteOLancamento(LANCAMENTO, t - 1)).toBe(1)
    expect(diasAteOLancamento(LANCAMENTO, t)).toBe(0)
    expect(diasAteOLancamento('x', t)).toBe(0)
  })
})
