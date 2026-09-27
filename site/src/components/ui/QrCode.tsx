import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

type Props = {
  /** O endereço que o código leva. */
  valor: string
  /** Lado em px (o SVG escala sem perder nitidez). */
  tamanho?: number
  /** Texto para leitor de tela. */
  rotulo: string
}

/**
 * Código QR desenhado em SVG no navegador, módulo a módulo — nítido em
 * qualquer tela e sem imagem para baixar. Escuro sobre branco com a margem
 * de 4 módulos que os leitores de celular esperam.
 */
export function QrCode({ valor, tamanho = 148, rotulo }: Props) {
  const { n, caminho } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(valor)
    qr.make()
    const count = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`
      }
    }
    return { n: count + 8, caminho: d }
  }, [valor])

  return (
    <svg
      className="qr"
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label={rotulo}
      shapeRendering="crispEdges"
    >
      <rect width={n} height={n} rx={2} fill="#fff" />
      <path d={caminho} fill="#0b1b3a" />
    </svg>
  )
}
