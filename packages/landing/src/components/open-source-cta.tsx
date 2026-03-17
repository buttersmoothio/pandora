import { FadeIn } from './fade-in'
import { PrimaryButton } from './primary-button'

export function OpenSourceCta(): React.JSX.Element {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-border bg-surface p-12 text-center md:p-20">
        {/* Background glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            background: 'radial-gradient(ellipse at top, var(--accent) 0%, transparent 60%)',
          }}
        />

        <FadeIn>
          <h2 className="display-heading relative font-display text-3xl leading-tight tracking-normal md:text-5xl md:leading-tight">
            Built in the open.
            <br />
            <span className="text-accent">Yours to extend.</span>
          </h2>
        </FadeIn>

        <FadeIn delay={0.1}>
          <p className="relative mt-6 text-base text-muted leading-relaxed md:text-lg">
            Pandora is open source and MIT licensed. Use it as-is, build something on top, or help
            make it better.
          </p>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="relative mt-10 flex items-center justify-center gap-5">
            <PrimaryButton href="https://docs.pandorakit.com/user-guide" size="lg">
              Get Started
            </PrimaryButton>
            <a
              href="https://docs.pandorakit.com"
              className="rounded-full border border-border px-8 py-4 font-medium text-base text-foreground transition-colors hover:border-muted"
            >
              Read the Docs
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
