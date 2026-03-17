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
    <main className="relative min-h-screen overflow-x-hidden bg-background">
      <Nav />
      <Hero />
      {/* Ambient glow behind value props — page-level to avoid clipping */}
      <div className="pointer-events-none relative">
        <div
          className="absolute -top-48 left-0 h-[800px] w-full"
          style={{
            background: 'radial-gradient(ellipse at 30% 50%, var(--accent) 0%, transparent 50%)',
            opacity: 0.04,
          }}
        />
        <div
          className="absolute -top-32 left-0 h-[800px] w-full"
          style={{
            background:
              'radial-gradient(ellipse at 70% 60%, var(--accent-secondary) 0%, transparent 50%)',
            opacity: 0.03,
          }}
        />
      </div>
      <ValueProps />
      <Features />
      <FeatureList />
      <HowItWorks />
      <OpenSourceCta />
      <Footer />
    </main>
  )
}
