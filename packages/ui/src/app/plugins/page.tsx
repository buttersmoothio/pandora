'use client'

import {
  BotIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PlugIcon,
  RadioIcon,
  WrenchIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProviderLogo } from '@/components/provider-logo'
import { PluginCard, usePluginConfigDraft } from '@/components/settings/plugin-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import type { ModelConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import type { UnifiedPluginInfo } from '@/hooks/use-plugins'
import { usePlugins } from '@/hooks/use-plugins'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Capability summary
// ---------------------------------------------------------------------------

function capabilityCount(provides: UnifiedPluginInfo['provides'], key: string): number {
  if (key === 'tools') return provides.tools?.tools.length ?? 0
  if (key === 'agents') return provides.agents?.agents.length ?? 0
  if (key === 'channels')
    return (provides.channels?.webhook ? 1 : 0) + (provides.channels?.realtime ? 1 : 0)
  return 0
}

function CapabilitySummary({ provides }: { provides: UnifiedPluginInfo['provides'] }) {
  const parts: string[] = []
  for (const key of Object.keys(provides)) {
    const count = capabilityCount(provides, key)
    const singular = key.slice(0, -1)
    const plural = key
    parts.push(count > 0 ? `${count} ${count === 1 ? singular : plural}` : plural)
  }
  if (parts.length === 0) return null
  return <p className="text-muted-foreground text-xs">Provides {parts.join(' · ')}</p>
}

// ---------------------------------------------------------------------------
// Per-agent model override (inside dialog)
// ---------------------------------------------------------------------------

function AgentModelOverride({
  agentId,
  agentName,
  agentDescription,
  currentModel,
}: {
  agentId: string
  agentName: string
  agentDescription?: string
  currentModel?: { provider: string; model: string }
}) {
  const { setConfig: setDraft } = usePluginConfigDraft()
  const { data: modelsData } = useModels()
  const [customModel, setCustomModel] = useState(!!currentModel)
  const [provider, setProvider] = useState(currentModel?.provider ?? '')
  const [model, setModel] = useState(currentModel?.model ?? '')
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => {
    setCustomModel(!!currentModel)
    setProvider(currentModel?.provider ?? '')
    setModel(currentModel?.model ?? '')
  }, [currentModel])

  const allProviders = modelsData?.providers ?? []
  const providers = [...allProviders].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const selectedProvider = allProviders.find((p) => p.id === provider)
  const models = selectedProvider?.models ?? []

  function updateAgentModel(modelValue: ModelConfig | null | undefined) {
    setDraft((prev) => {
      const agents = (prev.agents ?? {}) as Record<string, unknown>
      return {
        ...prev,
        agents: {
          ...agents,
          [agentId]: {
            ...((agents[agentId] as Record<string, unknown>) ?? {}),
            ...(modelValue !== undefined ? { model: modelValue } : {}),
          },
        },
      }
    })
  }

  function handleCustomModelToggle(checked: boolean) {
    setCustomModel(checked)
    if (!checked) {
      setProvider('')
      setModel('')
      updateAgentModel(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div>
        <p className="font-medium text-sm">{agentName}</p>
        {agentDescription && <p className="text-muted-foreground text-xs">{agentDescription}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id={`${agentId}-custom-model`}
          checked={customModel}
          onCheckedChange={handleCustomModelToggle}
          size="sm"
        />
        <Label htmlFor={`${agentId}-custom-model`}>Custom model</Label>
      </div>
      {customModel && (
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <Popover open={providerOpen} onOpenChange={setProviderOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between font-normal">
                  <span className="flex items-center gap-2 truncate">
                    {selectedProvider && (
                      <ProviderLogo providerId={provider} className="size-3.5" />
                    )}
                    {selectedProvider ? selectedProvider.name : provider || 'Provider...'}
                  </span>
                  <ChevronsUpDownIcon className="ml-2 size-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0">
                <Command>
                  <CommandInput placeholder="Search providers..." />
                  <CommandList>
                    <CommandEmpty>No provider found.</CommandEmpty>
                    {providers.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        onSelect={() => {
                          setProvider(p.id)
                          if (provider !== p.id) setModel('')
                          setProviderOpen(false)
                        }}
                      >
                        <CheckIcon
                          className={cn(
                            'mr-2 size-4',
                            provider === p.id ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <ProviderLogo providerId={p.id} />
                        <span className="truncate">{p.name}</span>
                        {!p.configured && (
                          <span className="ml-auto text-muted-foreground text-xs">
                            Not configured
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-between font-normal"
                  disabled={!provider}
                >
                  {model || 'Model...'}
                  <ChevronsUpDownIcon className="ml-2 size-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0">
                <Command>
                  <CommandInput placeholder="Search models..." />
                  <CommandList>
                    <CommandEmpty>No model found.</CommandEmpty>
                    {models.map((m) => (
                      <CommandItem
                        key={m}
                        value={m}
                        onSelect={() => {
                          setModel(m)
                          setModelOpen(false)
                          if (provider) updateAgentModel({ provider, model: m })
                        }}
                      >
                        <CheckIcon
                          className={cn('mr-2 size-4', model === m ? 'opacity-100' : 'opacity-0')}
                        />
                        {m}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-tool list with approval toggles
// ---------------------------------------------------------------------------

function ToolList({
  plugin,
  provides,
}: {
  plugin: UnifiedPluginInfo
  provides: UnifiedPluginInfo['provides']
}) {
  const { config: draft, setConfig: setDraft } = usePluginConfigDraft()
  if (!provides.tools) return null

  const manifestDefault = provides.tools.requireApproval ?? false
  const perTool = (draft.requireApproval ?? {}) as Record<string, boolean>

  function toggleApproval(toolId: string, checked: boolean) {
    setDraft((prev) => ({
      ...prev,
      requireApproval: {
        ...((prev.requireApproval ?? {}) as Record<string, boolean>),
        [toolId]: checked,
      },
    }))
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {provides.tools.tools.map((tool) => (
          <div key={tool.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{tool.name}</p>
              <p className="text-muted-foreground text-xs">{tool.description}</p>
            </div>
            {plugin.enabled && (
              <div className="flex shrink-0 items-center gap-2">
                <Label htmlFor={`${tool.id}-approval`} className="text-muted-foreground text-xs">
                  Approval
                </Label>
                <Switch
                  id={`${tool.id}-approval`}
                  checked={perTool[tool.id] ?? manifestDefault}
                  onCheckedChange={(checked) => toggleApproval(tool.id, checked)}
                  size="sm"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {provides.tools.alerts.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          {provides.tools.alerts.map((a, i) => (
            <p key={`${i}-${a.message}`} className="text-muted-foreground text-xs">
              {a.message}
            </p>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Plugin dialog content
// ---------------------------------------------------------------------------

function PluginDialogContent({ plugin }: { plugin: UnifiedPluginInfo }) {
  const provides = plugin.provides

  return (
    <div className="flex flex-col gap-4">
      {/* Tools section */}
      {provides.tools && provides.tools.tools.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Tools ({provides.tools.tools.length})
          </p>
          <ToolList plugin={plugin} provides={provides} />
        </div>
      )}

      {/* Agents section */}
      {provides.agents && provides.agents.agents.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Agents ({provides.agents.agents.length})
          </p>
          {provides.agents.agents.map((agent) => (
            <AgentModelOverride
              key={agent.id}
              agentId={agent.id}
              agentName={agent.name}
              agentDescription={agent.description}
              currentModel={agent.model}
            />
          ))}
        </div>
      )}

      {/* Channels section */}
      {provides.channels && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Channels
          </p>
          <div className="flex flex-wrap gap-1.5">
            {provides.channels.webhook && (
              <Badge variant="outline">
                <RadioIcon className="size-3" />
                Webhook
              </Badge>
            )}
            {provides.channels.realtime && (
              <Badge variant="outline">
                <RadioIcon className="size-3" />
                Realtime
              </Badge>
            )}
            {!provides.channels.loaded && (
              <span className="text-muted-foreground text-xs">Not configured</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plugin card wrapper
// ---------------------------------------------------------------------------

function UnifiedPluginCard({ plugin }: { plugin: UnifiedPluginInfo }) {
  const permissions = plugin.provides.tools
    ? {
      permissions: plugin.provides.tools.permissions as Record<string, boolean | string[]>,
      sandbox: (plugin.provides.tools.sandbox ?? 'compartment') as 'compartment' | 'host',
    }
    : undefined

  return (
    <PluginCard
      plugin={plugin}
      configKey="plugins"
      permissions={permissions}
      summary={<CapabilitySummary provides={plugin.provides} />}
      dialogContent={<PluginDialogContent plugin={plugin} />}
    />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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

  const enabled = useMemo(
    () =>
      filtered.filter(
        (p) =>
          p.enabled &&
          p.envConfigured &&
          p.validationErrors.length === 0 &&
          p.configFields
            .filter((f) => f.required)
            .every((f) => {
              const val = p.config[f.key]
              return typeof val === 'string' ? val.trim() !== '' : val != null
            }),
      ),
    [filtered],
  )
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
