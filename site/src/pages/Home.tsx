import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { HeroProduto } from '@/components/home/HeroProduto'
import { Capitulos } from '@/components/home/Capitulos'
import { ContrastePreco } from '@/components/home/ContrastePreco'
import { CuidadorDestaque } from '@/components/home/CuidadorDestaque'
import { PrivacidadeCurta } from '@/components/home/PrivacidadeCurta'
import { PlanosResumo } from '@/components/home/PlanosResumo'
import { Faq } from '@/components/sections/Faq'
import { CallToAction } from '@/components/sections/CallToAction'
import { PERGUNTAS_DA_HOME } from '@/data/home'
import '@/components/home/home.css'

/* A home mostra o produto funcionando e fala pouco. Tudo escuro, com as
   partículas ao fundo; a ordem alterna a faixa de destaque (marinho) e a
   elevada (um degrau acima): o produto (monitor) → o que ele faz
   (capítulos) → o preço do aparelho que ele substitui → quem cuida
   (celular) → privacidade → planos → perguntas → chamada para a beta. O
   texto longo fica nas páginas de dentro. */
export default function Home() {
  return (
    <>
      <HeroProduto />
      <Capitulos />
      <ContrastePreco />
      <CuidadorDestaque />
      <PrivacidadeCurta />
      <PlanosResumo />
      <div className="on-raised com-fundo">
        <AmbientBackground variante="particulas" />
        <Faq perguntas={PERGUNTAS_DA_HOME} verTodas="/planos#perguntas" />
      </div>
      <CallToAction />
    </>
  )
}
