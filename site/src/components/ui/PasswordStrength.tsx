import { forcaDaSenha } from '@/utils/validation'
import './password-strength.css'

/**
 * Medidor de força da senha, abaixo do campo. Só orienta: o único bloqueio
 * é o tamanho mínimo, que fica na validação do campo. O texto muda em uma
 * região polida (aria-live), anunciada quando o nível muda.
 */
export function PasswordStrength({ value, id }: { value: string; id?: string }) {
  if (!value) return null
  const { nivel, rotulo, dica } = forcaDaSenha(value)

  return (
    <div className={`pw-strength pw-strength--${nivel}`} id={id}>
      <div className="pw-strength__bar" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < Math.max(1, nivel) ? 'is-on' : ''} />
        ))}
      </div>
      <p className="pw-strength__text" aria-live="polite">
        Força da senha: <strong>{rotulo}</strong>
        {dica && <span> — {dica}</span>}
      </p>
    </div>
  )
}
