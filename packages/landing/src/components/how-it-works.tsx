import { FadeIn } from './fade-in'

interface Step {
  number: string
  title: string
  description: string
  code: string | null
}

const steps: Step[] = [
  {
    number: '01',
    title: 'Run it',
    description: 'One command. Works anywhere Docker does.',
    code: 'docker run -p 3000:3000 pandorakit/pandora',
  },
  {
    number: '02',
    title: 'Set it up',
    description: 'Open the web UI, add your AI provider key. Takes about a minute.',
    code: null,
  },
  {
    number: '03',
    title: 'Make it yours',
    description:
      'Start chatting, add plugins, set up schedules. It gets better the more you use it.',
    code: null,
  },
]

export function HowItWorks(): React.JSX.Element {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="display-heading font-display text-3xl leading-tight tracking-normal md:text-5xl md:leading-tight">
            <span className="text-muted">Up and running</span>
            <br />
            in minutes.
          </h2>
        </FadeIn>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 0.1}>
              <div className="h-full rounded-2xl border border-border bg-surface p-8 transition-colors hover:border-accent/20">
                <span className="display-heading font-display text-4xl text-accent/30">
                  {step.number}
                </span>
                <h3 className="display-heading-medium mt-3 font-display text-2xl text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-muted text-sm leading-relaxed">{step.description}</p>
                {step.code ? (
                  <pre className="mt-4 overflow-x-auto rounded-lg bg-background p-4 text-accent text-xs">
                    <code>{step.code}</code>
                  </pre>
                ) : null}
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
