import { describe, expect, it } from 'vitest'
import { forcaDaSenha, validar } from './validation'
import { isPhone, maskPhone, phoneDigits } from './format'

describe('regras de validação (pt-BR)', () => {
  it('nome completo pede sobrenome', () => {
    expect(validar.nomeCompleto('')).toBe('Informe seu nome.')
    expect(validar.nomeCompleto('Maria')).toBe('Informe nome e sobrenome.')
    expect(validar.nomeCompleto('  Maria   Souza ')).toBeUndefined()
  })

  it('e-mail', () => {
    expect(validar.email('')).toBe('Informe o e-mail.')
    expect(validar.email('maria@')).toMatch(/E-mail inválido/)
    expect(validar.email('maria@exemplo.com.br')).toBeUndefined()
  })

  it('telefone opcional (beta): vazio passa; preenchido precisa ter DDD + número', () => {
    expect(validar.telefoneOpcional('')).toBeUndefined()
    expect(validar.telefoneOpcional('   ')).toBeUndefined()
    expect(validar.telefoneOpcional('(11) 9000')).toMatch(/DDD/)
    expect(validar.telefoneOpcional('(11) 90000-0000')).toBeUndefined()
    expect(validar.telefoneOpcional('(11) 3333-4444')).toBeUndefined()
    // o obrigatório (fluxo pago) continua recusando vazio
    expect(validar.telefone('')).toBe('Informe um telefone.')
  })

  it('CPF opcional: vazio passa, inválido não', () => {
    expect(validar.cpfOpcional('')).toBeUndefined()
    expect(validar.cpfOpcional('111.111.111-11')).toMatch(/CPF inválido/)
    expect(validar.cpfOpcional('123.456.789-09')).toBeUndefined()
  })

  it('senha: mínimo de 8, dizendo quanto falta', () => {
    expect(validar.senha('')).toBe('Crie uma senha.')
    expect(validar.senha('abc12')).toMatch(/faltam 3/)
    expect(validar.senha('abcd1234')).toBeUndefined()
    expect(validar.confirmacao('abcd1234', 'abcd1235')).toBe('As duas senhas precisam ser iguais.')
    expect(validar.confirmacao('abcd1234', 'abcd1234')).toBeUndefined()
  })

  it('mensagem conta os caracteres que faltam', () => {
    expect(validar.mensagem('curta', 15)).toBe('Conte um pouco mais: faltam 10 caracteres.')
    expect(validar.mensagem('uma mensagem longa o suficiente', 15)).toBeUndefined()
  })

  it('aceite dos termos', () => {
    expect(validar.aceite(false)).toMatch(/aceitar os termos/)
    expect(validar.aceite(true)).toBeUndefined()
  })
})

describe('telefone para o banco (profiles.phone: 10–11 dígitos ou NULL)', () => {
  it('phoneDigits devolve só os dígitos, ou null fora do formato', () => {
    expect(phoneDigits('(11) 90000-0000')).toBe('11900000000')
    expect(phoneDigits('11 3333-4444')).toBe('1133334444')
    expect(phoneDigits('')).toBeNull()
    expect(phoneDigits(null)).toBeNull()
    expect(phoneDigits(undefined)).toBeNull()
    expect(phoneDigits('(11) 9000')).toBeNull()
    expect(phoneDigits('+55 (11) 90000-0000')).toBeNull() // 13 dígitos: o CHECK recusaria
  })

  it('isPhone aceita 10 ou 11 dígitos, e a máscara nunca passa de 11', () => {
    expect(isPhone('(11) 3333-4444')).toBe(true)
    expect(isPhone('(11) 90000-0000')).toBe(true)
    expect(isPhone('119000000001')).toBe(false)
    expect(maskPhone('119000000001234')).toBe('(11) 90000-0000')
  })
})

describe('força da senha', () => {
  it('cresce com tamanho e variedade', () => {
    expect(forcaDaSenha('abc').nivel).toBeLessThanOrEqual(1)
    expect(forcaDaSenha('abcdefgh').nivel).toBe(1)
    expect(forcaDaSenha('Marte2Azul').nivel).toBe(3)
    expect(forcaDaSenha('Cavalo-Azul-Bateria-9').rotulo).toBe('Forte')
  })

  it('penaliza sequências óbvias', () => {
    const f = forcaDaSenha('12345678Aa!')
    expect(f.nivel).toBeLessThanOrEqual(1)
    expect(f.dica).toMatch(/sequências/)
  })
})
