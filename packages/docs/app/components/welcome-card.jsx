'use client'

export function WelcomeCard({ title, description, href }) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        padding: '1.5rem',
        borderRadius: '1rem',
        border: '1px solid #2a2a2a',
        background: '#1a1a1a',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'hsl(34, 78%, 60%, 0.3)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#2a2a2a'
      }}
    >
      <h3
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontSize: '1.25rem',
          marginBottom: '0.5rem',
          fontVariationSettings: "'SOFT' 20, 'WONK' 0, 'opsz' 48, 'wght' 500",
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: '0.875rem', opacity: 0.5, lineHeight: 1.6, margin: 0 }}>
        {description}
      </p>
    </a>
  )
}
