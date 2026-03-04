'use client'

import { BotIcon, Loader2Icon, PlugIcon, RadioIcon, WrenchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { UnifiedPluginCard } from '@/components/settings/unified-plugin-card'
import { usePlugins } from '@/hooks/use-plugins'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Filter pills
// ---------------------------------------------------------------------------

type FilterKey = 'all' | 'tools' | 'agents' | 'channels'

const FILTERS: { key: FilterKey; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'All', icon: PlugIcon },
  { key: 'tools', label: 'Tools', icon: WrenchIcon },
  { key: 'agents', label: 'Agents', icon: BotIcon },
  { key: 'channels', label: 'Channels', icon: RadioIcon },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PluginsPage() {
  const { plugins, isLoading, error } = usePlugins()
  const [filter, setFilter] = useState<FilterKey>('all')

  const filtered = useMemo(() => {
    if (!plugins) return []
    if (filter === 'all') return plugins
    return plugins.filter((p) => p.provides[filter])
  }, [plugins, filter])

  const enabled = useMemo(() => filtered.filter((p) => p.enabled), [filtered])
  const disabled = useMemo(() => filtered.filter((p) => !enabled.includes(p)), [filtered, enabled])

  // Count how many plugins match each filter
  const counts = useMemo(() => {
    if (!plugins) return { all: 0, tools: 0, agents: 0, channels: 0 }
    return {
      all: plugins.length,
      tools: plugins.filter((p) => p.provides.tools).length,
      agents: plugins.filter((p) => p.provides.agents).length,
      channels: plugins.filter((p) => p.provides.channels).length,
    }
  }, [plugins])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-destructive">Failed to load plugins: {error.message}</p>
      </div>
    )
  }

  if (!plugins || plugins.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <PlugIcon className="size-10" />
        <p className="text-sm">No plugins available.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Plugins</h1>

      <div className="flex gap-2">
        {FILTERS.map(({ key, label, icon: Icon }) => {
          const count = counts[key]
          if (key !== 'all' && count === 0) return null
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                filter === key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-3.5" />
              {label}
              <span className="text-xs opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      <section className="flex flex-col gap-4">
        {enabled.map((plugin) => (
          <UnifiedPluginCard key={plugin.id} plugin={plugin} />
        ))}
      </section>

      {disabled.length > 0 && (
        <>
          <p className="text-muted-foreground text-xs uppercase tracking-wider">Disabled</p>
          <section className="flex flex-col gap-4 opacity-75">
            {disabled.map((plugin) => (
              <UnifiedPluginCard key={plugin.id} plugin={plugin} />
            ))}
          </section>
        </>
      )}
    </div>
  )
}
