import { useEffect, useId, type ReactElement } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { LevarAoComputador } from '@/components/ui/LevarAoComputador'
import { useTesteDoComputador } from '@/hooks/useTesteDoComputador'
import { ehCelular } from '@/lib/aparelho'
import type { EstadoDaLinha, LeituraDaCamera, NivelDoVeredito, Veredito } from '@/utils/compat'
import './teste-do-computador.css'

type Props = {
  /**
   * Título do bloco. Null: sem título — a página já tem o seu (/meu-computador),
   * e o veredito sobe um nível.
   */
  titulo?: string | null
  /** Aceito por compatibilidade com as páginas que pediam atraso de entrada. */
  delay?: number
  /**
   * Avisa a página do nível do veredito a cada mudança. A /meu-computador usa
   * para fechar com "baixe agora" só quando o computador atende (21/10/2026).
   */
  aoMudarVeredito?: (nivel: NivelDoVeredito) => void
}

/** Primeira letra maiúscula e ponto final: os motivos vêm como orações. */
function frase(s: string): string {
  const t = s.trim()
  if (!t) return t
  const comMaiuscula = t[0].toUpperCase() + t.slice(1)
  return /[.!?…]$/.test(comMaiuscula) ? comMaiuscula : `${comMaiuscula}.`
}

const NOME_DO_ESTADO: Record<EstadoDaLinha, string> = {
  ok: 'atende',
  atencao: 'atende, com ressalva',
  problema: 'impede',
  desconhecido: 'não deu para saber',
  pendente: 'ainda não verificado',
}

/** O sinal de cada linha: forma e cor dizem a mesma coisa (nada só por cor). */
function Sinal({ estado }: { estado: EstadoDaLinha }) {
  const desenho: Record<EstadoDaLinha, ReactElement> = {
    ok: <path d="M7.5 12.5l3 3 6-6.5" />,
    atencao: (
      <>
        <path d="M12 7.5v5.5" />
        <path d="M12 16.4h.01" />
      </>
    ),
    problema: <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />,
    desconhecido: (
      <>
        <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
        <path d="M12 16.6h.01" />
      </>
    ),
    pendente: <path d="M8 12h.01M12 12h.01M16 12h.01" />,
  }
  return (
    <span className={`teste__sinal teste__sinal--${estado}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
        <circle cx="12" cy="12" r="10" />
        {desenho[estado]}
      </svg>
    </span>
  )
}

function textoDoVeredito(v: Veredito): string | null {
  switch (v.nivel) {
    case 'funciona':
      return 'Sistema, câmera, placa de vídeo, processador e memória atendem ao que o IrisFlow precisa.'
    case 'falta-camera':
      return v.motivos.length
        ? 'Até aqui, funciona, mas pode ficar lento. Falta a câmera, que é a parte mais importante.'
        : 'Até aqui, o computador atende. Falta a câmera, que é a parte mais importante.'
    case 'no-celular':
      return 'O IrisFlow Communicator é instalado no computador da pessoa, e não no celular. O teste vale para o computador onde ele vai ser usado.'
    default:
      return null
  }
}

function resumoDaCamera(c: LeituraDaCamera): string {
  if (c.estado === 'testando') return 'Medindo a câmera…'
  if (c.estado !== 'ok') return ''
  const fps = c.fps ?? c.fpsInformado
  return `${c.largura}×${c.altura}${fps === null ? '' : `, ${fps.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} quadros por segundo`}`
}

/**
 * "Meu computador funciona?" (pedido do dono, 19/10/2026), que estende a
 * verificação de compatibilidade que já aparecia depois da inscrição
 * (/beta e /sucesso). O veredito vem em linguagem simples — "Funciona",
 * "Funciona, mas pode ficar lento" ou "Não vai funcionar", com o porquê e o
 * que fazer — e embaixo, linha por linha, o que foi medido (utils/compat.ts).
 *
 * A câmera só abre quando a pessoa pede, com a pré-visualização e a contagem
 * dos quadros reais; desliga no botão e ao sair da página. Nada é enviado.
 * No celular, o teste não faz sentido (o app é do computador): a página
 * oferece levar o link para lá.
 */
export function CompatCheck({ titulo = 'Seu computador é compatível?', aoMudarVeredito }: Props) {
  const { veredito, camera, cameraLigada, videoRef, testarCamera, desligarCamera } = useTesteDoComputador()
  const idTitulo = useId()
  const idVeredito = useId()
  const celular = ehCelular()
  const TituloDoVeredito = titulo ? 'h3' : 'h2'
  const explicacao = textoDoVeredito(veredito)
  const testando = camera.estado === 'testando'

  const nivel = veredito.nivel
  useEffect(() => {
    aoMudarVeredito?.(nivel)
  }, [nivel, aoMudarVeredito])

  return (
    <section
      className={`teste teste--${veredito.nivel}`}
      aria-labelledby={titulo ? idTitulo : idVeredito}
    >
      {titulo && (
        <h2 id={idTitulo} className="teste__titulo">
          {titulo}
        </h2>
      )}
      <p className="teste__privacidade">
        <Icon name="cadeado" size={18} />
        <span>
          Tudo acontece neste navegador: nada é enviado, e a imagem da câmera aparece só aqui. A
          câmera desliga quando você sai da página.
        </span>
      </p>

      <div className="teste__grade">
        <div className="teste__camera">
          {celular ? (
            <LevarAoComputador caminho="/meu-computador" />
          ) : (
            <>
              <div className={`teste__tela${cameraLigada ? ' is-ligada' : ''}`}>
                {/* Sempre na página: é nele que a câmera aparece quando o
                    teste começa. Espelhado, como um espelho de verdade. */}
                <video
                  ref={videoRef}
                  className="teste__video"
                  muted
                  playsInline
                  aria-label="Imagem da sua câmera, só nesta página"
                />
                {!cameraLigada && (
                  <div className="teste__convite">
                    <Icon name="webcam" size={32} />
                    <p>
                      {camera.estado === 'nao-testada'
                        ? 'O navegador vai pedir permissão para usar a câmera. A imagem aparece aqui, e a gente conta quantos quadros por segundo ela entrega de verdade.'
                        : 'A câmera está desligada.'}
                    </p>
                    <Button onClick={() => void testarCamera()} disabled={testando} loading={testando}>
                      {camera.estado === 'nao-testada' ? 'Testar a câmera' : 'Testar a câmera de novo'}
                    </Button>
                  </div>
                )}
                {cameraLigada && testando && (
                  <p className="teste__medindo" role="status">
                    Medindo a câmera…
                  </p>
                )}
              </div>
              {cameraLigada && (
                <div className="teste__camera-pe">
                  <p className="teste__camera-resumo">{resumoDaCamera(camera)}</p>
                  <Button variant="secondary" onClick={desligarCamera}>
                    Desligar a câmera
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="teste__resultado" aria-live="polite">
          <TituloDoVeredito id={idVeredito} className="teste__veredito">
            <Sinal
              estado={
                veredito.nivel === 'funciona'
                  ? 'ok'
                  : veredito.nivel === 'lento'
                    ? 'atencao'
                    : veredito.nivel === 'nao-funciona'
                      ? 'problema'
                      : 'pendente'
              }
            />
            <span>{veredito.titulo}</span>
          </TituloDoVeredito>

          {explicacao && <p className="teste__explicacao">{explicacao}</p>}

          {(veredito.nivel === 'nao-funciona' || veredito.nivel === 'lento') &&
            veredito.motivos.length > 0 &&
            (veredito.motivos.length === 1 ? (
              <p className="teste__porque">Porque {veredito.motivos[0].replace(/\.$/, '')}.</p>
            ) : (
              <div className="teste__porque">
                <p>Porque:</p>
                <ul>
                  {veredito.motivos.map((m) => (
                    <li key={m}>{frase(m)}</li>
                  ))}
                </ul>
              </div>
            ))}

          {veredito.nivel === 'falta-camera' && veredito.motivos.length > 0 && (
            <ul className="teste__lentidao">
              {veredito.motivos.map((m) => (
                <li key={m}>{frase(m)}</li>
              ))}
            </ul>
          )}

          {veredito.oQueFazer.length > 0 && (
            <div className="teste__fazer">
              <p className="teste__fazer-titulo">O que fazer</p>
              <ul>
                {veredito.oQueFazer.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <ul className="teste__linhas" aria-label="O que foi medido">
            {veredito.linhas.map((l) => (
              <li key={l.id} className={`teste__linha teste__linha--${l.estado}`}>
                <Sinal estado={l.estado} />
                <div>
                  <p className="teste__linha-rotulo">
                    {l.rotulo}
                    <span className="sr-only"> ({NOME_DO_ESTADO[l.estado]})</span>
                  </p>
                  <p className="teste__linha-valor">{l.valor}</p>
                  {l.detalhe && <p className="teste__linha-detalhe">{l.detalhe}</p>}
                </div>
              </li>
            ))}
          </ul>

          {veredito.ressalvas.length > 0 && (
            <ul className="teste__ressalvas">
              {veredito.ressalvas.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
