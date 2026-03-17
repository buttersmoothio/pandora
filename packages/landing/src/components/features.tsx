import { FadeIn } from './fade-in'

interface Feature {
  title: string
  description: string
  span: string
  featured: boolean
}

const features: Feature[] = [
  {
    title: 'Any model, your choice',
    description: 'Pick the AI that works for you. Switch providers whenever you want — no lock-in.',
    span: 'md:col-span-2',
    featured: true,
  },
  {
    title: 'Long-term memory',
    description:
      "Conversations aren't forgotten. Context carries over, so every chat picks up where you left off.",
    span: '',
    featured: false,
  },
  {
    title: 'Runs on a schedule',
    description:
      'Automate the things you check on regularly. Set them up once, get results without asking.',
    span: '',
    featured: false,
  },
  {
    title: 'A growing toolkit',
    description: 'Add new abilities through plugins. A small ecosystem that keeps getting better.',
    span: 'md:col-span-2',
    featured: true,
  },
  {
    title: 'Chat from anywhere',
    description: 'Use the web UI, or connect your favorite messaging apps. More channels coming.',
    span: 'md:col-span-2',
    featured: true,
  },
  {
    title: 'Nothing without permission',
    description: 'Every tool declares what it needs upfront. Nothing runs without your say-so.',
    span: '',
    featured: false,
  },
]

export function Features(): React.JSX.Element {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="display-heading font-display text-3xl leading-tight tracking-normal md:text-5xl md:leading-tight">
            <span className="text-muted">Built around you.</span>
            <br />
            Not the other way around.
          </h2>
        </FadeIn>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {features.map((feature, i) => (
            <FadeIn key={feature.title} delay={i * 0.08} className={feature.span}>
              <div
                className={`flex h-full flex-col rounded-2xl border border-border p-8 transition-colors hover:border-accent/20 ${
                  feature.featured ? 'bg-surface-raised' : 'bg-surface'
                }`}
              >
                <h3 className="display-heading-medium font-display text-2xl text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-3 text-muted text-sm leading-relaxed">{feature.description}</p>
                {/* Screenshot placeholder */}
                <div
                  className="mt-6 flex-1 overflow-hidden rounded-lg border border-border"
                  style={{
                    background: feature.featured
                      ? 'linear-gradient(135deg, var(--surface) 0%, var(--background) 100%)'
                      : 'var(--background)',
                  }}
                >
                  <div className="flex h-full min-h-[140px] items-center justify-center">
                    <span className="text-muted/50 text-xs">Screenshot</span>
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
