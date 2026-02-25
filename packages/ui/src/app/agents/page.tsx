'use client'

import {
  AlertTriangleIcon,
  BotIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  DicesIcon,
  FolderIcon,
  GlobeIcon,
  KeyIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfigField } from '@/components/settings/config-field'
import { EnvVarWarning } from '@/components/settings/env-var-warning'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import {
  type AgentInfo,
  type AgentPluginInfo,
  type ScopedToolInfo,
  useAgents,
} from '@/hooks/use-agents'
import type { ModelConfig } from '@/hooks/use-config'
import { useUpdateConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Permission badges (shared pattern from tools page)
// ---------------------------------------------------------------------------

const PERMISSION_BADGES: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  time: { label: 'Time', icon: ClockIcon },
  network: { label: 'Network', icon: GlobeIcon },
  env: { label: 'Env', icon: KeyIcon },
  fs: { label: 'Filesystem', icon: FolderIcon },
  random: { label: 'Random', icon: DicesIcon },
}

// ---------------------------------------------------------------------------
// Scoped tool row
// ---------------------------------------------------------------------------

function ScopedToolRow({
  tool,
  pluginId,
  pluginConfig,
}: {
  tool: ScopedToolInfo
  pluginId: string
  pluginConfig: Record<string, unknown>
}) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(tool.enabled)

  useEffect(() => {
    setEnabled(tool.enabled)
  }, [tool])

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    const currentTools = (pluginConfig.tools ?? {}) as Record<string, { enabled: boolean }>
    updateConfig.mutate({
      agentPlugins: {
        [pluginId]: {
          ...pluginConfig,
          enabled: (pluginConfig.enabled as boolean) ?? true,
          tools: { ...currentTools, [tool.id]: { enabled: checked } },
        },
      },
    })
  }

  const permissions = tool.permissions ?? {}
  const permissionKeys = Object.keys(permissions).filter(
    (k) => permissions[k as keyof typeof permissions],
  )

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-sm">{tool.name}</p>
          <p className="text-muted-foreground text-xs">{tool.description}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {tool.sandbox}
            </Badge>
            {permissionKeys.map((key) => {
              const badge = PERMISSION_BADGES[key]
              if (!badge) return null
              const Icon = badge.icon
              return (
                <Badge key={key} variant="secondary" className="text-[10px]">
                  <Icon className="size-3" />
                  {badge.label}
                </Badge>
              )
            })}
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent row with model selector
// ---------------------------------------------------------------------------

function AgentRow({ agent }: { agent: AgentInfo }) {
  const updateConfig = useUpdateConfig()
  const { data: modelsData } = useModels()
  const [enabled, setEnabled] = useState(agent.enabled)
  const [customModel, setCustomModel] = useState(!!agent.model)
  const [provider, setProvider] = useState(agent.model?.provider ?? '')
  const [model, setModel] = useState(agent.model?.model ?? '')
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => {
    setEnabled(agent.enabled)
    setCustomModel(!!agent.model)
    setProvider(agent.model?.provider ?? '')
    setModel(agent.model?.model ?? '')
  }, [agent])

  const allProviders = modelsData?.providers ?? []
  const providers = [...allProviders].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const selectedProvider = allProviders.find((p) => p.id === provider)
  const models = selectedProvider?.models ?? []

  function save(overrides?: { enabled?: boolean; model?: ModelConfig | null }) {
    const isEnabled = overrides?.enabled ?? enabled
    const modelValue =
      overrides?.model !== undefined
        ? overrides.model
        : customModel
          ? { provider, model }
          : undefined
    updateConfig.mutate({
      agents: {
        [agent.id]: {
          enabled: isEnabled,
          ...(modelValue ? { model: modelValue } : {}),
        },
      },
    })
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    save({ enabled: checked })
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
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-sm">{agent.name}</p>
          <p className="text-muted-foreground text-xs">{agent.description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Switch
              id={`${agent.id}-custom-model`}
              checked={customModel}
              onCheckedChange={handleCustomModelToggle}
              size="sm"
            />
            <Label htmlFor={`${agent.id}-custom-model`}>Custom model</Label>
          </div>

          {customModel && (
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="justify-between font-normal">
                      {selectedProvider ? selectedProvider.name : provider || 'Provider...'}
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
                            }}
                          >
                            <CheckIcon
                              className={cn(
                                'mr-2 size-4',
                                model === m ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            {m}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                size="sm"
                disabled={updateConfig.isPending || !provider || !model}
                onClick={() => save()}
              >
                {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plugin status badge
// ---------------------------------------------------------------------------

function PluginStatusBadge({
  plugin,
  configured,
}: {
  plugin: AgentPluginInfo
  configured: boolean
}) {
  if (plugin.validationErrors.length > 0) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        <AlertTriangleIcon className="size-3" />
        Invalid config
      </Badge>
    )
  }
  if (!plugin.envConfigured) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        <XCircleIcon className="size-3" />
        Missing env vars
      </Badge>
    )
  }
  if (configured) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        <CheckCircle2Icon className="size-3" />
        Configured
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      Not configured
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Agent plugin card
// ---------------------------------------------------------------------------

function AgentPluginCard({ plugin, agents }: { plugin: AgentPluginInfo; agents: AgentInfo[] }) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(plugin.enabled)
  const [fields, setFields] = useState<Record<string, unknown>>(plugin.config)

  useEffect(() => {
    setEnabled(plugin.enabled)
    setFields(plugin.config)
  }, [plugin])

  const requiredFieldsFilled = plugin.configFields
    .filter((f) => f.required)
    .every((f) => {
      const val = fields[f.key]
      return typeof val === 'string' ? val.trim() !== '' : val != null
    })

  const savedRequiredFieldsFilled = plugin.configFields
    .filter((f) => f.required)
    .every((f) => {
      const val = plugin.config[f.key]
      return typeof val === 'string' ? val.trim() !== '' : val != null
    })

  const configured = plugin.envConfigured && savedRequiredFieldsFilled
  const canEnable = plugin.envConfigured && requiredFieldsFilled

  const isDirty =
    enabled !== plugin.enabled || JSON.stringify(fields) !== JSON.stringify(plugin.config)

  function save() {
    updateConfig.mutate({
      agentPlugins: { [plugin.id]: { ...fields, enabled } },
    })
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    updateConfig.mutate({
      agentPlugins: { [plugin.id]: { ...plugin.config, enabled: checked } },
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm">{plugin.name}</CardTitle>
          <CardDescription className="font-mono text-xs">{plugin.id}</CardDescription>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <PluginStatusBadge plugin={plugin} configured={configured} />
          </div>
        </div>
        <CardAction>
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={!canEnable} />
        </CardAction>
      </CardHeader>

      {!plugin.envConfigured && plugin.envVars.length > 0 && (
        <CardContent>
          <EnvVarWarning envVars={plugin.envVars} />
        </CardContent>
      )}

      {plugin.validationErrors.length > 0 && (
        <CardContent>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-destructive">
              <AlertTriangleIcon className="size-3.5" />
              Invalid configuration
            </p>
            <ul className="mt-1.5 list-inside list-disc text-muted-foreground">
              {plugin.validationErrors.map((err) => (
                <li key={err} className="font-mono text-xs">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      )}

      {plugin.envConfigured && plugin.configFields.length > 0 && (
        <CardContent className="flex flex-col gap-4">
          {plugin.configFields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              scopeId={plugin.id}
              value={fields[field.key]}
              onChange={(v) => setFields({ ...fields, [field.key]: v })}
            />
          ))}

          {isDirty && (
            <Button size="sm" className="self-end" disabled={updateConfig.isPending} onClick={save}>
              {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
            </Button>
          )}
        </CardContent>
      )}

      {enabled && agents.length > 0 && (
        <CardContent className="flex flex-col gap-3">
          <p className="font-medium text-muted-foreground text-xs">Agents</p>
          {agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </CardContent>
      )}

      {enabled && plugin.tools.length > 0 && (
        <CardContent className="flex flex-col gap-3">
          <p className="font-medium text-muted-foreground text-xs">Tools</p>
          {plugin.tools.map((tool) => (
            <ScopedToolRow
              key={tool.id}
              tool={tool}
              pluginId={plugin.id}
              pluginConfig={plugin.config}
            />
          ))}
        </CardContent>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const { agents, plugins, isLoading, error } = useAgents()

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
        <p className="text-destructive">Failed to load agents: {error.message}</p>
      </div>
    )
  }

  if (!plugins || plugins.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <BotIcon className="size-10" />
        <p className="text-sm">No agent plugins available.</p>
      </div>
    )
  }

  const agentsById = new Map((agents ?? []).map((a) => [a.id, a]))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Agents</h1>

      <section className="flex flex-col gap-4">
        {plugins.map((plugin) => {
          const pluginAgents = plugin.agentIds
            .map((id) => agentsById.get(id))
            .filter((a): a is AgentInfo => a != null)
          return <AgentPluginCard key={plugin.id} plugin={plugin} agents={pluginAgents} />
        })}
      </section>
    </div>
  )
}
