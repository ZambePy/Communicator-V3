import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import './mensagem-que-chega.css'

type Props = {
  /** Primeiro nome do paciente, como o app do cuidador o mostra. */
  nome: string
  /** A frase que ele escreveu com o olhar. */
  frase: string
  /** As iniciais do avatar, como no cartão do paciente do app ("CS"). */
  iniciais?: string
}

/**
 * "Quem cuida": o que o paciente escreveu chega ao celular (rodada 3,
 * 21/10/2026, pedido do dono: animações ligadas ao conteúdo). Quando a seção
 * entra na tela, o cartão "Carlos escreveu, agora" com a frase desce sobre a
 * tela do celular — uma vez.
 *
 * O texto é o do próprio app: a tela inicial do IrisFlow Cuidador mostra a
 * última mensagem como "{nome} escreveu, agora" com a frase em letra grande
 * (app/app/(tabs)/index.tsx, timeAgo). É esse cartão, e não um aviso do
 * sistema: o push do app só existe para socorro, pedido de ajuda e problema no
 * computador, e o site não promete aviso de toda frase.
 *
 * Fica dentro da tela do celular (um filho de `.celular__tela`), por cima da
 * gravação, e observa o celular inteiro: chega quando ele está à vista.
 * Decorativo (a seção já diz que a frase chega ao celular): fora do leitor de
 * tela. Com movimento reduzido, ou sem IntersectionObserver, já está lá: o
 * componente só esconde o cartão quando vai de fato animá-lo.
 */
export function MensagemQueChega({ nome, frase, iniciais }: Props) {
  const reduzido = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const animar = !reduzido && typeof IntersectionObserver !== 'undefined'
  const [chegou, setChegou] = useState(false)

  useEffect(() => {
    if (!animar) return
    const alvo = ref.current?.closest('.celular') ?? ref.current
    if (!alvo) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setChegou(true)
          io.disconnect()
        }
      },
      { threshold: 0.5, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(alvo)
    return () => io.disconnect()
  }, [animar])

  return (
    <div ref={ref} className={`v3-chega${animar ? (chegou ? ' is-chegando' : ' is-aguardando') : ''}`} aria-hidden="true">
      <span className="v3-chega__avatar">{iniciais ?? nome.slice(0, 1).toUpperCase()}</span>
      <span className="v3-chega__texto">
        <span className="v3-chega__legenda">{nome} escreveu, agora</span>
        <span className="v3-chega__frase">{frase}</span>
      </span>
    </div>
  )
}
