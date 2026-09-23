import type { CSSProperties } from 'react'

type Props = {
  /** Base do arquivo em /team/ (ex.: "gabriel" → gabriel-400.webp …). */
  base: string
  alt: string
  /** Larguras geradas pelo script de otimização. */
  widths?: number[]
  /** Dica de tamanho de exibição para o navegador escolher a fonte. */
  sizes?: string
  width: number
  height: number
  className?: string
  style?: CSSProperties
  loading?: 'lazy' | 'eager'
  fetchPriority?: 'high' | 'low' | 'auto'
}

/**
 * <picture> com WebP e JPG progressivo, nas larguras geradas para
 * public/team/. O width/height declarados evitam salto de layout.
 */
export function Picture({
  base,
  alt,
  widths = [400, 800],
  sizes = '(max-width: 720px) 100vw, 33vw',
  width,
  height,
  className,
  style,
  loading = 'lazy',
  fetchPriority,
}: Props) {
  const srcset = (ext: string) => widths.map((w) => `/team/${base}-${w}.${ext} ${w}w`).join(', ')
  const largest = widths[widths.length - 1]

  return (
    <picture className={className} style={style}>
      <source type="image/webp" srcSet={srcset('webp')} sizes={sizes} />
      <img
        src={`/team/${base}-${largest}.jpg`}
        srcSet={srcset('jpg')}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
      />
    </picture>
  )
}
