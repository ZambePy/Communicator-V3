/* ============================================================
   Regras de validação dos formulários, com mensagens em pt-BR.

   Cada regra recebe o valor e devolve a mensagem de erro, ou undefined
   quando está tudo certo. São as mesmas regras em todos os formulários
   (beta, acesso, nova senha, contato), para a mesma entrada nunca ser
   aceita num lugar e recusada em outro.
   ============================================================ */

import { isCPF, isEmail, isPhone } from './format'

export type Rule<V = string> = (value: V) => string | undefined

/** Mesmo mínimo exigido pelo Supabase Auth por padrão. */
export const SENHA_MINIMA = 8

export const validar = {
  nomeCompleto(v: string) {
    const partes = v.trim().split(/\s+/).filter(Boolean)
    if (!v.trim()) return 'Informe seu nome.'
    if (partes.length < 2) return 'Informe nome e sobrenome.'
    return undefined
  },
  nome(v: string, minimo = 3) {
    if (!v.trim()) return 'Este campo é obrigatório.'
    if (v.trim().length < minimo) return `Use ao menos ${minimo} letras.`
    return undefined
  },
  email(v: string) {
    if (!v.trim()) return 'Informe o e-mail.'
    if (!isEmail(v)) return 'E-mail inválido. Confira se tem “@” e o domínio (ex.: voce@exemplo.com.br).'
    return undefined
  },
  telefone(v: string) {
    if (!v.trim()) return 'Informe um telefone.'
    if (!isPhone(v)) return 'Informe o telefone com DDD.'
    return undefined
  },
  /** Telefone opcional (beta): vazio passa; preenchido precisa ter DDD + número. */
  telefoneOpcional(v: string) {
    if (!v.trim()) return undefined
    return isPhone(v) ? undefined : 'Informe o telefone com DDD (10 ou 11 dígitos) ou deixe em branco.'
  },
  /** CPF opcional: vazio passa; preenchido precisa ser válido. */
  cpfOpcional(v: string) {
    if (!v.trim()) return undefined
    return isCPF(v) ? undefined : 'CPF inválido. Confira os dígitos ou deixe em branco.'
  },
  cpf(v: string) {
    if (!v.trim()) return 'Informe o CPF.'
    return isCPF(v) ? undefined : 'CPF inválido. Confira os dígitos.'
  },
  senha(v: string) {
    if (!v) return 'Crie uma senha.'
    if (v.length < SENHA_MINIMA) return `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres (faltam ${SENHA_MINIMA - v.length}).`
    return undefined
  },
  /** Para o login: só exige algo digitado com o tamanho mínimo da conta. */
  senhaAtual(v: string) {
    if (!v) return 'Informe a senha.'
    if (v.length < SENHA_MINIMA) return `A senha da conta tem ao menos ${SENHA_MINIMA} caracteres.`
    return undefined
  },
  confirmacao(v: string, senha: string) {
    if (!v) return 'Repita a senha.'
    if (v !== senha) return 'As duas senhas precisam ser iguais.'
    return undefined
  },
  escolha(v: string, mensagem = 'Selecione uma opção.') {
    return v ? undefined : mensagem
  },
  mensagem(v: string, minimo = 15) {
    const n = v.trim().length
    if (!n) return 'Escreva a sua mensagem.'
    if (n < minimo) return `Conte um pouco mais: faltam ${minimo - n} caracteres.`
    return undefined
  },
  aceite(v: boolean) {
    return v ? undefined : 'É preciso aceitar os termos de uso e a política de privacidade.'
  },
}

/* ---------------- força da senha ---------------- */

export type ForcaSenha = { nivel: 0 | 1 | 2 | 3 | 4; rotulo: string; dica?: string }

const ROTULOS = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'] as const

/**
 * Estimativa simples e explicável: comprimento e variedade de caracteres,
 * com penalidade para sequências e repetições óbvias. Não bloqueia nada
 * além do mínimo de caracteres — só orienta.
 */
export function forcaDaSenha(senha: string): ForcaSenha {
  if (!senha) return { nivel: 0, rotulo: ROTULOS[0], dica: `Use ao menos ${SENHA_MINIMA} caracteres.` }

  let pontos = 0
  if (senha.length >= SENHA_MINIMA) pontos++
  if (senha.length >= 12) pontos++
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos++
  if (/\d/.test(senha)) pontos++
  if (/[^A-Za-z0-9]/.test(senha)) pontos++

  const obvia =
    /^(.)\1+$/.test(senha) ||
    /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|senha|password|irisflow)/i.test(senha)
  if (obvia) pontos = Math.min(pontos, 1)
  if (senha.length < SENHA_MINIMA) pontos = Math.min(pontos, 1)

  const nivel = Math.min(4, pontos) as ForcaSenha['nivel']

  let dica: string | undefined
  if (senha.length < SENHA_MINIMA) dica = `Faltam ${SENHA_MINIMA - senha.length} caracteres.`
  else if (obvia) dica = 'Evite sequências e palavras óbvias.'
  else if (nivel < 3) dica = 'Misture maiúsculas, números ou símbolos, ou use uma frase mais longa.'

  return { nivel, rotulo: ROTULOS[nivel], dica }
}
