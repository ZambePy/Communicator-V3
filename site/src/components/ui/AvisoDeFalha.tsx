import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '@/hooks/useReducedMotion'
import { Icon } from './Icon'

/**
 * Aviso de falha de um formulário, posto JUNTO do botão de enviar. Quando
 * aparece, recebe o foco e rola até o meio da tela: nos formulários longos
 * da /beta o aviso ficava no topo, fora da tela, e o foco caía no <body>
 * (o botão fica desabilitado durante o envio) — a pessoa via o botão parar
 * de girar e nada mais.
 */
export function AvisoDeFalha({ mensagem }: { mensagem: string | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mensagem || !ref.current) return
    ref.current.focus({ preventScroll: true })
    ref.current.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [mensagem])

  if (!mensagem) return null
  return (
    <div ref={ref} className="notice notice--warn aviso-de-falha" role="alert" tabIndex={-1}>
      <span className="notice__icon">
        <Icon name="alerta" size={20} />
      </span>
      <p>{mensagem}</p>
    </div>
  )
}
