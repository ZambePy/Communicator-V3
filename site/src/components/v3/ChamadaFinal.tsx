import { CallToAction } from '@/components/sections/CallToAction'

/**
 * A chamada final da home. É a mesma chamada das outras páginas
 * (CallToAction: a frase, as duas ações e o dia do download, que já seguem a
 * beta) — um campo sólido no azul da marca (#1B54A8), título branco e botão
 * branco, sem nada atrás.
 *
 * Rodada 3 (21/10/2026): esta faixa tinha uma aurora (manchas de luz que
 * derivavam e uma linha ondulada) sobre a noite; o dono recusou o efeito no
 * mesmo dia. O nome acompanha o que ela é agora: uma chamada, não uma aurora.
 */
export function ChamadaFinal() {
  return (
    <div className="v3-chamada-final">
      <CallToAction />
    </div>
  )
}
