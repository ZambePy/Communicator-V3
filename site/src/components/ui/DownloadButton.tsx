import type { ReactNode } from 'react'
import { Button } from './Button'

/**
 * Botão de instalador.
 *
 * Sem release publicada em `app_releases` (nem VITE_DOWNLOAD_*_URL) a URL
 * chega como '#'. Antes o botão virava um <a href="#">: parecia ativo, o
 * cursor virava mãozinha e o clique não fazia nada. Sem destino ele agora é
 * um <button disabled>, que o mouse, o teclado e o leitor de tela já
 * anunciam como indisponível.
 *
 * `onDownload` é chamado no clique de um link válido — a página /beta usa
 * isso para registrar a métrica de download sem atrapalhar o próprio download.
 */
export function DownloadButton({
  href,
  variant,
  ready = true,
  onDownload,
  children,
}: {
  href: string
  variant: 'teal' | 'secondary' | 'primary'
  ready?: boolean
  onDownload?: () => void
  children: ReactNode
}) {
  if (!href || href === '#') {
    return (
      <Button
        variant={variant}
        loading={!ready}
        disabled
        title="Ainda não há versão publicada para este sistema."
      >
        {children}
      </Button>
    )
  }

  return (
    <Button href={href} variant={variant} loading={!ready} onClick={onDownload}>
      {children}
    </Button>
  )
}
