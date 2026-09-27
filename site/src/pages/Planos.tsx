import { PageHead } from '@/components/layout/PageHead'
import { Pricing } from '@/components/sections/Pricing'
import { Faq } from '@/components/sections/Faq'
import { CallToAction } from '@/components/sections/CallToAction'
import { ContrastePreco } from '@/components/home/ContrastePreco'
import { BETA } from '@/data/content'
import { usePlans } from '@/hooks/usePlans'
import '@/components/home/home.css'
import './planos.css'

/**
 * /planos — o preço, sem rodeio. A abertura diz o essencial (grátis na beta,
 * depois a partir do menor plano); a grade mostra o que cada plano inclui,
 * com os recursos da planilha financeira; o contraste lembra do aparelho
 * dedicado; e as perguntas frequentes fecham as dúvidas.
 */
export default function Planos() {
  const { cheapest } = usePlans()

  return (
    <>
      <PageHead
        eyebrow="Planos"
        title={
          BETA.ativo
            ? `Grátis na beta. Depois, a partir de R$ ${cheapest.price} por mês.`
            : `A partir de R$ ${cheapest.price} por mês.`
        }
        highlight={BETA.ativo ? ['Grátis'] : []}
        lead={
          BETA.ativo
            ? 'Sem aparelho para comprar, sem taxa de adesão e sem fidelidade. Durante a beta, tudo é liberado, sem cartão; os planos pagos só começam depois.'
            : 'Sem aparelho para comprar, sem taxa de adesão e sem fidelidade. A família testa antes e só paga se a pessoa conseguir usar.'
        }
      />

      <div className="on-light">
        <Pricing />
      </div>

      <ContrastePreco />

      <div className="on-light">
        <Faq />
      </div>

      <CallToAction />
    </>
  )
}
