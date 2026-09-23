import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Regra por campo: recebe o valor e o formulário inteiro (para "confirmar senha"). */
export type Rules<T> = { [K in keyof T]?: (value: T[K], all: T) => string | undefined }

type Options = {
  /** Pausa na digitação antes de mostrar o erro de um campo novo (ms). */
  delay?: number
}

/**
 * Validação em tempo real, no padrão "avisa cedo, cobra tarde":
 *
 * - um campo passa a mostrar erro depois do primeiro blur, ou depois de
 *   uma pausa curta na digitação (sem piscar erro a cada tecla do começo);
 * - a partir daí, o erro acompanha cada tecla e some assim que o valor
 *   fica certo;
 * - `isValid()` usa TODAS as regras, tocadas ou não — é o que habilita o
 *   botão de enviar.
 *
 * O Field já liga `error` a aria-invalid e aria-describedby.
 */
export function useFormValidation<T extends Record<string, unknown>>(
  values: T,
  rules: Rules<T>,
  { delay = 700 }: Options = {},
) {
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({})
  const previous = useRef(values)
  const timers = useRef(new Map<keyof T, number>())

  const errors = useMemo(() => {
    const out: Partial<Record<keyof T, string>> = {}
    for (const key of Object.keys(rules) as (keyof T)[]) {
      const msg = rules[key]?.(values[key], values)
      if (msg) out[key] = msg
    }
    return out
  }, [values, rules])

  const touch = useCallback((...keys: (keyof T)[]) => {
    setTouched((t) => {
      if (keys.every((k) => t[k])) return t
      const next = { ...t }
      for (const k of keys) next[k] = true
      return next
    })
  }, [])

  // Campo alterado e ainda não tocado: marca como tocado após a pausa.
  useEffect(() => {
    const prev = previous.current
    previous.current = values
    for (const key of Object.keys(values) as (keyof T)[]) {
      if (prev[key] === values[key] || touched[key]) continue
      const old = timers.current.get(key)
      if (old) window.clearTimeout(old)
      timers.current.set(
        key,
        window.setTimeout(() => {
          timers.current.delete(key)
          touch(key)
        }, delay),
      )
    }
  }, [values, touched, delay, touch])

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => window.clearTimeout(t))
      map.clear()
    }
  }, [])

  /** Erro visível do campo (só depois de tocado). */
  const errorOf = useCallback(
    (key: keyof T) => (touched[key] ? errors[key] : undefined),
    [touched, errors],
  )

  /** Todas as regras (ou só as de `keys`) passam? */
  const isValid = useCallback(
    (keys?: (keyof T)[]) => (keys ?? (Object.keys(rules) as (keyof T)[])).every((k) => !errors[k]),
    [errors, rules],
  )

  /** Esquece o que foi tocado (ex.: "Escrever outra" no contato). */
  const reset = useCallback(() => setTouched({}), [])

  /** Liga blur e erro num campo: `<Field {...bind('email')} />`. */
  const bind = useCallback(
    (key: keyof T) => ({
      onBlur: () => touch(key),
      error: errorOf(key),
    }),
    [touch, errorOf],
  )

  return { errors, errorOf, touch, isValid, reset, bind, touched }
}
