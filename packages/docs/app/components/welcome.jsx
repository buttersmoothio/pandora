import { WelcomeCard } from './welcome-card'

const links = [
  {
    title: 'Getting Started',
    description: 'Deploy Pandora and have your first conversation in minutes.',
    href: '/user-guide',
  },
  {
    title: 'Chat',
    description: 'How conversations, streaming, memory, and tool calls work.',
    href: '/user-guide/chat',
  },
  {
    title: 'Plugins',
    description: 'Browse and configure the plugin ecosystem.',
    href: '/user-guide/plugins',
  },
  {
    title: 'Build a Plugin',
    description: 'Create your own tools, agents, and channels.',
    href: '/extending/quickstart',
  },
  {
    title: 'API Reference',
    description: 'REST endpoints, authentication, and SDK client.',
    href: '/api-reference',
  },
  {
    title: 'React SDK',
    description: 'Build custom UIs with the React integration.',
    href: '/extending/react-sdk',
  },
]

export function Welcome() {
  return (
    <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '4rem 1.5rem 6rem' }}>
      {/* Hero */}
      <div style={{ marginBottom: '4rem' }}>
        <h1
          className="display-heading"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            lineHeight: 1.1,
            marginBottom: '1rem',
          }}
        >
          Welcome to Pandora
          <span style={{ color: 'hsl(34, 78%, 60%)' }}>.</span>
        </h1>
        <p style={{ fontSize: '1.125rem', opacity: 0.6, maxWidth: '36rem', lineHeight: 1.7 }}>
          Your personal AI agent — self-hosted, extensible, and fully under your control.
          Find everything you need to get started, build plugins, or integrate with the API.
        </p>
      </div>

      {/* Cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {links.map((link) => (
          <WelcomeCard key={link.title} {...link} />
        ))}
      </div>

      {/* New here */}
      <div
        style={{
          marginTop: '3rem',
          padding: '2rem',
          borderRadius: '1rem',
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: '1.25rem',
            marginBottom: '0.75rem',
            fontVariationSettings: "'SOFT' 20, 'WONK' 0, 'opsz' 48, 'wght' 500",
          }}
        >
          New here?
        </h2>
        <p style={{ fontSize: '0.9375rem', opacity: 0.6, lineHeight: 1.7, margin: 0 }}>
          Start with the{' '}
          <a href="/user-guide" style={{ color: 'hsl(34, 78%, 60%)', textDecoration: 'underline' }}>
            Getting Started
          </a>{' '}
          guide — it walks you through deployment, configuration, and your first conversation.
          The whole thing takes a few minutes.
        </p>
      </div>
    </div>
  )
}
