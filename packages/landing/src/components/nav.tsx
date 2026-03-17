'use client'

import { useEffect, useState } from 'react'
import { PrimaryButton } from './primary-button'

export function Nav(): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = (): void => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 z-50 flex w-full items-center justify-between px-6 py-4 transition-colors duration-300 md:px-12 ${
        scrolled ? 'bg-background/80 backdrop-blur-lg' : ''
      }`}
    >
      <a href="/" className="display-heading logo-shimmer font-display text-xl">
        Pandora.
      </a>

      <div className="flex items-center gap-6">
        <a
          href="https://docs.pandorakit.dev"
          className="text-muted text-sm transition-colors hover:text-foreground"
        >
          Docs
        </a>
        <a
          href="https://github.com/buttersmoothio/pandora"
          className="text-muted text-sm transition-colors hover:text-foreground"
        >
          GitHub
        </a>
        <PrimaryButton href="https://docs.pandorakit.dev/user-guide" size="sm">
          Get Started
        </PrimaryButton>
      </div>
    </nav>
  )
}
