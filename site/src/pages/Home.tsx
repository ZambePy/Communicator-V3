import { Hero } from '@/components/sections/Hero'
import { ProblemSection } from '@/components/sections/ProblemSection'
import { Segments } from '@/components/sections/Segments'
import { Human } from '@/components/sections/Human'
import { DwellDemo } from '@/components/sections/DwellDemo'
import { Modules } from '@/components/sections/Modules'
import { Differentiators } from '@/components/sections/Differentiators'
import { Comparison } from '@/components/sections/Comparison'
import { Pricing } from '@/components/sections/Pricing'
import { Eligibility } from '@/components/sections/Eligibility'
import { Faq } from '@/components/sections/Faq'
import { CallToAction } from '@/components/sections/CallToAction'
import { Marquee } from '@/components/effects/Marquee'
import { MARQUEE_ITEMS } from '@/data/content'

/* Ordem da home: problema → para quem → produto → prova → planos →
   elegibilidade → perguntas → chamada para a beta (download). */
export default function Home() {
  return (
    <>
      <Hero />
      <Marquee items={MARQUEE_ITEMS} />
      <ProblemSection />
      <Segments />
      <Modules limit={6} />
      <DwellDemo />
      <Human />
      <Differentiators />
      <Comparison />
      <Pricing />
      <Eligibility />
      <Faq />
      <CallToAction />
    </>
  )
}
