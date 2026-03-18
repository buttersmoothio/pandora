import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Brand Kit — Pandora',
  description: 'Pandora brand guidelines, colors, typography, and assets.',
}

const colors: { name: string; variable: string; hex: string; usage: string }[] = [
  { name: 'Background', variable: '--background', hex: '#0f0f0f', usage: 'Page background' },
  { name: 'Foreground', variable: '--foreground', hex: '#f5f0eb', usage: 'Primary text' },
  {
    name: 'Accent',
    variable: '--accent',
    hex: '#e8a04a',
    usage: 'Brand color, highlights, gradient buttons',
  },
  {
    name: 'Accent Secondary',
    variable: '--accent-secondary',
    hex: '#d4745f',
    usage: 'Gradients, secondary highlights',
  },
  { name: 'Muted', variable: '--muted', hex: '#8a8578', usage: 'Secondary text, captions' },
  { name: 'Surface', variable: '--surface', hex: '#1a1a1a', usage: 'Card backgrounds' },
  { name: 'Surface Raised', variable: '--surface-raised', hex: '#222222', usage: 'Featured cards' },
  { name: 'Border', variable: '--border', hex: '#2a2a2a', usage: 'Borders, dividers' },
]

const buttonGradient = {
  css: 'linear-gradient(180deg, #f0b060 0%, #e8a04a 40%, #c47a30 100%)',
  shadow: 'inset 0 1px 1px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.15)',
}

export default function BrandPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background px-6 py-24 md:px-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <h1 className="display-heading font-display text-4xl leading-[1.1] tracking-normal md:text-6xl">
          Brand Kit
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted leading-relaxed">
          Guidelines for using the Pandora brand. Colors, typography, logo usage, and component
          patterns.
        </p>

        {/* Logo */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">Logo</h2>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            The Pandora wordmark uses Fraunces with an amber-accented trailing period. The animated
            version includes a shimmer effect for the landing page.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {/* Dark background */}
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface p-12">
              <span className="display-heading font-display text-3xl text-foreground">
                Pandora<span className="text-accent">.</span>
              </span>
              <span className="text-muted text-xs">On dark</span>
            </div>

            {/* Light background */}
            <div
              className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border p-12"
              style={{ background: '#f5f0eb' }}
            >
              <span className="display-heading font-display text-3xl" style={{ color: '#0f0f0f' }}>
                Pandora<span className="text-accent">.</span>
              </span>
              <span className="text-xs" style={{ color: '#8a8578' }}>
                On light
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-surface p-8">
            <h3 className="font-semibold text-foreground text-sm">Logo specs</h3>
            <ul className="mt-3 space-y-2 text-muted text-sm">
              <li>
                <strong className="text-foreground">Font:</strong> Fraunces (variable)
              </li>
              <li>
                <strong className="text-foreground">Axes:</strong>{' '}
                <code className="rounded bg-background px-1.5 py-0.5 text-accent text-xs">
                  SOFT 64, WONK 1, opsz 144, wght 411
                </code>
              </li>
              <li>
                <strong className="text-foreground">Period color:</strong> Accent (#e8a04a)
              </li>
              <li>
                <strong className="text-foreground">Shimmer:</strong> 8s linear infinite,
                right-to-left amber sweep (landing page only)
              </li>
            </ul>
          </div>
        </section>

        {/* Colors */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">Colors</h2>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            Dark-first palette with warm, neutral tones. Amber/gold accent communicates warmth and
            craftsmanship.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {colors.map((color) => (
              <div
                key={color.name}
                className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4"
              >
                <div
                  className="h-12 w-12 shrink-0 rounded-lg border border-border"
                  style={{ background: color.hex }}
                />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-foreground text-sm">{color.name}</span>
                    <code className="text-muted text-xs">{color.hex}</code>
                  </div>
                  <p className="mt-0.5 text-muted text-xs">{color.usage}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Gradient */}
          <div className="mt-6 rounded-xl border border-border bg-surface p-6">
            <h3 className="font-semibold text-foreground text-sm">Primary button gradient</h3>
            <div className="mt-4 flex items-center gap-6">
              <div
                className="h-12 w-32 rounded-full"
                style={{ background: buttonGradient.css, boxShadow: buttonGradient.shadow }}
              />
              <code className="break-all text-muted text-xs leading-relaxed">
                {buttonGradient.css}
              </code>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">
            Typography
          </h2>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            Two-font system: Fraunces for display/headlines, DM Sans for body text.
          </p>

          <div className="mt-8 space-y-6">
            {/* Display */}
            <div className="rounded-xl border border-border bg-surface p-8">
              <span className="font-semibold text-accent text-xs uppercase tracking-widest">
                Display — Fraunces
              </span>
              <p className="display-heading mt-4 font-display text-4xl text-foreground leading-[1.1]">
                Your AI agent.
              </p>
              <div className="mt-4 space-y-1 text-muted text-xs">
                <p>
                  <strong className="text-foreground">Font:</strong> Fraunces (Google Fonts,
                  variable)
                </p>
                <p>
                  <strong className="text-foreground">Axes:</strong> SOFT 64, WONK 1, opsz 144, wght
                  411
                </p>
                <p>
                  <strong className="text-foreground">Usage:</strong> Hero headlines, section
                  headings, logo
                </p>
              </div>
            </div>

            {/* Display Medium */}
            <div className="rounded-xl border border-border bg-surface p-8">
              <span className="font-semibold text-accent text-xs uppercase tracking-widest">
                Display Medium — Fraunces
              </span>
              <p className="display-heading-medium mt-4 font-display text-2xl text-foreground">
                Card titles and sub-headings
              </p>
              <div className="mt-4 space-y-1 text-muted text-xs">
                <p>
                  <strong className="text-foreground">Axes:</strong> SOFT 20, WONK 0, opsz 48, wght
                  500
                </p>
                <p>
                  <strong className="text-foreground">Usage:</strong> Card titles, smaller headings,
                  doc page headings
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="rounded-xl border border-border bg-surface p-8">
              <span className="font-semibold text-accent text-xs uppercase tracking-widest">
                Body — DM Sans
              </span>
              <p className="mt-4 text-base text-foreground leading-relaxed">
                A personal AI assistant that lives on your hardware, remembers what matters, and
                works on your schedule. Your server. Your provider. Your rules.
              </p>
              <div className="mt-4 space-y-1 text-muted text-xs">
                <p>
                  <strong className="text-foreground">Font:</strong> DM Sans (Google Fonts)
                </p>
                <p>
                  <strong className="text-foreground">Usage:</strong> Body text, navigation,
                  buttons, descriptions
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Components */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">
            Components
          </h2>

          {/* Buttons */}
          <div className="mt-8 rounded-xl border border-border bg-surface p-8">
            <span className="font-semibold text-accent text-xs uppercase tracking-widest">
              Buttons
            </span>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span
                className="inline-block rounded-full px-8 py-4 font-semibold text-background text-base"
                style={{ background: buttonGradient.css, boxShadow: buttonGradient.shadow }}
              >
                Primary Large
              </span>
              <span
                className="inline-block rounded-full px-6 py-3 font-semibold text-background text-sm"
                style={{ background: buttonGradient.css, boxShadow: buttonGradient.shadow }}
              >
                Primary Default
              </span>
              <span
                className="inline-block rounded-full px-4 py-2 font-semibold text-background text-sm"
                style={{ background: buttonGradient.css, boxShadow: buttonGradient.shadow }}
              >
                Primary Small
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="rounded-full border border-border px-8 py-4 font-medium text-base text-foreground">
                Secondary Large
              </span>
              <span className="rounded-full border border-border px-6 py-3 font-medium text-foreground text-sm">
                Secondary Default
              </span>
            </div>
            <div className="mt-4 space-y-1 text-muted text-xs">
              <p>
                <strong className="text-foreground">Primary:</strong> Gradient pill with inner
                highlight and bottom shadow. Dark text.
              </p>
              <p>
                <strong className="text-foreground">Secondary:</strong> Ghost pill with border.
                Foreground text.
              </p>
              <p>
                <strong className="text-foreground">Hover:</strong> Primary brightens (filter:
                brightness 1.1). Secondary border lightens.
              </p>
            </div>
          </div>

          {/* Cards */}
          <div className="mt-6 rounded-xl border border-border bg-surface p-8">
            <span className="font-semibold text-accent text-xs uppercase tracking-widest">
              Cards
            </span>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-accent/20">
                <span className="display-heading-medium font-display text-foreground text-lg">
                  Standard Card
                </span>
                <p className="mt-2 text-muted text-xs">
                  bg-surface, border-border, rounded-2xl, p-8
                </p>
              </div>
              <div className="rounded-2xl border border-border border-t-2 border-t-accent/40 bg-surface p-6 transition-colors hover:border-accent/20 hover:border-t-accent/60">
                <span className="display-heading-medium font-display text-foreground text-lg">
                  Accent Top Card
                </span>
                <p className="mt-2 text-muted text-xs">
                  border-t-2 border-t-accent/40 for emphasis
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Voice & Tone */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">
            Voice &amp; Tone
          </h2>
          <div className="mt-6 space-y-4 text-muted text-sm leading-relaxed">
            <p>
              Pandora&apos;s voice is{' '}
              <strong className="text-foreground">warm, direct, and honest</strong>. We speak like a
              person explaining something they care about — not a company selling a product.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-6">
                <h3 className="font-semibold text-accent text-sm">Do</h3>
                <ul className="mt-3 space-y-2 text-muted text-sm">
                  <li>&ldquo;Your server. Your provider. Your rules.&rdquo;</li>
                  <li>&ldquo;It gets better the more you use it.&rdquo;</li>
                  <li>&ldquo;Nothing runs without your say-so.&rdquo;</li>
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-surface p-6">
                <h3 className="font-semibold text-accent-secondary text-sm">Don&apos;t</h3>
                <ul className="mt-3 space-y-2 text-muted text-sm">
                  <li>&ldquo;Supercharge your productivity with AI.&rdquo;</li>
                  <li>&ldquo;Leveraging cutting-edge LLM technology.&rdquo;</li>
                  <li>&ldquo;No cloud dependency. No data sharing.&rdquo; (not fully true)</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Token Mapping */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">
            Token Mapping
          </h2>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            How brand colors map to the shadcn/ui token system used in the app.
          </p>

          <div className="mt-8 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b bg-surface text-left">
                  <th className="px-4 py-3 font-semibold text-foreground">Token</th>
                  <th className="px-4 py-3 font-semibold text-foreground">Maps to</th>
                  <th className="px-4 py-3 font-semibold text-foreground">Used for</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                <tr className="border-border border-b">
                  <td className="px-4 py-3">
                    <code className="text-accent text-xs">--primary</code>
                  </td>
                  <td className="px-4 py-3">Amber (#e8a04a)</td>
                  <td className="px-4 py-3">Buttons, active states, focus rings, switches</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-3">
                    <code className="text-accent text-xs">--accent</code>
                  </td>
                  <td className="px-4 py-3">Warm neutral</td>
                  <td className="px-4 py-3">Hover backgrounds on list items, dropdowns, sidebar</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-3">
                    <code className="text-accent text-xs">--destructive</code>
                  </td>
                  <td className="px-4 py-3">Warm terracotta-red</td>
                  <td className="px-4 py-3">Delete actions, error states</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="px-4 py-3">
                    <code className="text-accent text-xs">--ring</code>
                  </td>
                  <td className="px-4 py-3">Amber (matches primary)</td>
                  <td className="px-4 py-3">Focus rings on interactive elements</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <code className="text-accent text-xs">--sidebar-primary</code>
                  </td>
                  <td className="px-4 py-3">Amber (matches primary)</td>
                  <td className="px-4 py-3">Active thread in sidebar</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Status Colors */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">
            Status Colors
          </h2>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            Warm-tinted semantic colors used for status indicators across the UI. These replace
            standard Tailwind defaults to feel cohesive with the amber palette.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              {
                name: 'Warning',
                tailwind: 'amber-600 / amber-400',
                hex: '#d97706',
                usage: 'Pending approvals, configuration warnings',
              },
              {
                name: 'Success',
                tailwind: 'emerald-700 / emerald-400',
                hex: '#047857',
                usage: 'Completed actions, configured status',
              },
              {
                name: 'Error',
                tailwind: 'rose-600 / rose-400',
                hex: '#e11d48',
                usage: 'Failed operations, errors',
              },
              {
                name: 'Info',
                tailwind: 'teal-600 / teal-400',
                hex: '#0d9488',
                usage: 'Responded status, informational',
              },
              {
                name: 'Activity',
                tailwind: 'amber-400 / amber-500',
                hex: '#fbbf24',
                usage: 'Active stream indicator (pulse animation)',
              },
              {
                name: 'Denied',
                tailwind: 'orange-700 / orange-400',
                hex: '#c2410c',
                usage: 'Permission denied, blocked actions',
              },
            ].map((status) => (
              <div
                key={status.name}
                className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4"
              >
                <div className="h-10 w-10 shrink-0 rounded-lg" style={{ background: status.hex }} />
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-foreground text-sm">{status.name}</span>
                    <code className="text-muted text-xs">{status.tailwind}</code>
                  </div>
                  <p className="mt-0.5 text-muted text-xs">{status.usage}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Mono Font */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">
            Monospace
          </h2>
          <div className="mt-8 rounded-xl border border-border bg-surface p-8">
            <span className="font-semibold text-accent text-xs uppercase tracking-widest">
              Code — JetBrains Mono
            </span>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-background p-4 text-foreground text-sm">
              <code>
                {'const agent = await Agent.create(config)\nawait agent.chat("Hello, Pandora.")'}
              </code>
            </pre>
            <div className="mt-4 space-y-1 text-muted text-xs">
              <p>
                <strong className="text-foreground">Font:</strong> JetBrains Mono (Google Fonts)
              </p>
              <p>
                <strong className="text-foreground">Usage:</strong> Code blocks, terminal output,
                inline code, technical values
              </p>
              <p>
                <strong className="text-foreground">Features:</strong> Coding ligatures enabled
              </p>
            </div>
          </div>
        </section>

        {/* Light Mode */}
        <section className="mt-20">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">
            Light Mode
          </h2>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            The landing page is dark-only. The UI app supports both modes. Light mode uses warm
            off-whites and creams — never pure white.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              { name: 'Background', light: 'oklch(0.98 0.005 80)', desc: 'Warm cream' },
              { name: 'Foreground', light: 'oklch(0.18 0.01 60)', desc: 'Warm near-black' },
              { name: 'Primary', light: 'oklch(0.72 0.15 65)', desc: 'Amber (same both modes)' },
              { name: 'Border', light: 'oklch(0.90 0.005 80)', desc: 'Warm light border' },
              { name: 'Muted text', light: 'oklch(0.55 0.01 60)', desc: 'Warm medium gray' },
              { name: 'Surface', light: 'oklch(0.95 0.005 80)', desc: 'Warm light gray' },
            ].map((token) => (
              <div key={token.name} className="rounded-xl border border-border bg-surface p-4">
                <span className="font-semibold text-foreground text-sm">{token.name}</span>
                <p className="mt-1 text-muted text-xs">{token.desc}</p>
                <code className="mt-1 block text-accent text-xs">{token.light}</code>
              </div>
            ))}
          </div>
        </section>

        {/* Spacing */}
        <section className="mt-20 mb-12">
          <h2 className="display-heading-medium font-display text-2xl text-foreground">
            Spacing &amp; Layout
          </h2>
          <div className="mt-6 space-y-2 text-muted text-sm leading-relaxed">
            <p>
              <strong className="text-foreground">Section padding:</strong> py-24 (mobile), py-32
              (desktop)
            </p>
            <p>
              <strong className="text-foreground">Content max-width:</strong> max-w-5xl (1024px) for
              content, max-w-4xl for centered text
            </p>
            <p>
              <strong className="text-foreground">Card radius:</strong> rounded-2xl (1rem)
            </p>
            <p>
              <strong className="text-foreground">Card padding:</strong> p-8
            </p>
            <p>
              <strong className="text-foreground">Grid gap:</strong> gap-6
            </p>
            <p>
              <strong className="text-foreground">Section heading to content:</strong> mt-16
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
