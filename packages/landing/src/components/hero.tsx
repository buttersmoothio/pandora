import { FadeIn } from './fade-in'
import { PrimaryButton } from './primary-button'

export function Hero(): React.JSX.Element {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-32 text-center md:pt-40">
      {/* Ambient glow — subtle, low opacity to avoid banding */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-[600px] w-[800px] -translate-x-1/2 opacity-[0.08]"
        style={{
          background: 'radial-gradient(ellipse at center, var(--accent) 0%, transparent 70%)',
        }}
      />

      <FadeIn>
        <h1 className="display-heading relative font-display text-5xl leading-[1.1] tracking-normal md:text-7xl md:leading-[1.1]">
          Your AI agent.
          <br />
          <span className="text-accent">Fully yours.</span>
        </h1>
      </FadeIn>

      <FadeIn delay={0.15}>
        <p className="relative mt-6 max-w-xl text-base text-muted leading-relaxed md:text-lg">
          A personal AI assistant that lives on your hardware, remembers what matters, and works on
          your schedule.
          <br />
          <span className="text-foreground">Your server. Your provider. Your rules.</span>
        </p>
      </FadeIn>

      <FadeIn delay={0.3} className="mt-10">
        <PrimaryButton href="https://docs.pandorakit.com/user-guide" size="lg">
          Get Started
        </PrimaryButton>
      </FadeIn>

      {/* Screenshot placeholder */}
      <FadeIn delay={0.5} y={32} className="w-full">
        <div className="relative mx-auto mt-16 w-full max-w-4xl">
          <div
            className="absolute inset-0 -m-4 rounded-2xl opacity-15 blur-3xl"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%)',
            }}
          />
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex h-full items-center justify-center text-muted">
              <p className="text-sm">Product screenshot goes here</p>
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  )
}
