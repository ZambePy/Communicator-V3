import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RASCUNHO_KEY,
  RASCUNHO_VALIDADE_MS,
  apagarRascunhoBeta,
  lerRascunhoBeta,
  limparRascunhoVencido,
  salvarRascunhoBeta,
} from './rascunhoBeta'

/* O rascunho da inscrição (enquanto o e-mail não é confirmado) só pode
   levar o que não é sensível. Estes testes seguram a lista fechada: CPF,
   condição de saúde, telefone e senha nunca chegam ao localStorage. */

const AGORA = Date.UTC(2026, 8, 23, 12, 0, 0)

const formularioInteiro = {
  buyerName: 'Maria Aparecida Souza',
  email: 'maria@exemplo.com.br',
  phone: '(11) 90000-0000',
  document: '123.456.789-09',
  userName: 'João',
  relation: 'conjuge',
  condition: 'ela',
  os: 'windows',
  prescriberName: 'Dra. Ana',
  prescriberRole: 'Fonoaudiologia',
  newsletter: true,
  wantsCaregiverApp: false,
  feedbackConsent: true,
  howFound: 'Associação',
  password: 'segredo123',
  passwordConfirm: 'segredo123',
  terms: true,
}

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('rascunho da inscrição na beta', () => {
  it('guarda só a lista fechada de campos, nunca CPF, condição, telefone ou senha', () => {
    salvarRascunhoBeta(' Maria@Exemplo.com.br ', formularioInteiro, AGORA)

    const bruto = window.localStorage.getItem(RASCUNHO_KEY) as string
    const guardado = JSON.parse(bruto)
    expect(guardado.email).toBe('maria@exemplo.com.br')
    expect(Object.keys(guardado.campos).sort()).toEqual(
      ['feedbackConsent', 'howFound', 'os', 'prescriberName', 'prescriberRole', 'relation', 'userName', 'wantsCaregiverApp'].sort(),
    )
    for (const segredo of ['123.456.789-09', 'segredo123', '90000-0000', '"ela"', 'Aparecida']) {
      expect(bruto).not.toContain(segredo)
    }
  })

  it('devolve o rascunho ao mesmo e-mail, dentro da validade', () => {
    salvarRascunhoBeta('maria@exemplo.com.br', formularioInteiro, AGORA)

    expect(lerRascunhoBeta('MARIA@exemplo.com.br', AGORA + 60_000)).toEqual({
      userName: 'João',
      relation: 'conjuge',
      os: 'windows',
      prescriberName: 'Dra. Ana',
      prescriberRole: 'Fonoaudiologia',
      howFound: 'Associação',
      wantsCaregiverApp: false,
      feedbackConsent: true,
    })
  })

  it('não entrega o rascunho a outro e-mail', () => {
    salvarRascunhoBeta('maria@exemplo.com.br', formularioInteiro, AGORA)
    expect(lerRascunhoBeta('outra@exemplo.com.br', AGORA)).toBeNull()
    // e não apaga o de quem é: pode ser só outra pessoa no mesmo navegador
    expect(window.localStorage.getItem(RASCUNHO_KEY)).not.toBeNull()
  })

  it('vence em 48 horas e, vencido, é apagado', () => {
    salvarRascunhoBeta('maria@exemplo.com.br', formularioInteiro, AGORA)

    expect(lerRascunhoBeta('maria@exemplo.com.br', AGORA + RASCUNHO_VALIDADE_MS - 1)).not.toBeNull()
    expect(lerRascunhoBeta('maria@exemplo.com.br', AGORA + RASCUNHO_VALIDADE_MS)).toBeNull()
    expect(window.localStorage.getItem(RASCUNHO_KEY)).toBeNull()
  })

  it('limparRascunhoVencido apaga só o vencido', () => {
    salvarRascunhoBeta('maria@exemplo.com.br', formularioInteiro, AGORA)
    limparRascunhoVencido(AGORA + 1000)
    expect(window.localStorage.getItem(RASCUNHO_KEY)).not.toBeNull()

    limparRascunhoVencido(AGORA + RASCUNHO_VALIDADE_MS + 1)
    expect(window.localStorage.getItem(RASCUNHO_KEY)).toBeNull()
  })

  it('conteúdo estragado ou adulterado não vira dado no formulário', () => {
    window.localStorage.setItem(RASCUNHO_KEY, '{isto não é json')
    expect(lerRascunhoBeta('maria@exemplo.com.br', AGORA)).toBeNull()
    expect(window.localStorage.getItem(RASCUNHO_KEY)).toBeNull()

    // alguém escreveu CPF e condição à mão no armazenamento: a leitura filtra de novo
    window.localStorage.setItem(
      RASCUNHO_KEY,
      JSON.stringify({
        v: 1,
        email: 'maria@exemplo.com.br',
        salvoEm: AGORA,
        campos: { userName: 'João', document: '123.456.789-09', condition: 'ela', os: 42 },
      }),
    )
    expect(lerRascunhoBeta('maria@exemplo.com.br', AGORA)).toEqual({ userName: 'João' })
  })

  it('apagarRascunhoBeta remove, e armazenamento bloqueado não quebra nada', () => {
    salvarRascunhoBeta('maria@exemplo.com.br', formularioInteiro, AGORA)
    apagarRascunhoBeta()
    expect(window.localStorage.getItem(RASCUNHO_KEY)).toBeNull()

    const bloqueado = () => {
      throw new DOMException('bloqueado', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(bloqueado)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(bloqueado)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(bloqueado)

    expect(() => salvarRascunhoBeta('maria@exemplo.com.br', formularioInteiro, AGORA)).not.toThrow()
    expect(lerRascunhoBeta('maria@exemplo.com.br', AGORA)).toBeNull()
    expect(() => apagarRascunhoBeta()).not.toThrow()
  })
})
