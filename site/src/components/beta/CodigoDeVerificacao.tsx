import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { prefersReducedMotion } from '@/hooks/useReducedMotion'
import { ApiError, CODIGO_BLOQUEADO, CodigoIncorreto, DIGITOS_DO_CODIGO, conferirCodigo } from '@/services/api'
import './codigo.css'

/* ============================================================
   Código de 4 dígitos do e-mail de confirmação.

   Um campo só (autocomplete="one-time-code", teclado numérico), desenhado
   como quatro caixas: colar, o preenchimento automático do celular e o
   leitor de tela funcionam como em qualquer campo. Com o quarto dígito, o
   código é conferido sozinho.

   Código certo: as caixas sobem para uma órbita, dão uma volta e um quarto
   e se fundem no centro num bloco verde com o check — só então a sessão é
   aberta (aoConfirmar), e a página segue. "E-mail confirmado" só aparece
   quando a sessão abriu: um código vencido (vale 1 hora) ou a rede caindo
   nesse instante desfazem a animação e explicam o que houve. Cor, só para o
   veredito: verde no acerto, vermelho no erro. Com movimento reduzido, o
   check aparece direto.

   Código errado é recusado, sempre: nada abre a sessão por outro caminho.
   As caixas acendem em vermelho e tremem, o celular vibra, os dígitos se
   apagam e o campo volta vazio para outra tentativa. Quem já confirmou pelo
   botão do e-mail entra pela senha ("Confirmei pelo botão do e-mail").
   ============================================================ */

type Estado = 'digitando' | 'conferindo' | 'confirmado' | 'entrando' | 'erro'

type Props = {
  email: string
  /** Abre a sessão com o token_hash do cadastro. Roda depois da animação. */
  aoConfirmar: (tokenHash: string) => Promise<void>
  /** Manda um código novo para o e-mail. */
  aoReenviar: () => Promise<void>
  /** Segundos até o primeiro reenvio (o Supabase exige 60 s entre envios). */
  esperaInicial?: number
  /** Texto acima das caixas, no lugar do padrão ("Enviamos um código…"). */
  instrucao?: ReactNode
}

const ESPERA_ENTRE_ENVIOS = 60
const DURACAO_DA_ORBITA = 1700
/** A recusa (tremor + dígitos se apagando, em codigo.css) antes de o campo esvaziar. */
const DURACAO_DA_RECUSA = 650

/** Posição de um ponto na órbita, relativa ao ponto de partida da caixa. */
function naOrbita(angulo: number, raio: number, dx: number, dy: number) {
  const rad = (angulo * Math.PI) / 180
  return { x: raio * Math.cos(rad) - dx, y: raio * Math.sin(rad) - dy }
}

/**
 * As quatro caixas sobem para a órbita (24 %), giram uma volta e um quarto
 * (até 72 %) e espiralam para o centro, sumindo (100 %). As animações ficam
 * com o estado final (fill: forwards) até alguém cancelar — é o que devolve
 * as caixas ao lugar se a sessão não abrir.
 */
function animarOrbita(palco: HTMLElement, caixas: HTMLElement[]): Animation[] {
  const centro = palco.getBoundingClientRect()
  const cx = centro.left + centro.width / 2
  const cy = centro.top + centro.height / 2
  const raio = Math.min(64, centro.height * 0.62)
  const animacoes = caixas.map((caixa, i) => {
    const r = caixa.getBoundingClientRect()
    const dx = r.left + r.width / 2 - cx
    const dy = r.top + r.height / 2 - cy
    const inicio = -90 + i * 90
    const quadros: Keyframe[] = [{ offset: 0, transform: 'translate(0px, 0px) scale(1)', opacity: 1 }]
    const a = naOrbita(inicio, raio, dx, dy)
    quadros.push({ offset: 0.24, transform: `translate(${a.x}px, ${a.y}px) scale(0.42)`, opacity: 1, easing: 'linear' })
    const passos = 24
    for (let k = 1; k <= passos; k++) {
      const t = k / passos
      const p = naOrbita(inicio + 450 * t, raio, dx, dy)
      quadros.push({ offset: 0.24 + 0.48 * t, transform: `translate(${p.x}px, ${p.y}px) scale(0.42)`, opacity: 1, easing: 'linear' })
    }
    const espiral = 10
    for (let k = 1; k <= espiral; k++) {
      const t = k / espiral
      const p = naOrbita(inicio + 450 + 200 * t, raio * Math.pow(1 - t, 1.3), dx, dy)
      quadros.push({
        offset: 0.72 + 0.28 * t,
        transform: `translate(${p.x}px, ${p.y}px) scale(${0.42 - 0.24 * t})`,
        opacity: t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1,
        easing: 'linear',
      })
    }
    quadros[1].easing = 'cubic-bezier(0.3, 0, 0.2, 1)'
    return caixa.animate(quadros, { duration: DURACAO_DA_ORBITA, easing: 'cubic-bezier(0.4, 0, 0.3, 1)', fill: 'forwards' })
  })
  return animacoes
}

/** Texto do erro depois do código certo, no contexto do código (não do link). */
function mensagemDoErro(e: unknown): string {
  if (e instanceof CodigoIncorreto) return e.message
  const codigo = e instanceof ApiError ? e.code : undefined
  if (codigo === 'otp_expired' || codigo === 'flow_state_expired') {
    return 'Este código venceu (ele vale por 1 hora) ou já foi usado. Peça outro abaixo.'
  }
  return e instanceof Error ? e.message : 'Não foi possível conferir o código agora.'
}

export function CodigoDeVerificacao({
  email,
  aoConfirmar,
  aoReenviar,
  esperaInicial = ESPERA_ENTRE_ENVIOS,
  instrucao,
}: Props) {
  const [valor, setValor] = useState('')
  const [estado, setEstado] = useState<Estado>('digitando')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [focado, setFocado] = useState(false)
  const [espera, setEspera] = useState(esperaInicial)
  const [reenviando, setReenviando] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const palco = useRef<HTMLDivElement>(null)
  const caixas = useRef<(HTMLSpanElement | null)[]>([])
  const animacoes = useRef<Animation[]>([])
  const idInstrucao = useId()
  const idMensagem = useId()
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  // Contagem até poder pedir outro código.
  useEffect(() => {
    if (espera <= 0) return
    const t = window.setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [espera])

  const conferir = useCallback(
    async (codigo: string) => {
      setEstado('conferindo')
      setMensagem(null)
      setAviso(null)
      try {
        // Só o código certo devolve o hash; errado ou bloqueado cai no catch.
        const hash = await conferirCodigo(email, codigo)
        if (!vivo.current) return
        setEstado('confirmado')
        if (!prefersReducedMotion() && palco.current && typeof Element.prototype.animate === 'function') {
          const lista = caixas.current.filter((c): c is HTMLSpanElement => Boolean(c))
          animacoes.current = animarOrbita(palco.current, lista)
          await Promise.all(animacoes.current.map((a) => a.finished)).catch(() => undefined)
        }
        // O bloco verde se forma no fim da órbita (CSS); um instante para ele ser visto.
        await new Promise((ok) => window.setTimeout(ok, prefersReducedMotion() ? 250 : 650))
        if (!vivo.current) return
        setEstado('entrando')
        await aoConfirmar(hash)
      } catch (e) {
        if (!vivo.current) return
        // As caixas voltam ao lugar (a órbita ficava presa no estado final).
        animacoes.current.forEach((a) => a.cancel())
        animacoes.current = []
        setEstado('erro')
        setMensagem(mensagemDoErro(e))
        if (e instanceof CodigoIncorreto || (e instanceof ApiError && e.message === CODIGO_BLOQUEADO)) {
          navigator.vibrate?.([70, 50, 70])
        }
        window.setTimeout(() => {
          if (!vivo.current) return
          setValor('')
          setEstado('digitando')
          campo.current?.focus()
        }, DURACAO_DA_RECUSA)
      }
    },
    [email, aoConfirmar],
  )

  const digitar = (e: ChangeEvent<HTMLInputElement>) => {
    // Durante a recusa o campo espera a animação acabar: ele esvazia sozinho.
    if (estado !== 'digitando') return
    const so = e.target.value.replace(/\D/g, '').slice(0, DIGITOS_DO_CODIGO)
    setValor(so)
    if (so.length === DIGITOS_DO_CODIGO) void conferir(so)
  }

  const reenviar = async () => {
    setReenviando(true)
    setAviso(null)
    setMensagem(null)
    try {
      await aoReenviar()
      if (!vivo.current) return
      setAviso(`Enviamos um código novo para ${email}. Vale o mais recente.`)
      setEspera(ESPERA_ENTRE_ENVIOS)
      setValor('')
      setEstado('digitando')
      campo.current?.focus()
    } catch (e) {
      if (!vivo.current) return
      setMensagem(e instanceof Error ? e.message : 'Não foi possível reenviar agora.')
    } finally {
      if (vivo.current) setReenviando(false)
    }
  }

  const travado = estado === 'conferindo' || estado === 'confirmado' || estado === 'entrando'
  const ativo = focado && !travado ? Math.min(valor.length, DIGITOS_DO_CODIGO - 1) : -1
  const mm = Math.floor(espera / 60)
  const ss = String(espera % 60).padStart(2, '0')

  return (
    <div className={`codigo codigo--${estado}`}>
      <p className="codigo__instrucao" id={idInstrucao}>
        {instrucao ?? (
          <>
            Enviamos um código de {DIGITOS_DO_CODIGO} dígitos para <strong>{email}</strong>.
          </>
        )}
      </p>

      <div className="codigo__palco" ref={palco}>
        <div className="codigo__orbita" aria-hidden="true" />
        <div className="codigo__caixas" onClick={() => campo.current?.focus()}>
          {Array.from({ length: DIGITOS_DO_CODIGO }, (_, i) => (
            <span
              key={i}
              ref={(el) => {
                caixas.current[i] = el
              }}
              className={[
                'codigo__caixa',
                valor[i] ? 'is-cheia' : '',
                i === ativo ? 'is-ativa' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--i': i } as React.CSSProperties}
              aria-hidden="true"
            >
              {valor[i] ?? ''}
            </span>
          ))}
          <input
            ref={campo}
            className="codigo__campo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={DIGITOS_DO_CODIGO}
            value={valor}
            onChange={digitar}
            onFocus={() => setFocado(true)}
            onBlur={() => setFocado(false)}
            disabled={travado}
            autoFocus
            aria-label={`Código de ${DIGITOS_DO_CODIGO} dígitos`}
            aria-describedby={`${idInstrucao}${mensagem ? ` ${idMensagem}` : ''}`}
            aria-invalid={estado === 'erro' || undefined}
          />
        </div>
        <div className="codigo__selo" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5 10 17.5 19.5 7" />
          </svg>
        </div>
      </div>

      <p className="codigo__situacao" role="status" aria-live="polite">
        {estado === 'conferindo'
          ? 'Conferindo…'
          : estado === 'confirmado'
            ? 'Código certo'
            : estado === 'entrando'
              ? 'Código certo. Confirmando o e-mail…'
              : ''}
      </p>

      {mensagem && (
        <p className="codigo__mensagem" id={idMensagem} role="alert">
          {mensagem}
        </p>
      )}
      {aviso && !mensagem && <p className="codigo__aviso">{aviso}</p>}

      {!travado && (
        <p className="codigo__reenvio">
          {espera > 0 ? (
            <span>
              Não chegou? Você pode pedir outro em {mm}:{ss}.
            </span>
          ) : (
            <button type="button" className="codigo__reenviar" onClick={() => void reenviar()} disabled={reenviando}>
              {reenviando ? 'Enviando…' : 'Enviar outro código'}
            </button>
          )}
        </p>
      )}
    </div>
  )
}
