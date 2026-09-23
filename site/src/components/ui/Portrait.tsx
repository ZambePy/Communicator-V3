import { Picture } from './Picture'
import './portrait.css'

type Props = {
  /** Base do arquivo em /team/ (ex.: "gabriel" → gabriel-avatar-200.webp …). */
  photo: string
  alt: string
  /** Diâmetro em px (160–200 no layout; menor nas listas compactas). */
  size?: number
}

/**
 * Retrato redondo da equipe: recorte quadrado já centrado no rosto
 * (public/team/*-avatar-200/400), anel em gradiente da marca e uma leve
 * elevação com inclinação ao passar o mouse. Mesmo tamanho e proporção
 * para os três, qualquer que seja a foto original.
 */
export function Portrait({ photo, alt, size = 180 }: Props) {
  return (
    <span className="portrait" style={{ '--portrait': `${size}px` } as React.CSSProperties}>
      <span className="portrait__ring" aria-hidden="true" />
      <Picture
        base={`${photo}-avatar`}
        alt={alt}
        widths={[200, 400]}
        sizes={`${size}px`}
        width={400}
        height={400}
        className="portrait__pic"
      />
    </span>
  )
}
