import { FadeIn } from './fade-in'
import { PrimaryButton } from './primary-button'

export function OpenSourceCta(): React.JSX.Element {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <FadeIn>
          <h2 className="display-heading font-display text-3xl leading-tight tracking-normal md:text-5xl md:leading-tight">
            Built in the open.
            <br />
            <span className="text-accent">Yours to extend.</span>
          </h2>
        </FadeIn>

        <FadeIn delay={0.1}>
          <p className="mt-6 text-base leading-relaxed text-muted md:text-lg">
            Pandora is open source and MIT licensed. Use it as-is, build something on top, or help
            make it better.
          </p>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="mt-10 flex items-center justify-center gap-5">
            <PrimaryButton href="https://docs.pandorakit.dev/user-guide" size="lg">
              Get Started
            </PrimaryButton>
            <a
              href="https://docs.pandorakit.dev"
              className="rounded-full border border-border px-8 py-4 text-base font-medium text-foreground transition-colors hover:border-muted"
            >
              Read the Docs
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
