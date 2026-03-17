import { FeatureList } from '@/components/feature-list'
import { Features } from '@/components/features'
import { Footer } from '@/components/footer'
import { Hero } from '@/components/hero'
import { HowItWorks } from '@/components/how-it-works'
import { Nav } from '@/components/nav'
import { OpenSourceCta } from '@/components/open-source-cta'
import { ValueProps } from '@/components/value-props'

export default function Home(): React.JSX.Element {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <Nav />
      <Hero />
      <ValueProps />
      <Features />
      <FeatureList />
      <HowItWorks />
      <OpenSourceCta />
      <Footer />
    </main>
  )
}
