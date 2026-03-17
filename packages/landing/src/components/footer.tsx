export function Footer(): React.JSX.Element {
  return (
    <footer className="border-border border-t px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 md:flex-row">
        <span className="display-heading font-display text-foreground text-lg">
          Pandora<span className="text-accent">.</span>
        </span>

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
          <a
            href="https://docs.pandorakit.dev/extending"
            className="text-muted text-sm transition-colors hover:text-foreground"
          >
            Build a Plugin
          </a>
        </div>

        <span className="text-muted text-xs">MIT {new Date().getFullYear()} &copy; Pandora</span>
      </div>
    </footer>
  )
}
