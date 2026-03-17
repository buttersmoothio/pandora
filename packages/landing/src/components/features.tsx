import { FadeIn } from './fade-in'

const features = [
  {
    title: 'Any model, your choice',
    description:
      'OpenAI, Anthropic, Google, Mistral — pick the AI that works for you. Switch whenever you want.',
    span: 'md:col-span-2',
  },
  {
    title: 'Long-term memory',
    description:
      "Conversations aren't forgotten. Context carries over, so every chat picks up where you left off.",
    span: '',
  },
  {
    title: 'Runs on a schedule',
    description:
      'Daily briefings, weekly check-ins, simple reminders. Set them up once, get results without asking.',
    span: '',
  },
  {
    title: 'A growing toolkit',
    description:
      'Add abilities through plugins — web search, research, custom tools. A small ecosystem that keeps getting better.',
    span: 'md:col-span-2',
  },
  {
    title: 'Chat from anywhere',
    description: 'Use the web UI, or connect Telegram. More channels coming.',
    span: 'md:col-span-2',
  },
  {
    title: 'Nothing without permission',
    description: 'Every tool declares what it needs upfront. Nothing runs without your say-so.',
    span: '',
  },
]

export function Features(): React.JSX.Element {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="display-heading font-display text-3xl leading-tight tracking-normal md:text-5xl md:leading-tight">
            Built around you.
            <br />
            <span className="text-muted">Not the other way around.</span>
          </h2>
        </FadeIn>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {features.map((feature, i) => (
            <FadeIn key={feature.title} delay={i * 0.08} className={feature.span}>
              <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-8 transition-colors hover:border-accent/20">
                <h3 className="display-heading-medium font-display text-2xl text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{feature.description}</p>
                {/* Screenshot placeholder */}
                <div className="mt-6 flex-1 overflow-hidden rounded-lg border border-border bg-background">
                  <div className="flex h-full min-h-[140px] items-center justify-center">
                    <span className="text-xs text-muted/50">Screenshot</span>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
