import { Hero } from '@/components/sections/Hero'
import { ProblemSection } from '@/components/sections/ProblemSection'
import { Human } from '@/components/sections/Human'
import { DwellDemo } from '@/components/sections/DwellDemo'
import { Modules } from '@/components/sections/Modules'
import { Differentiators } from '@/components/sections/Differentiators'
import { Comparison } from '@/components/sections/Comparison'
import { Pricing } from '@/components/sections/Pricing'
import { Faq } from '@/components/sections/Faq'
import { CallToAction } from '@/components/sections/CallToAction'
import { Marquee } from '@/components/effects/Marquee'
import { MARQUEE_ITEMS } from '@/data/content'

export default function Home() {
  return (
    <>
      <Hero />
      <Marquee items={MARQUEE_ITEMS} />
      <ProblemSection />
      <Human />
      <DwellDemo />
      <Modules limit={6} />
      <Differentiators />
      <Comparison />
      <Pricing />
      <Faq />
      <CallToAction />
    </>
  )
}
