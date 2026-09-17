import type { ReactNode } from 'react'

/* ============================================================
   Conjunto de ícones do site.

   Todos desenhados na mesma grade de 24 por 24, com traço de 1,6
   e sem preenchimento, para que fiquem coerentes entre si em
   qualquer tamanho. A cor vem sempre do contexto (currentColor),
   então o mesmo ícone serve nas faixas claras e nas escuras.

   Ícones são decoração: quem lê por leitor de tela recebe o texto
   ao lado, e por isso todo <svg> sai marcado como aria-hidden.
   ============================================================ */

export type IconName =
  | 'alvo'
  | 'teclado'
  | 'monitor'
  | 'lazer'
  | 'pessoas'
  | 'alerta'
  | 'ajustes'
  | 'conversa'
  | 'voz'
  | 'olho'
  | 'inclinacao'
  | 'webcam'
  | 'offline'
  | 'cadeado'
  | 'cadeado-aberto'
  | 'relogio'
  | 'notebook'
  | 'download'
  | 'email'
  | 'check'
  | 'seta-esquerda'
  | 'cartao'
  | 'codigo-qr'
  | 'boleto'
  | 'bloqueio'
  | 'info'
  | 'escudo'
  | 'documento'

const PATHS: Record<IconName, ReactNode> = {
  /* alvo de calibração: círculo, centro e as quatro marcas de eixo */
  alvo: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
    </>
  ),

  teclado: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2.5" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 14h.01M18 14h.01M9.5 14h5" />
    </>
  ),

  monitor: (
    <>
      <rect x="2" y="3.5" width="20" height="13" rx="2" />
      <path d="M12 16.5v4M8 20.5h8" />
    </>
  ),

  /* lazer: as formas dos jogos adaptados ao olhar */
  lazer: (
    <>
      <circle cx="7" cy="7" r="4" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
      <path d="M17 3l4 6.5h-8z" />
    </>
  ),

  /* cuidador: duas pessoas, quem usa e quem acompanha */
  pessoas: (
    <>
      <circle cx="9" cy="7" r="3.5" />
      <path d="M16 20.5v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1.5" />
      <path d="M17.5 14.2a4 4 0 0 1 3.5 4v2.3" />
      <path d="M15.5 3.9a3.5 3.5 0 0 1 0 6.4" />
    </>
  ),

  alerta: (
    <>
      <path d="M10.3 4.1 1.9 18.4a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5V14M12 17.5h.01" />
    </>
  ),

  /* ajustes: controles deslizantes, não a engrenagem genérica */
  ajustes: (
    <>
      <path d="M3 6h11M18 6h3M3 12h3M10 12h11M3 18h11M18 18h3" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),

  conversa: (
    <>
      <path d="M21 15a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />
      <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" />
    </>
  ),

  /* voz: forma de onda do áudio */
  voz: <path d="M3 10.5v3M6.5 8v8M10 4.5v15M13.5 7v10M17 9.5v5M20.5 11v2" />,

  olho: (
    <>
      <path d="M1.8 12S5.5 5 12 5s10.2 7 10.2 7-3.7 7-10.2 7S1.8 12 1.8 12z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),

  /* inclinação da cabeça: seta de rotação */
  inclinacao: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M21 3.5V9h-5.5" />
    </>
  ),

  webcam: (
    <>
      <circle cx="12" cy="10" r="6.5" />
      <circle cx="12" cy="10" r="2.4" />
      <path d="M12 16.5V20M7.5 21h9" />
    </>
  ),

  offline: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.3 5.1a16 16 0 0 1 11.4 3.7" />
      <path d="M2.3 8.8a16 16 0 0 1 4.2-2.7" />
      <path d="M5.3 12.5a11 11 0 0 1 3-1.9" />
      <path d="M14.6 11.3a11 11 0 0 1 4.1 2.2" />
      <path d="M8.9 16.1a6 6 0 0 1 6.5-.8" />
      <path d="M12 20h.01" />
    </>
  ),

  cadeado: (
    <>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <path d="M12 15v2.5" />
    </>
  ),

  'cadeado-aberto': (
    <>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 7.6-1.7" />
      <path d="M12 15v2.5" />
    </>
  ),

  relogio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12.3l3.4 2" />
    </>
  ),

  notebook: (
    <>
      <rect x="3" y="4.5" width="18" height="11.5" rx="1.8" />
      <path d="M1.5 19.5h21M12 7.5h.01" />
    </>
  ),

  download: <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15" />,

  email: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M3.2 7.2 12 13l8.8-5.8" />
    </>
  ),

  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,

  'seta-esquerda': <path d="M20 12H4M10.5 5.5 4 12l6.5 6.5" />,

  cartao: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20M6 14.8h4" />
    </>
  ),

  'codigo-qr': (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3.5v3.5H14zM17.5 21H21v-3.5" />
    </>
  ),

  boleto: (
    <>
      <path d="M3 6.5v11M6.5 6.5v11M9.5 6.5v11M13 6.5v11M17 6.5v11M20.5 6.5v11" />
    </>
  ),

  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </>
  ),

  bloqueio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6 18.4 18.4" />
    </>
  ),

  escudo: <path d="M12 2.5l8 3v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10v-6z" />,

  documento: (
    <>
      <path d="M6 2.5h7l5 5v14H6z" />
      <path d="M13 2.5v5h5M9.5 13h5M9.5 16.5h5" />
    </>
  ),
}

type Props = {
  name: IconName
  /** Lado do quadrado, em pixels. */
  size?: number
  className?: string
}

export function Icon({ name, size = 24, className }: Props) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
