import { useId, useRef } from 'react'
import { useInclinacaoAoRolar, useVideoNaTela } from '@/hooks/useDemo'
import { useInView } from '@/hooks/useInView'
import type { Demo } from '@/data/home'
import './aparelhos.css'

type PropsDoVideo = {
  demo: Demo
  className: string
  /** Ponto de foco quando o vídeo corta nas bordas (object-position). */
  foco?: string
  /**
   * `none`: nada é baixado antes de o vídeo entrar na tela — o pôster fica no
   * lugar e o `play()` do observador é que carrega.
   */
  preload?: 'none' | 'metadata'
}

/** O vídeo com o botão de pausa; a descrição vai para quem usa leitor de tela. */
function VideoDeDemonstracao({ demo, className, foco, preload = 'metadata' }: PropsDoVideo) {
  const { videoRef, tocando, alternar } = useVideoNaTela()
  const idDescricao = useId()
  return (
    <>
      <video
        ref={videoRef}
        className={className}
        style={foco ? { objectPosition: foco } : undefined}
        muted
        loop
        playsInline
        preload={preload}
        poster={demo.poster}
        aria-describedby={idDescricao}
      >
        {demo.webm && <source src={demo.webm} type="video/webm" />}
        <source src={demo.mp4} type="video/mp4" />
      </video>
      <span id={idDescricao} className="sr-only">
        {demo.descricao}
      </span>
      <button
        type="button"
        className="demo-pausa"
        onClick={alternar}
        aria-label={tocando ? 'Pausar a demonstração' : 'Reproduzir a demonstração'}
      >
        {tocando ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
            <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" />
          </svg>
        )}
      </button>
    </>
  )
}

/**
 * A gravação real do IrisFlow Communicator sem aparelho em volta: um
 * retângulo arredondado na proporção do vídeo (16:9), com o brilho da marca
 * na borda. O vídeo é o produto; a moldura de monitor só disputava com ele.
 * O brilho só gira com a moldura na tela, como as ilustrações da home.
 */
export function VideoEmMoldura({ demo }: { demo: Demo }) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: false, threshold: 0.1, rootMargin: '0px' })
  return (
    <div ref={ref} className={`video-moldura${inView ? ' is-rodando' : ''}`}>
      <span className="video-moldura__brilho" aria-hidden="true" />
      <div className="video-moldura__tela">
        <VideoDeDemonstracao demo={demo} className="video-moldura__video" preload="none" />
      </div>
    </div>
  )
}

/** Um celular genérico com a gravação real do IrisFlow Cuidador. */
export function CelularDemo({ demo }: { demo: Demo }) {
  return (
    <div className="celular">
      <div className="celular__moldura">
        <div className="celular__tela">
          <VideoDeDemonstracao demo={demo} className="celular__video" foco="50% 0%" />
        </div>
        <span className="celular__camera" aria-hidden="true" />
      </div>
    </div>
  )
}

/** Um celular com uma tela parada (captura do app), para as páginas de dentro. */
export function CelularTela({
  src,
  alt,
  decorativa = false,
}: {
  src: string
  alt: string
  /** Cópia visual de algo já descrito ao lado: fica fora do leitor de tela. */
  decorativa?: boolean
}) {
  return (
    <div className="celular celular--tela" aria-hidden={decorativa || undefined}>
      <div className="celular__moldura">
        <div className="celular__tela">
          <img
            className="celular__video"
            src={src}
            alt={decorativa ? '' : alt}
            width={784}
            height={1544}
            loading="lazy"
            decoding="async"
          />
        </div>
        <span className="celular__camera" aria-hidden="true" />
      </div>
    </div>
  )
}

export type TelaParada = { src: string; alt: string; largura?: number; altura?: number }

/**
 * O mesmo monitor, com capturas paradas do app no lugar do vídeo. Todas ficam
 * empilhadas e só a `ativa` aparece: a troca é um esmaecer, sem piscar a
 * moldura. As outras ficam fora do leitor de tela.
 */
export function MonitorTelas({
  telas,
  ativa = 0,
  inclinar = false,
}: {
  telas: TelaParada[]
  ativa?: number
  inclinar?: boolean
}) {
  const cena = useRef<HTMLDivElement>(null)
  useInclinacaoAoRolar(cena, inclinar ? {} : { graus: 0, escalaInicial: 1 })
  return (
    <div className="monitor" ref={cena}>
      <div className="monitor__corpo">
        <div className="monitor__moldura">
          <div className="monitor__tela">
            {telas.map((t, i) => (
              <img
                key={`${i}-${t.src}`}
                className={`monitor__imagem${i === ativa ? ' is-ativa' : ''}`}
                src={t.src}
                alt={i === ativa ? t.alt : ''}
                aria-hidden={i === ativa ? undefined : true}
                width={t.largura ?? 1600}
                height={t.altura ?? 900}
                decoding="async"
              />
            ))}
            <span className="monitor__reflexo" aria-hidden="true" />
          </div>
        </div>
        <span className="monitor__pescoco" aria-hidden="true" />
        <span className="monitor__base" aria-hidden="true" />
      </div>
    </div>
  )
}
