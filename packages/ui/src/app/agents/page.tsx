'use client'

import {
  AlertTriangleIcon,
  BotIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  SettingsIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProviderLogo } from '@/components/provider-logo'
import { PermissionDisplay } from '@/components/settings/permission-display'
import { type PluginBase, PluginCard, PluginInfoDialog } from '@/components/settings/plugin-card'
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
import {
  type AgentInfo,
  type AgentPluginInfo,
  type ScopedToolInfo,
  useAgents,
} from '@/hooks/use-agents'
import type { ModelConfig } from '@/hooks/use-config'
import { useConfig, useUpdateConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Scoped tool row
// ---------------------------------------------------------------------------

function ScopedToolRow({
  tool,
  agentId,
  agentConfig,
}: {
  tool: ScopedToolInfo
  agentId: string
  agentConfig?: { enabled: boolean; tools?: Record<string, { enabled: boolean }> }
}) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(tool.enabled)

  useEffect(() => {
    setEnabled(tool.enabled)
  }, [tool])

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    const currentTools = agentConfig?.tools ?? {}
    updateConfig.mutate({
      agents: {
        [agentId]: {
          enabled: agentConfig?.enabled ?? true,
          tools: { ...currentTools, [tool.id]: { enabled: checked } },
        },
      },
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-sm">{tool.name}</p>
          <p className="text-muted-foreground text-xs">{tool.description}</p>
          <div className="mt-1">
            <PermissionDisplay
              permissions={tool.permissions as Record<string, boolean | string[]>}
              sandbox={tool.sandbox}
              compact
            />
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent settings dialog content
// ---------------------------------------------------------------------------

function AgentSettingsContent({
  agent,
  agentConfig,
}: {
  agent: AgentInfo
  agentConfig?: { enabled: boolean; tools?: Record<string, { enabled: boolean }> }
}) {
  const updateConfig = useUpdateConfig()
  const { data: modelsData } = useModels()
  const [customModel, setCustomModel] = useState(!!agent.model)
  const [provider, setProvider] = useState(agent.model?.provider ?? '')
  const [model, setModel] = useState(agent.model?.model ?? '')
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => {
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

  function save(overrides?: { model?: ModelConfig | null }) {
    const modelValue =
      overrides?.model !== undefined
        ? (overrides.model ?? undefined)
        : customModel
          ? { provider, model }
          : undefined
    updateConfig.mutate({
      agents: {
        [agent.id]: {
          enabled: agent.enabled,
          ...(modelValue !== undefined ? { model: modelValue } : {}),
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
    <div className="flex flex-col gap-3">
      {/* Custom model toggle */}
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
        <ModelSelector
          provider={provider}
          model={model}
          providers={providers}
          models={models}
          selectedProvider={selectedProvider}
          providerOpen={providerOpen}
          modelOpen={modelOpen}
          onProviderChange={(id) => {
            setProvider(id)
            if (provider !== id) setModel('')
          }}
          onModelSelect={(m) => {
            setModel(m)
            if (provider) save({ model: { provider, model: m } })
          }}
          onProviderOpenChange={setProviderOpen}
          onModelOpenChange={setModelOpen}
        />
      )}

      {/* Scoped tools */}
      {agent.tools.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs">Tools</p>
          {agent.tools.map((tool) => (
            <ScopedToolRow key={tool.id} tool={tool} agentId={agent.id} agentConfig={agentConfig} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Model selector (extracted to reduce complexity)
// ---------------------------------------------------------------------------

interface ProviderInfo {
  id: string
  name: string
  configured: boolean
  models: string[]
}

function ModelSelector({
  provider,
  model,
  providers,
  models,
  selectedProvider,
  providerOpen,
  modelOpen,
  onProviderChange,
  onModelSelect,
  onProviderOpenChange,
  onModelOpenChange,
}: {
  provider: string
  model: string
  providers: ProviderInfo[]
  models: string[]
  selectedProvider?: ProviderInfo
  providerOpen: boolean
  modelOpen: boolean
  onProviderChange: (id: string) => void
  onModelSelect: (m: string) => void
  onProviderOpenChange: (open: boolean) => void
  onModelOpenChange: (open: boolean) => void
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-1 flex-col gap-2">
        <Popover open={providerOpen} onOpenChange={onProviderOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="justify-between font-normal">
              <span className="flex items-center gap-2 truncate">
                {selectedProvider && <ProviderLogo providerId={provider} className="size-3.5" />}
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
                      onProviderChange(p.id)
                      onProviderOpenChange(false)
                    }}
                  >
                    <CheckIcon
                      className={cn('mr-2 size-4', provider === p.id ? 'opacity-100' : 'opacity-0')}
                    />
                    <ProviderLogo providerId={p.id} />
                    <span className="truncate">{p.name}</span>
                    {!p.configured && (
                      <span className="ml-auto text-muted-foreground text-xs">Not configured</span>
                    )}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <Popover open={modelOpen} onOpenChange={onModelOpenChange}>
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
                      onModelSelect(m)
                      onModelOpenChange(false)
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
  )
}

// ---------------------------------------------------------------------------
// Adapt AgentInfo → PluginBase (inherits metadata from parent plugin)
// ---------------------------------------------------------------------------

function agentAsPlugin(
  agent: AgentInfo,
  parentPlugin: AgentPluginInfo,
  agentConfig?: { enabled: boolean; tools?: Record<string, { enabled: boolean }> },
): PluginBase {
  // Preserve model + tools in config so the dialog's save doesn't lose them
  const config: Record<string, unknown> = {}
  if (agent.model) config.model = agent.model
  if (agentConfig?.tools) config.tools = agentConfig.tools

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    author: parentPlugin.author,
    icon: parentPlugin.icon,
    version: parentPlugin.version,
    homepage: parentPlugin.homepage,
    repository: parentPlugin.repository,
    license: parentPlugin.license,
    envVars: [],
    envConfigured: true,
    configFields: [],
    enabled: agent.enabled,
    config,
    alerts: agent.alerts,
  }
}

// ---------------------------------------------------------------------------
// Agent row — uses PluginInfoDialog
// ---------------------------------------------------------------------------

function AgentRow({
  agent,
  parentPlugin,
  agentConfig,
}: {
  agent: AgentInfo
  parentPlugin: AgentPluginInfo
  agentConfig?: { enabled: boolean; tools?: Record<string, { enabled: boolean }> }
}) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(agent.enabled)

  useEffect(() => {
    setEnabled(agent.enabled)
  }, [agent])

  const infos = agent.alerts.filter((a) => a.level === 'info')
  const warnings = agent.alerts.filter((a) => a.level === 'warning')

  const modelSummary = useMemo(() => {
    if (!agent.model) return null
    return `${agent.model.provider}/${agent.model.model}`
  }, [agent.model])

  const plugin = agentAsPlugin(agent, parentPlugin, agentConfig)

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    updateConfig.mutate({
      agents: {
        [agent.id]: { enabled: checked },
      },
    })
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">{agent.name}</p>
            {infos.map((info, i) => (
              <Badge key={`${i}-${info.message}`} variant="outline">
                {info.message}
              </Badge>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">{agent.description}</p>
          {modelSummary && (
            <p className="mt-0.5 font-mono text-muted-foreground text-xs">{modelSummary}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {enabled && (
            <PluginInfoDialog
              plugin={plugin}
              configKey="agents"
              trigger={
                <Button variant="ghost" size="icon" className="size-7">
                  <SettingsIcon className="size-3.5" />
                </Button>
              }
            >
              <AgentSettingsContent agent={agent} agentConfig={agentConfig} />
            </PluginInfoDialog>
          )}
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mx-4 mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangleIcon className="size-3.5" />
            Warning
          </p>
          <ul className="mt-1.5 list-inside list-disc text-muted-foreground">
            {warnings.map((w, i) => (
              <li key={`${i}-${w.message}`} className="text-xs">
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent plugin card
// ---------------------------------------------------------------------------

function AgentPluginCard({
  plugin,
  agents,
  agentConfigs,
}: {
  plugin: AgentPluginInfo
  agents: AgentInfo[]
  agentConfigs: Record<string, { enabled: boolean; tools?: Record<string, { enabled: boolean }> }>
}) {
  return (
    <div className="flex flex-col gap-4">
      <PluginCard plugin={{ ...plugin, alerts: [] }} configKey="agentPlugins" />

      {plugin.enabled && agents.length > 0 && (
        <div className="flex flex-col gap-3 pl-4">
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              parentPlugin={plugin}
              agentConfig={agentConfigs[agent.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const { agents, plugins, isLoading, error } = useAgents()
  const { data: configData } = useConfig()

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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Agents</h1>

      <section className="flex flex-col gap-4">
        {plugins.map((plugin) => {
          const pluginAgents = plugin.agentIds
            .map((id) => agentsById.get(id))
            .filter((a): a is AgentInfo => a != null)
          return (
            <AgentPluginCard
              key={plugin.id}
              plugin={plugin}
              agents={pluginAgents}
              agentConfigs={configData?.agents ?? {}}
            />
          )
        })}
      </section>
    </div>
  )
}
