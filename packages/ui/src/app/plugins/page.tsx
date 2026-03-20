'use client'

import { BotIcon, CableIcon, Loader2Icon, PlugIcon, RadioIcon, WrenchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AddMcpServerDialog } from '@/components/settings/add-mcp-server-dialog'
import { McpServerCard } from '@/components/settings/mcp-server-card'
import { UnifiedPluginCard } from '@/components/settings/unified-plugin-card'
import { useMcpServers } from '@/hooks/use-mcp'
import { usePlugins } from '@/hooks/use-plugins'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Filter pills
// ---------------------------------------------------------------------------

type FilterKey = 'all' | 'tools' | 'agents' | 'channels' | 'mcp'

const FILTERS: { key: FilterKey; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'All', icon: PlugIcon },
  { key: 'tools', label: 'Tools', icon: WrenchIcon },
  { key: 'agents', label: 'Agents', icon: BotIcon },
  { key: 'channels', label: 'Channels', icon: RadioIcon },
  { key: 'mcp', label: 'MCP Servers', icon: CableIcon },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PluginsPage(): React.JSX.Element {
  const { plugins, isLoading, error } = usePlugins()
  const { servers: mcpServers, isLoading: mcpLoading } = useMcpServers()
  const [filter, setFilter] = useState<FilterKey>('all')

  const filtered = useMemo(() => {
    if (!plugins) {
      return []
    }
    if (filter === 'all' || filter === 'mcp') {
      return plugins
    }
    return plugins.filter((p) => p.provides[filter])
  }, [plugins, filter])

  const enabled = useMemo(() => filtered.filter((p) => p.enabled), [filtered])
  const disabled = useMemo(() => filtered.filter((p) => !enabled.includes(p)), [filtered, enabled])

  // Count how many plugins match each filter
  const counts = useMemo(() => {
    const pc = plugins?.length ?? 0
    const mc = mcpServers?.length ?? 0
    return {
      all: pc + mc,
      tools: plugins?.filter((p) => p.provides.tools).length ?? 0,
      agents: plugins?.filter((p) => p.provides.agents).length ?? 0,
      channels: plugins?.filter((p) => p.provides.channels).length ?? 0,
      mcp: mcpServers?.length ?? 0,
    }
  }, [plugins, mcpServers])

  const mcpEnabled = useMemo(() => mcpServers?.filter((s) => s.enabled) ?? [], [mcpServers])
  const mcpDisabled = useMemo(() => mcpServers?.filter((s) => !s.enabled) ?? [], [mcpServers])
  const showMcp = filter === 'all' || filter === 'mcp'
  const showPlugins = filter !== 'mcp'

  if (isLoading || mcpLoading) {
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 p-6">
      <h1 className="display-heading-medium font-display text-2xl">Plugins</h1>

      <div className="flex gap-2">
        {FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={(): void => setFilter(key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
              filter === key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="size-3.5" />
            {label}
            <span className="text-xs opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      {filter === 'mcp' && (
        <div className="flex justify-end">
          <AddMcpServerDialog />
        </div>
      )}

      {/* Enabled */}
      <section className="flex flex-col gap-4">
        {showPlugins &&
          enabled.map((plugin) => <UnifiedPluginCard key={plugin.id} plugin={plugin} />)}
        {showMcp && mcpEnabled.map((server) => <McpServerCard key={server.id} server={server} />)}
      </section>

      {showMcp && filter === 'mcp' && (!mcpServers || mcpServers.length === 0) && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-center text-muted-foreground text-sm">No servers configured</p>
          <AddMcpServerDialog />
        </div>
      )}

      {/* Disabled */}
      {(showPlugins && disabled.length > 0) || (showMcp && mcpDisabled.length > 0) ? (
        <>
          <p className="text-muted-foreground text-xs uppercase tracking-wider">Disabled</p>
          <section className="flex flex-col gap-4 opacity-75">
            {showPlugins &&
              disabled.map((plugin) => <UnifiedPluginCard key={plugin.id} plugin={plugin} />)}
            {showMcp &&
              mcpDisabled.map((server) => <McpServerCard key={server.id} server={server} />)}
          </section>
        </>
      ) : null}
    </div>
  )
}
