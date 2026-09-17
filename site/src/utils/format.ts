/* Máscaras e validações usadas nos formulários de cadastro e checkout.
   Nenhuma delas substitui a validação do servidor: as duas precisam existir. */

const onlyDigits = (v: string) => v.replace(/\D/g, '')

/* ---------------- máscaras ---------------- */

export function maskCPF(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function maskPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export function maskCard(value: string) {
  return onlyDigits(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function maskExpiry(value: string) {
  const d = onlyDigits(value).slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`
}

export function maskCVV(value: string) {
  return onlyDigits(value).slice(0, 4)
}

export function maskCEP(value: string) {
  return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
}

/* ---------------- validações ---------------- */

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

export function isPhone(value: string) {
  return onlyDigits(value).length >= 10
}

/** Validação real de CPF pelos dois dígitos verificadores. */
export function isCPF(value: string) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const digit = (slice: number) => {
    let sum = 0
    for (let i = 0; i < slice; i++) sum += Number(cpf[i]) * (slice + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

/** Luhn: checa a consistência do número do cartão, não a autorização. */
export function isCardNumber(value: string) {
  const d = onlyDigits(value)
  if (d.length < 13 || d.length > 19) return false

  let sum = 0
  let double = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i])
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

export function isExpiryValid(value: string) {
  const m = value.match(/^(\d{2})\/(\d{2})$/)
  if (!m) return false
  const month = Number(m[1])
  const year = 2000 + Number(m[2])
  if (month < 1 || month > 12) return false
  const end = new Date(year, month, 0, 23, 59, 59)
  return end.getTime() > Date.now()
}

export function cardBrand(value: string) {
  const d = onlyDigits(value)
  if (/^4/.test(d)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard'
  if (/^3[47]/.test(d)) return 'American Express'
  if (/^(606282|3841)/.test(d)) return 'Hipercard'
  if (/^(4011|4312|4389|5041|5067|509|6277|6362|650|6516|6550)/.test(d)) return 'Elo'
  return 'Cartão'
}

export function last4(value: string) {
  return onlyDigits(value).slice(-4)
}

/* ---------------- apresentação ---------------- */

export const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

export const daysUntil = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
