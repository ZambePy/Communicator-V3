import { useCountUp } from '@/hooks/useCountUp'
import { useInView } from '@/hooks/useInView'

type Props = {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  duration?: number
}

/** Número que conta até o valor final quando entra na viewport. */
export function Counter({ value, decimals = 0, prefix = '', suffix = '', duration = 1600 }: Props) {
  const { ref, inView } = useInView<HTMLSpanElement>({ threshold: 0.5 })
  const n = useCountUp(value, inView, duration, decimals)

  return (
    <span ref={ref}>
      {prefix}
      {n.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  )
}
