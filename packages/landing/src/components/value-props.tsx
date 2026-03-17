import { FadeIn } from './fade-in'

interface ValueProp {
  title: string
  description: string
  icon: string
  offset: string
}

const props: ValueProp[] = [
  {
    title: 'Own.',
    description:
      'Pandora lives on your machine. Your conversations, your memory, your rules. Nobody else has access.',
    icon: '⊙',
    offset: 'md:mt-0',
  },
  {
    title: 'Shape.',
    description:
      'Add the capabilities you actually need. Automate what slows you down — or build something entirely new.',
    icon: '⬡',
    offset: 'md:mt-12',
  },
  {
    title: 'Control.',
    description:
      'Everything runs in a sandbox. One password, one owner. Nothing happens without your permission.',
    icon: '⏣',
    offset: 'md:mt-24',
  },
]

export function ValueProps(): React.JSX.Element {
  return (
    <section className="relative px-6 py-24 md:py-32">

      <div className="relative mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="display-heading font-display text-3xl leading-tight tracking-normal md:text-5xl md:leading-tight">
            <span className="text-muted">Your AI shouldn&apos;t belong</span>
            <br />
            to someone else.
          </h2>
        </FadeIn>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {props.map((prop, i) => (
            <FadeIn key={prop.title} delay={i * 0.1} className={prop.offset}>
              <div className="rounded-2xl border border-border border-t-2 border-t-accent/40 bg-surface p-8 transition-colors hover:border-accent/20 hover:border-t-accent/60">
                <span className="flex h-8 w-8 items-center justify-center text-[28px] leading-none text-accent">{prop.icon}</span>
                <h3 className="display-heading-medium mt-4 font-display text-2xl text-foreground">
                  {prop.title}
                </h3>
                <p className="mt-3 text-muted text-sm leading-relaxed">{prop.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
