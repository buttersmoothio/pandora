'use client'

import type { ModelConfig, UnifiedPluginInfo } from '@pandorakit/react-sdk'
import { useModels } from '@pandorakit/react-sdk'
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { ProviderLogo } from '@/components/provider-logo'
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
import { cn } from '@/lib/utils'
import { PluginCard, usePluginConfigDraft } from './plugin-card'

// ---------------------------------------------------------------------------
// Capability summary
// ---------------------------------------------------------------------------

function capabilityCount(provides: UnifiedPluginInfo['provides'], key: string): number {
  if (key === 'tools') {
    return provides.tools?.tools.length ?? 0
  }
  if (key === 'agents') {
    return provides.agents?.agents.length ?? 0
  }
  if (key === 'channels') {
    return (provides.channels?.webhook ? 1 : 0) + (provides.channels?.realtime ? 1 : 0)
  }
  return 0
}

function CapabilitySummary({
  provides,
}: {
  provides: UnifiedPluginInfo['provides']
}): React.JSX.Element | null {
  const parts: string[] = []
  for (const key of Object.keys(provides)) {
    const count = capabilityCount(provides, key)
    const singular = key.slice(0, -1)
    const plural = key
    parts.push(count > 0 ? `${count} ${count === 1 ? singular : plural}` : plural)
  }
  if (parts.length === 0) {
    return null
  }
  return <p className="text-muted-foreground text-xs">Provides {parts.join(' \u00b7 ')}</p>
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
}): React.JSX.Element {
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
    if (a.configured !== b.configured) {
      return a.configured ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
  const selectedProvider = allProviders.find((p) => p.id === provider)
  const models = selectedProvider?.models ?? []

  function updateAgentModel(modelValue: ModelConfig | null | undefined): void {
    setDraft((prev) => {
      const agents = (prev.agents ?? {}) as Record<string, Record<string, unknown>>
      return {
        ...prev,
        agents: {
          ...agents,
          [agentId]: {
            ...(agents[agentId] ?? {}),
            ...(modelValue === undefined ? {} : { model: modelValue }),
          },
        },
      }
    })
  }

  function handleCustomModelToggle(checked: boolean): void {
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
                        onSelect={(): void => {
                          setProvider(p.id)
                          if (provider !== p.id) {
                            setModel('')
                          }
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
                        onSelect={(): void => {
                          setModel(m)
                          setModelOpen(false)
                          if (provider) {
                            updateAgentModel({ provider, model: m })
                          }
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
}): React.JSX.Element | null {
  const { config: draft, setConfig: setDraft } = usePluginConfigDraft()
  if (!provides.tools) {
    return null
  }

  const manifestDefault = provides.tools.requireApproval ?? false
  const perTool = (draft.requireApproval ?? {}) as Record<string, boolean>

  function toggleApproval(toolId: string, checked: boolean): void {
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
                  onCheckedChange={(checked: boolean): void => toggleApproval(tool.id, checked)}
                  size="sm"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {provides.tools.alerts.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          {provides.tools.alerts.map((a) => (
            <p key={a.message} className="text-muted-foreground text-xs">
              {a.message}
            </p>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Plugin dialog content (tools + agents)
// ---------------------------------------------------------------------------

function PluginDialogContent({ plugin }: { plugin: UnifiedPluginInfo }): React.JSX.Element {
  const provides = plugin.provides

  return (
    <div className="flex flex-col gap-4">
      {provides.tools && provides.tools.tools.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Tools ({provides.tools.tools.length})
          </p>
          <ToolList plugin={plugin} provides={provides} />
        </div>
      )}

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
    </div>
  )
}

// ---------------------------------------------------------------------------
// UnifiedPluginCard — PluginCard with full dialog content
// ---------------------------------------------------------------------------

export function UnifiedPluginCard({ plugin }: { plugin: UnifiedPluginInfo }): React.JSX.Element {
  const permissions = plugin.provides.tools
    ? {
        permissions: plugin.provides.tools.permissions as Record<string, boolean | string[]>,
        sandbox: plugin.provides.tools.sandbox ?? 'compartment',
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
