import { useRef, type PointerEvent } from 'react'
import './cartao-animado.css'

export type EstadoCartao = 'parado' | 'processando' | 'sucesso' | 'erro'

type Props = {
  /** Número já mascarado ("4111 1111 …"), como está no campo. */
  numero: string
  titular: string
  validade: string
  /** Quantos dígitos do código de segurança já foram digitados. O verso mostra pontos, nunca os dígitos. */
  digitosCvv: number
  bandeira: string
  /** Vira para o verso, como quando o campo do código de segurança está em foco. */
  virado?: boolean
  estado?: EstadoCartao
  className?: string
}

/**
 * Cartão em 3D da tela de pagamento. Inclina um pouco seguindo o mouse, vira
 * para o verso enquanto o código de segurança está em foco e acende um brilho
 * durante a confirmação: azul processando, verde-água no sucesso e vermelho no
 * erro. É só visual: fica escondido dos leitores de tela, que leem os campos.
 * Com "reduzir movimento" ligado no sistema, vira sem animação e não inclina.
 */
export function CartaoAnimado({
  numero,
  titular,
  validade,
  digitosCvv,
  bandeira,
  virado = false,
  estado = 'parado',
  className = '',
}: Props) {
  const corpo = useRef<HTMLDivElement>(null)

  const inclinar = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !corpo.current) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    corpo.current.style.setProperty('--incl-x', `${(-y * 10).toFixed(2)}deg`)
    corpo.current.style.setProperty('--incl-y', `${(x * 14).toFixed(2)}deg`)
  }

  const soltar = () => {
    corpo.current?.style.setProperty('--incl-x', '0deg')
    corpo.current?.style.setProperty('--incl-y', '0deg')
  }

  const classes = ['cartao3d', `cartao3d--${estado}`, virado ? 'is-virado' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} aria-hidden="true" onPointerMove={inclinar} onPointerLeave={soltar}>
      <div className="cartao3d__corpo" ref={corpo}>
        <div className="cartao3d__giro">
          <div className="cartao3d__face cartao3d__frente">
            <div className="cartao3d__linha">
              <span className="cartao3d__chip" />
              <span className="cartao3d__bandeira">{numero ? bandeira : 'IrisFlow'}</span>
            </div>
            <p className="cartao3d__numero">{numero || '•••• •••• •••• ••••'}</p>
            <div className="cartao3d__dados">
              <span>
                titular
                <strong>{titular || 'NOME NO CARTÃO'}</strong>
              </span>
              <span>
                validade
                <strong>{validade || 'MM/AA'}</strong>
              </span>
            </div>
          </div>

          <div className="cartao3d__face cartao3d__verso">
            <span className="cartao3d__tarja" />
            <div className="cartao3d__assinatura">
              <span className="cartao3d__cvv">{digitosCvv > 0 ? '•'.repeat(digitosCvv) : 'CVV'}</span>
            </div>
            <p className="cartao3d__aviso">O código de segurança fica no verso, ao lado da assinatura.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
