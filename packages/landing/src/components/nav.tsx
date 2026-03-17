import { PrimaryButton } from './primary-button'

export function Nav(): React.JSX.Element {
  return (
    <nav className="fixed top-0 z-50 flex w-full items-center justify-between px-6 py-4 md:px-12">
      <a
        href="/"
        className="font-display text-xl text-foreground"
        style={{ fontVariationSettings: "'SOFT' 64, 'WONK' 1, 'opsz' 144, 'wght' 411" }}
      >
        Pandora<span className="text-accent">.</span>
      </a>

      <div className="flex items-center gap-6">
        <a
          href="https://docs.pandorakit.dev"
          className="text-sm text-muted transition-colors hover:text-foreground"
        >
          Docs
        </a>
        <a
          href="https://github.com/buttersmoothio/pandora"
          className="text-sm text-muted transition-colors hover:text-foreground"
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
