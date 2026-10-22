import { useId, useState, type SyntheticEvent } from 'react'
import { Link } from 'react-router-dom'
import type { ModuloEmTela } from '@/data/produto'
import { useMidia } from './useMidia'
import './modulos.css'

type Props = {
  modulos: ModuloEmTela[]
  titulo: string
  texto: string
  /** O texto do link para a página com todos os módulos. */
  link?: string
}

/** O mesmo ponto de quebra do modulos.css, em que a prévia some e a miniatura entra na lista. */
const TELA_ESTREITA = '(max-width: 960px)'

/** Marca a imagem como carregada (o CSS só a mostra depois disso: sem quadro em branco). */
function aoCarregar(e: SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.dataset.carregada = 'sim'
}

function marcarSeJaCarregada(img: HTMLImageElement | null) {
  if (img && img.complete && img.naturalWidth > 0) img.dataset.carregada = 'sim'
}

/**
 * Os módulos na home (rodada 3, 21/10/2026, a lista de "casos" do vídeo de
 * referência): uma lista numerada e, ao lado, a tela real do módulo da linha
 * sob o ponteiro, num monitor de contorno fino (sem brilho: o dono
 * recusou o efeito em 21/10/2026). Nada só no passar do mouse: o foco
 * do teclado e o toque escolhem a prévia do mesmo jeito; no celular, a tela
 * abre logo abaixo da linha escolhida.
 *
 * As telas só são baixadas quando a linha é escolhida pela primeira vez; até
 * a nova chegar, a anterior continua no lugar (nunca um monitor vazio).
 *
 * Abaixo de 960 px não há prévia ao lado: a miniatura abre dentro da lista. Aí
 * só o CLIQUE escolhe a linha (e `aria-expanded` diz qual está aberta). Antes,
 * hover e foco também escolhiam, e como cada troca montava e desmontava uma
 * imagem de ~390 px, a lista pulava sob o ponteiro parado ao rolar (auditoria
 * P2-2, 21/10/2026: CLS 0,22 a 390 px e 1,02 a 768 px).
 */
export function ListaDeModulos({ modulos, titulo, texto, link = 'Conhecer todos os módulos' }: Props) {
  const [ativo, setAtivo] = useState(0)
  const [anterior, setAnterior] = useState<number | null>(null)
  const [vistas, setVistas] = useState<number[]>([0])
  const idDaPrevia = useId()
  const idDoTitulo = useId()
  const estreito = useMidia(TELA_ESTREITA)
  const idDaMiniatura = (i: number) => `${idDaPrevia}-miniatura-${i}`

  const escolher = (i: number) => {
    if (i === ativo) return
    setAnterior(ativo)
    setAtivo(i)
    setVistas((v) => (v.includes(i) ? v : [...v, i]))
  }

  const m = modulos[ativo]

  return (
    <section className="v3-modulos" aria-labelledby={idDoTitulo}>
      <div className="container">
        <header className="v3-modulos__cabeca">
          <h2 id={idDoTitulo} className="v3-modulos__titulo">
            {titulo}
          </h2>
          <p className="v3-modulos__texto">{texto}</p>
        </header>

        <div className="v3-modulos__grade">
          <div>
            <ol className="v3-modulos__lista">
              {modulos.map((mod, i) => (
                <li key={mod.id} className="v3-modulos__item">
                  <button
                    type="button"
                    className={`v3-modulos__linha${i === ativo ? ' is-ativa' : ''}`}
                    {...(estreito
                      ? {
                          'aria-expanded': i === ativo,
                          'aria-controls': i === ativo ? idDaMiniatura(i) : undefined,
                        }
                      : {
                          'aria-current': i === ativo ? ('true' as const) : undefined,
                          'aria-controls': idDaPrevia,
                        })}
                    onPointerEnter={(e) => {
                      if (!estreito && e.pointerType !== 'touch') escolher(i)
                    }}
                    onFocus={() => {
                      if (!estreito) escolher(i)
                    }}
                    onClick={() => escolher(i)}
                  >
                    <span className="v3-modulos__numero">{String(i + 1).padStart(2, '0')}</span>
                    <span className="v3-modulos__nome">{mod.nome}</span>
                    <span className="v3-modulos__etiquetas">
                      {mod.estado === 'Experimental' && (
                        <span className="v3-etiqueta v3-etiqueta--experimental">Experimental</span>
                      )}
                      {mod.plano && (
                        <span className="v3-etiqueta">
                          {mod.plano.includes(' e ') ? 'Planos' : 'Plano'} {mod.plano}
                        </span>
                      )}
                      {mod.celular && <span className="v3-etiqueta">Também no celular</span>}
                    </span>
                  </button>
                  {/* Em tela estreita, a tela abre logo abaixo da linha escolhida. */}
                  {estreito && i === ativo && (
                    <img
                      id={idDaMiniatura(i)}
                      className="v3-modulos__miniatura"
                      src={mod.tela.src}
                      alt={mod.tela.alt}
                      width={mod.tela.largura ?? 1600}
                      height={mod.tela.altura ?? 900}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                </li>
              ))}
            </ol>
            <Link to="/solucao" className="link-seta v3-modulos__link">
              {link}
            </Link>
          </div>

          <figure className="v3-modulos__previa" id={idDaPrevia}>
            <div className="v3-modulos__tela">
              {vistas.map((i) => {
                const t = modulos[i].tela
                const estado = i === ativo ? ' is-ativa' : i === anterior ? ' is-anterior' : ''
                return (
                  <img
                    key={i}
                    ref={marcarSeJaCarregada}
                    className={`v3-modulos__imagem${estado}`}
                    src={t.src}
                    alt={i === ativo ? t.alt : ''}
                    aria-hidden={i === ativo ? undefined : true}
                    width={t.largura ?? 1600}
                    height={t.altura ?? 900}
                    loading="lazy"
                    decoding="async"
                    onLoad={aoCarregar}
                  />
                )
              })}
            </div>
            <figcaption className="v3-modulos__legenda">
              <strong>{m.nome}.</strong> {m.resumo}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
