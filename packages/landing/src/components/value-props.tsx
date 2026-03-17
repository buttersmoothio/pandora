import { FadeIn } from './fade-in'

const props = [
  {
    title: 'Own it.',
    description:
      'It lives on your machine. Your conversations, your memory, your rules. Nobody else has access.',
  },
  {
    title: 'Shape it.',
    description:
      'Add the tools you actually need. Search the web, connect your apps, automate the boring stuff — or build something new.',
  },
  {
    title: 'Trust it.',
    description:
      'Everything runs in a sandbox. One password, one owner. It does what you ask and nothing more.',
  },
]

export function ValueProps(): React.JSX.Element {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="display-heading font-display text-3xl leading-tight tracking-normal md:text-5xl md:leading-tight">
            Your AI shouldn&apos;t belong
            <br />
            <span className="text-muted">to someone else.</span>
          </h2>
        </FadeIn>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {props.map((prop, i) => (
            <FadeIn key={prop.title} delay={i * 0.1}>
              <div className="h-full rounded-2xl border border-border bg-surface p-8 transition-colors hover:border-accent/20">
                <h3 className="display-heading-medium font-display text-2xl text-foreground">
                  {prop.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{prop.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
