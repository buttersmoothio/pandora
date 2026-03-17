export function Footer(): React.JSX.Element {
  return (
    <footer className="border-t border-border px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 md:flex-row">
        <span className="display-heading font-display text-lg text-foreground">
          Pandora<span className="text-accent">.</span>
        </span>

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
          <a
            href="https://docs.pandorakit.dev/extending"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Build a Plugin
          </a>
        </div>

        <span className="text-xs text-muted">MIT {new Date().getFullYear()} &copy; Pandora</span>
      </div>
    </footer>
  )
}
