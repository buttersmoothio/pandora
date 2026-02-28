'use client'

import {
  BotIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  DatabaseIcon,
  Loader2Icon,
  PlugIcon,
  RadioIcon,
  WrenchIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { ProviderLogo } from '@/components/provider-logo'
import { PluginCard } from '@/components/settings/plugin-card'
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
import { useUpdateConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import type { UnifiedPluginInfo } from '@/hooks/use-plugins'
import { usePlugins } from '@/hooks/use-plugins'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Capability badges
// ---------------------------------------------------------------------------

const CAPABILITY_ICONS: Record<string, React.ElementType> = {
  tools: WrenchIcon,
  agents: BotIcon,
  channels: RadioIcon,
  storage: DatabaseIcon,
  vector: DatabaseIcon,
}

function CapabilityBadges({ provides }: { provides: UnifiedPluginInfo['provides'] }) {
  const keys = Object.keys(provides)
  if (keys.length === 0) return null
  return (
    <>
      {keys.map((key) => {
        const Icon = CAPABILITY_ICONS[key] ?? PlugIcon
        return (
          <Badge key={key} variant="outline">
            <Icon className="size-3" />
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </Badge>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Per-agent model override (inside dialog)
// ---------------------------------------------------------------------------

function AgentModelOverride({
  agentId,
  agentName,
  pluginId,
  currentModel,
  pluginConfig,
}: {
  agentId: string
  agentName: string
  pluginId: string
  currentModel?: { provider: string; model: string }
  pluginConfig: Record<string, unknown>
}) {
  const updateConfig = useUpdateConfig()
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

  function save(overrides?: { model?: ModelConfig | null }) {
    const modelValue =
      overrides?.model !== undefined
        ? (overrides.model ?? undefined)
        : customModel
          ? { provider, model }
          : undefined
    const agents = (pluginConfig.agents ?? {}) as Record<string, unknown>
    updateConfig.mutate({
      plugins: {
        [pluginId]: {
          ...pluginConfig,
          enabled: (pluginConfig.enabled as boolean | undefined) ?? true,
          agents: {
            ...agents,
            [agentId]: {
              ...((agents[agentId] as Record<string, unknown>) ?? {}),
              ...(modelValue !== undefined ? { model: modelValue } : {}),
            },
          },
        },
      },
    })
  }

  function handleCustomModelToggle(checked: boolean) {
    setCustomModel(checked)
    if (!checked) {
      setProvider('')
      setModel('')
      save({ model: null })
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="font-medium text-sm">{agentName}</p>
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
                          if (provider) save({ model: { provider, model: m } })
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
// Plugin dialog content
// ---------------------------------------------------------------------------

function PluginDialogContent({ plugin }: { plugin: UnifiedPluginInfo }) {
  const updateConfig = useUpdateConfig()
  const provides = plugin.provides

  return (
    <div className="flex flex-col gap-4">
      {/* Tools section */}
      {provides.tools && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Tools ({provides.tools.toolIds.length})
          </p>
          {provides.tools.alerts.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              {provides.tools.alerts.map((a, i) => (
                <p key={`${i}-${a.message}`} className="text-muted-foreground text-xs">
                  {a.message}
                </p>
              ))}
            </div>
          )}
          {plugin.enabled && (
            <div className="flex items-center gap-3">
              <Switch
                id={`${plugin.id}-approval`}
                checked={!!plugin.config.requireApproval}
                onCheckedChange={(checked) => {
                  updateConfig.mutate({
                    plugins: {
                      [plugin.id]: {
                        ...plugin.config,
                        requireApproval: checked,
                        enabled: plugin.enabled,
                      },
                    },
                  })
                }}
                size="sm"
              />
              <Label htmlFor={`${plugin.id}-approval`}>Require Approval</Label>
            </div>
          )}
        </div>
      )}

      {/* Agents section */}
      {provides.agents && provides.agents.agents.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Agents
          </p>
          {provides.agents.agents.map((agent) => (
            <AgentModelOverride
              key={agent.id}
              agentId={agent.id}
              agentName={agent.name}
              pluginId={plugin.id}
              currentModel={agent.model}
              pluginConfig={plugin.config}
            />
          ))}
        </div>
      )}

      {/* Channels section */}
      {provides.channels && (
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
        </div>
      )}

      {/* Storage / Vector info */}
      {provides.storage && (
        <div className="flex items-center gap-2">
          <Badge variant={provides.storage.active ? 'default' : 'secondary'}>
            <DatabaseIcon className="size-3" />
            {provides.storage.active ? 'Active' : 'Installed'}
          </Badge>
          <span className="text-muted-foreground text-xs">
            Set via <code>STORAGE_PROVIDER</code> env var
          </span>
        </div>
      )}
      {provides.vector && (
        <div className="flex items-center gap-2">
          <Badge variant={provides.vector.active ? 'default' : 'secondary'}>
            <DatabaseIcon className="size-3" />
            {provides.vector.active ? 'Active' : 'Installed'}
          </Badge>
          <span className="text-muted-foreground text-xs">
            Set via <code>VECTOR_PROVIDER</code> env var
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plugin card wrapper
// ---------------------------------------------------------------------------

function UnifiedPluginCard({ plugin }: { plugin: UnifiedPluginInfo }) {
  const isInfra = !!plugin.provides.storage || !!plugin.provides.vector
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
      readonly={isInfra}
      permissions={permissions}
      compactPermissions={permissions}
      badges={<CapabilityBadges provides={plugin.provides} />}
      dialogContent={<PluginDialogContent plugin={plugin} />}
    />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PluginsPage() {
  const { plugins, isLoading, error } = usePlugins()

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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Plugins</h1>

      <section className="flex flex-col gap-4">
        {plugins.map((plugin) => (
          <UnifiedPluginCard key={plugin.id} plugin={plugin} />
        ))}
      </section>
    </div>
  )
}
