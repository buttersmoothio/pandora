import { FadeIn } from './fade-in'

const items = [
  'Runs on your machine',
  'Any AI provider',
  'Just yours',
  'Open source',
  'One database, zero fuss',
  'Ready in minutes',
  'No lock-in, ever',
  'Built to be extended',
]

export function FeatureList(): React.JSX.Element {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-4xl">
        <ul className="flex flex-col items-center gap-2 text-center">
          {items.map((item, i) => {
            const opacity = Math.max(0.15, 1 - i * 0.12)
            return (
              <FadeIn key={item} delay={i * 0.06}>
                <li
                  className="display-heading font-display text-3xl leading-snug md:text-5xl lg:text-6xl"
                  style={{ opacity }}
                >
                  {item}
                </li>
              </FadeIn>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
