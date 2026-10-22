import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { RODAPE_AO_VIVO } from '@/data/content'
import './relogio.css'

const FUSO = 'America/Sao_Paulo'
const formatos = new Map<boolean, Intl.DateTimeFormat>()

/**
 * A hora de Brasília, "05:44:41", qualquer que seja o fuso do computador de
 * quem visita. `hourCycle: 'h23'`: meia-noite é 00, não 24 (alguns ICU
 * devolvem 24 com `hour12: false`).
 */
export function horaDeBrasilia(data: Date, comSegundos = true): string {
  let formato = formatos.get(comSegundos)
  if (!formato) {
    formato = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO,
      hour: '2-digit',
      minute: '2-digit',
      ...(comSegundos ? { second: '2-digit' as const } : {}),
      hourCycle: 'h23',
    })
    formatos.set(comSegundos, formato)
  }
  return formato.format(data)
}

/**
 * O relógio ao vivo do rodapé (rodada 3, 21/10/2026, vídeo de referência):
 * a hora de Brasília, onde a equipe e as famílias da beta estão.
 *
 * - Troca na virada de cada segundo (um timer por segundo, alinhado ao
 *   relógio, não um laço de quadros).
 * - PARA quando ninguém vê a hora: aba escondida (`visibilitychange`) ou
 *   rodapé fora da janela (`IntersectionObserver`). Correção da revisão de
 *   21/10/2026: antes o código contava com o navegador espaçar os timers da
 *   aba escondida, mas o espaço é de 1 por segundo — o ritmo do próprio
 *   relógio —, e o rodapé existe em toda página, então o timer, a renderização
 *   e o `dateTime` rodavam o tempo todo. Ao voltar, a hora é refeita na hora
 *   (não espera a próxima virada) e o relógio retoma.
 * - Não é região viva: o leitor de tela lê a hora quando chega nela, e não
 *   a cada segundo.
 * - Com movimento reduzido: horas e minutos, trocando só na virada do minuto.
 */
export function RelogioAoVivo({ className = '' }: { className?: string }) {
  const reduzido = useReducedMotion()
  const [agora, setAgora] = useState(() => new Date())
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const passo = reduzido ? 60_000 : 1000
    let espera = 0
    // Aba à vista (o `document.hidden` manda) e rodapé na janela. Sem
    // IntersectionObserver (navegador antigo), vale "na janela": só a aba pausa.
    let naTela = true
    const aVista = () => !document.hidden && naTela
    const parar = () => {
      window.clearTimeout(espera)
      espera = 0
    }
    const agendar = () => {
      parar()
      if (!aVista()) return
      const falta = passo - (Date.now() % passo)
      espera = window.setTimeout(() => {
        setAgora(new Date())
        agendar()
      }, falta + 15)
    }
    /** Chamada quando algo muda: retoma com a hora certa, ou para. */
    const conferir = () => {
      if (aVista()) {
        setAgora(new Date())
        agendar()
      } else {
        parar()
      }
    }

    const aoMudarAba = () => conferir()
    document.addEventListener('visibilitychange', aoMudarAba)

    let observador: IntersectionObserver | null = null
    if (typeof IntersectionObserver === 'function' && ref.current) {
      observador = new IntersectionObserver((entradas) => {
        // A última entrada é o estado mais novo.
        const dentro = entradas[entradas.length - 1]?.isIntersecting
        if (dentro === undefined || dentro === naTela) return
        naTela = dentro
        conferir()
      })
      observador.observe(ref.current)
    }

    setAgora(new Date())
    agendar()
    return () => {
      parar()
      document.removeEventListener('visibilitychange', aoMudarAba)
      observador?.disconnect()
    }
  }, [reduzido])

  return (
    <p ref={ref} className={`v3-relogio${className ? ` ${className}` : ''}`}>
      <time className="v3-relogio__hora" dateTime={agora.toISOString()}>
        {horaDeBrasilia(agora, !reduzido)}
      </time>
      <span className="v3-relogio__rotulo">{RODAPE_AO_VIVO.relogio}</span>
    </p>
  )
}
