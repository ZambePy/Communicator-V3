import { describe, expect, it } from 'vitest'
import { MSG_INDISPONIVEL, SEM_CONEXAO, mensagemDeErro } from './supabase'

/* ============================================================
   mensagemDeErro: a tela nunca recebe o texto cru do supabase-js.

   O que o site encosta de verdade: falha de rede (cada navegador com a sua
   frase), 5xx com corpo HTML, CHECK do banco pelo nome da constraint, as
   frases do banco para quem usa (P0001) e as mensagens técnicas das funções.
   ============================================================ */

describe('mensagemDeErro — falha de rede e servidor fora', () => {
  it('TypeError de fetch, em qualquer navegador, vira o texto de conexão', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'))).toBe(SEM_CONEXAO)
    expect(mensagemDeErro(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(SEM_CONEXAO)
    expect(mensagemDeErro(new TypeError('Load failed'))).toBe(SEM_CONEXAO)
  })

  it('o erro de rede do PostgREST ("TypeError: Failed to fetch", code vazio) também', () => {
    expect(mensagemDeErro({ message: 'TypeError: Failed to fetch', details: '…', hint: '', code: '' })).toBe(SEM_CONEXAO)
  })

  it('AuthRetryableFetchError: status 0 é rede; 5xx é o servidor fora', () => {
    const rede = Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 })
    const fora = Object.assign(new Error('Bad Gateway'), { name: 'AuthRetryableFetchError', status: 502 })
    expect(mensagemDeErro(rede)).toBe(SEM_CONEXAO)
    expect(mensagemDeErro(fora)).toBe(MSG_INDISPONIVEL)
  })

  it('corpo HTML de um 5xx e erro de pool do PostgREST não aparecem crus', () => {
    expect(mensagemDeErro({ message: '<html><body>502 Bad Gateway</body></html>' })).not.toMatch(/html|Gateway/)
    expect(mensagemDeErro({ message: 'Could not query the database for the schema cache. Retrying.', code: 'PGRST002' })).toBe(
      MSG_INDISPONIVEL,
    )
  })
})

describe('mensagemDeErro — CHECK do banco pelo nome da constraint', () => {
  it('apelido curto (beneficiaries_user_name_check) vira texto em português', () => {
    const msg = mensagemDeErro({
      code: '23514',
      message: 'new row for relation "beneficiaries" violates check constraint "beneficiaries_user_name_check"',
    })
    expect(msg).toBe('O nome de quem vai usar precisa ter ao menos 2 letras.')
  })

  it('limites do contato', () => {
    expect(
      mensagemDeErro({ code: '23514', message: 'new row for relation "contact_messages" violates check constraint "contact_messages_message_check"' }),
    ).toBe('A mensagem precisa ter de 15 a 5.000 caracteres.')
    expect(
      mensagemDeErro({ code: '23514', message: 'new row for relation "contact_messages" violates check constraint "contact_messages_name_check"' }),
    ).toBe('O nome precisa ter de 3 a 120 caracteres.')
  })

  it('constraint desconhecida: texto genérico, sem o nome técnico', () => {
    const msg = mensagemDeErro({ code: '23514', message: 'new row for relation "x" violates check constraint "x_y_check"' })
    expect(msg).not.toMatch(/violates|x_y_check/)
    expect(msg).toMatch(/Confira os campos/)
  })
})

describe('mensagemDeErro — texto do banco e do Auth', () => {
  it('frases para quem usa (P0001) passam; as técnicas, prefixadas com a função, não', () => {
    expect(mensagemDeErro({ code: 'P0001', message: 'As vagas da beta acabaram. Deixe seu contato pelo site e avisamos quando abrir de novo.' })).toBe(
      'As vagas da beta acabaram. Deixe seu contato pelo site e avisamos quando abrir de novo.',
    )
    expect(mensagemDeErro({ code: 'P0001', message: 'request_cancellation: nenhuma assinatura ativa para cancelar' })).not.toMatch(
      /request_cancellation/,
    )
    expect(mensagemDeErro({ code: '22023', message: 'confirmar_codigo: informe o e-mail e os 4 dígitos' })).not.toMatch(
      /confirmar_codigo/,
    )
  })

  it('limite do formulário de contato (gatilho do banco) vira orientação', () => {
    expect(mensagemDeErro({ code: 'P0001', message: 'limite_de_contato' })).toMatch(/Aguarde alguns minutos/)
  })

  it('senha igual à atual (same_password) e sessão ausente em português', () => {
    const igual = Object.assign(new Error('New password should be different from the old password.'), {
      name: 'AuthApiError',
      status: 422,
      code: 'same_password',
    })
    expect(mensagemDeErro(igual)).toBe('A nova senha precisa ser diferente da atual.')
    expect(mensagemDeErro(Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError' }))).toMatch(
      /Entre de novo/,
    )
  })

  it('texto do próprio site e erros já traduzidos passam como estão', () => {
    expect(mensagemDeErro('A conta foi criada, mas não foi possível carregá-la.')).toBe(
      'A conta foi criada, mas não foi possível carregá-la.',
    )
    expect(mensagemDeErro(Object.assign(new Error('Código incorreto.'), { name: 'CodigoIncorreto' }))).toBe('Código incorreto.')
    expect(mensagemDeErro(new Error(MSG_INDISPONIVEL))).toBe(MSG_INDISPONIVEL)
  })

  it('erro desconhecido em inglês vira o texto genérico', () => {
    expect(mensagemDeErro(new Error('Something unexpected happened'))).toMatch(/^Não foi possível concluir agora/)
  })
})
