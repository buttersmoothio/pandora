'use client'

import {
  BotIcon,
  BrainIcon,
  CalendarIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Loader2Icon,
  PartyPopperIcon,
  PlugIcon,
  SparklesIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProviderLogo } from '@/components/provider-logo'
import { UnifiedPluginCard } from '@/components/settings/unified-plugin-card'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { type Config, type DeepPartial, useConfig, useUpdateConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import type { UnifiedPluginInfo } from '@/hooks/use-plugins'
import { usePlugins } from '@/hooks/use-plugins'
import { cn } from '@/lib/utils'

const TOTAL_STEPS = 5

const SUGGESTED_PLUGIN_IDS = [
  '@pandorakit/telegram',
  '@pandorakit/brave-search',
  '@pandorakit/research-agent',
]

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEP_KEYS = ['name', 'model', 'memory', 'schedule', 'plugins'] as const

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEP_KEYS.slice(0, total).map((key, i) => (
        <div
          key={key}
          className={cn(
            'h-2 rounded-full transition-all duration-300',
            i === current ? 'w-8 bg-primary' : i < current ? 'w-2 bg-primary/60' : 'w-2 bg-muted',
          )}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step layout wrapper
// ---------------------------------------------------------------------------

function StepLayout({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-6 text-primary" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-xl">{title}</h2>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Name
// ---------------------------------------------------------------------------

function NameStep({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  return (
    <StepLayout
      icon={SparklesIcon}
      title="Let's give me a name"
      subtitle="What should I call myself? You can always change this later."
    >
      <div className="mx-auto w-full max-w-xs">
        <Input
          value={name}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Atlas, Nova, Jarvis..."
          className="text-center text-lg"
          autoFocus
        />
      </div>
    </StepLayout>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Model
// ---------------------------------------------------------------------------

function ModelStep({
  provider,
  model,
  onProviderChange,
  onModelChange,
}: {
  provider: string
  model: string
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
}) {
  const { data: modelsData } = useModels()
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  const allProviders = modelsData?.providers ?? []
  const providers = [...allProviders].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const selectedProvider = allProviders.find((p) => p.id === provider)
  const models = selectedProvider?.models ?? []

  return (
    <StepLayout
      icon={BotIcon}
      title="Pick my brain"
      subtitle="Choose which AI model powers me. This affects how I think and respond."
    >
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Provider</Label>
          <Popover open={providerOpen} onOpenChange={setProviderOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-between font-normal">
                <span className="flex items-center gap-2 truncate">
                  {selectedProvider && <ProviderLogo providerId={provider} />}
                  {selectedProvider ? selectedProvider.name : provider || 'Select provider...'}
                </span>
                <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
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
                        if (provider !== p.id) onModelChange('')
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

        <div className="flex flex-col gap-2">
          <Label>Model</Label>
          <Popover open={modelOpen} onOpenChange={setModelOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="justify-between font-normal"
                disabled={!provider}
              >
                {model || 'Select model...'}
                <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
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
                        onModelChange(m)
                        setModelOpen(false)
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

        {selectedProvider && !selectedProvider.configured && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              {selectedProvider.name} is not configured yet
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              You'll need to add the API key to your environment variables.
              {selectedProvider.docUrl && ' Check the provider docs for details.'}
            </p>
          </div>
        )}
      </div>
    </StepLayout>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Memory
// ---------------------------------------------------------------------------

function MemoryStep({
  enabled,
  onChange,
  embeddingProvider,
  embeddingModel,
  onEmbeddingProviderChange,
  onEmbeddingModelChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
  embeddingProvider: string
  embeddingModel: string
  onEmbeddingProviderChange: (provider: string) => void
  onEmbeddingModelChange: (model: string) => void
}) {
  const { data: modelsData } = useModels()
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  const allProviders = modelsData?.providers ?? []
  const providers = [...allProviders].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const selectedProvider = allProviders.find((p) => p.id === embeddingProvider)
  const models = selectedProvider?.models ?? []

  return (
    <StepLayout
      icon={BrainIcon}
      title="Should I remember things?"
      subtitle="When enabled, I can recall context from our past conversations to give better answers."
    >
      <div className="mx-auto w-full max-w-sm">
        <div
          className={cn(
            'flex w-full items-center justify-between rounded-xl border-2 p-4 transition-colors',
            enabled ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="onboarding-memory" className="font-medium text-sm">
              Semantic recall
            </Label>
            <p className="text-muted-foreground text-xs">
              Uses embeddings to find relevant context from previous messages
            </p>
          </div>
          <Switch id="onboarding-memory" checked={enabled} onCheckedChange={onChange} />
        </div>
        {enabled && (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              Choose an embedding model for semantic search over past conversations.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Provider</Label>
                <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="justify-between font-normal">
                      <span className="flex items-center gap-2 truncate">
                        {selectedProvider && <ProviderLogo providerId={embeddingProvider} />}
                        {selectedProvider
                          ? selectedProvider.name
                          : embeddingProvider || 'Select...'}
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
                              onEmbeddingProviderChange(p.id)
                              if (embeddingProvider !== p.id) onEmbeddingModelChange('')
                              setProviderOpen(false)
                            }}
                          >
                            <CheckIcon
                              className={cn(
                                'mr-2 size-4',
                                embeddingProvider === p.id ? 'opacity-100' : 'opacity-0',
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
              <div className="flex flex-col gap-2">
                <Label>Model</Label>
                <Popover open={modelOpen} onOpenChange={setModelOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-between font-normal"
                      disabled={!embeddingProvider}
                    >
                      <span className="truncate">{embeddingModel || 'Select...'}</span>
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
                              onEmbeddingModelChange(m)
                              setModelOpen(false)
                            }}
                          >
                            <CheckIcon
                              className={cn(
                                'mr-2 size-4',
                                embeddingModel === m ? 'opacity-100' : 'opacity-0',
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
            </div>
          </div>
        )}
      </div>
    </StepLayout>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Schedule
// ---------------------------------------------------------------------------

function ScheduleStep({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <StepLayout
      icon={CalendarIcon}
      title="Want me to run tasks on a schedule?"
      subtitle="I can automatically run tasks at specific times — like daily summaries, reminders, or recurring research."
    >
      <div className="mx-auto w-full max-w-sm">
        <div
          className={cn(
            'flex w-full items-center justify-between rounded-xl border-2 p-4 transition-colors',
            enabled ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="onboarding-schedule" className="font-medium text-sm">
              Task scheduling
            </Label>
            <p className="text-muted-foreground text-xs">
              Create recurring or one-time tasks with cron expressions or specific dates
            </p>
          </div>
          <Switch id="onboarding-schedule" checked={enabled} onCheckedChange={onChange} />
        </div>
        <p className="mt-3 text-center text-muted-foreground text-xs">
          You can create and manage scheduled tasks in the Schedules page.
        </p>
      </div>
    </StepLayout>
  )
}

// ---------------------------------------------------------------------------
// Step 5: Plugins
// ---------------------------------------------------------------------------

function PluginsStep() {
  const { plugins } = usePlugins()

  const { suggested, others } = useMemo(() => {
    if (!plugins) return { suggested: [], others: [] }
    const s: UnifiedPluginInfo[] = []
    const o: UnifiedPluginInfo[] = []
    for (const p of plugins) {
      if (SUGGESTED_PLUGIN_IDS.includes(p.id)) s.push(p)
      else o.push(p)
    }
    s.sort((a, b) => SUGGESTED_PLUGIN_IDS.indexOf(a.id) - SUGGESTED_PLUGIN_IDS.indexOf(b.id))
    return { suggested: s, others: o }
  }, [plugins])

  return (
    <StepLayout
      icon={PlugIcon}
      title="Let's add some superpowers"
      subtitle="Plugins give me extra abilities. Click any to configure and enable."
    >
      <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
        {suggested.map((plugin) => (
          <UnifiedPluginCard key={plugin.id} plugin={plugin} />
        ))}

        {others.length > 0 && (
          <p className="mt-2 text-center text-muted-foreground text-xs">
            More plugins available — you can enable these anytime from the Plugins page.
          </p>
        )}
      </div>
    </StepLayout>
  )
}

// ---------------------------------------------------------------------------
// Complete step
// ---------------------------------------------------------------------------

function CompleteStep({
  name,
  model,
  memoryEnabled,
  scheduleEnabled,
}: {
  name: string
  model: string
  memoryEnabled: boolean
  scheduleEnabled: boolean
}) {
  const { plugins } = usePlugins()
  const enabledCount = plugins?.filter((p) => p.enabled).length ?? 0

  return (
    <StepLayout
      icon={PartyPopperIcon}
      title="You're all set!"
      subtitle={`${name} is ready to go. Here's a summary of your setup.`}
    >
      <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
        <SummaryRow label="Name" value={name} />
        <SummaryRow label="Model" value={model} />
        <SummaryRow label="Memory" value={memoryEnabled ? 'Enabled' : 'Disabled'} />
        <SummaryRow label="Scheduling" value={scheduleEnabled ? 'Enabled' : 'Disabled'} />
        <SummaryRow
          label="Plugins"
          value={enabledCount > 0 ? `${enabledCount} enabled` : 'None enabled'}
        />
      </div>
      <p className="text-center text-muted-foreground text-xs">
        You can change any of these settings later from the sidebar.
      </p>
    </StepLayout>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-medium text-sm">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step config patches — maps step index to the config patch to save
// ---------------------------------------------------------------------------

interface WizardState {
  name: string
  provider: string
  model: string
  memoryEnabled: boolean
  embeddingProvider: string
  embeddingModel: string
  scheduleEnabled: boolean
}

function buildStepPatch(step: number, state: WizardState): DeepPartial<Config> | null {
  switch (step) {
    case 0:
      return { identity: { name: state.name.trim() || 'Pandora' } }
    case 1:
      return { models: { operator: { provider: state.provider, model: state.model } } }
    case 2: {
      const embedder =
        state.embeddingProvider && state.embeddingModel
          ? `${state.embeddingProvider}/${state.embeddingModel}`
          : undefined
      return { memory: { semanticRecall: { enabled: state.memoryEnabled, embedder } } }
    }
    case 3:
      return { schedule: { enabled: state.scheduleEnabled } }
    case 5:
      return { onboardingComplete: true }
    default:
      return null
  }
}

function canContinueFromStep(step: number, state: WizardState): boolean {
  switch (step) {
    case 0:
      return !!state.name.trim()
    case 1:
      return !!state.provider && !!state.model
    case 2:
      return !state.memoryEnabled || (!!state.embeddingProvider && !!state.embeddingModel)
    default:
      return true
  }
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export function OnboardingWizard() {
  const { data: config } = useConfig()
  const updateConfig = useUpdateConfig()
  const { mutate } = updateConfig

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [memoryEnabled, setMemoryEnabled] = useState(false)
  const [embeddingProvider, setEmbeddingProvider] = useState('openai')
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small')
  const [scheduleEnabled, setScheduleEnabled] = useState(true)

  useEffect(() => {
    if (!config) return
    setName(config.identity.name)
    setProvider(config.models.operator.provider)
    setModel(config.models.operator.model)
    setMemoryEnabled(config.memory.semanticRecall.enabled)
    const embedder = config.memory.semanticRecall.embedder ?? 'openai/text-embedding-3-small'
    const slashIdx = embedder.indexOf('/')
    if (slashIdx !== -1) {
      setEmbeddingProvider(embedder.slice(0, slashIdx))
      setEmbeddingModel(embedder.slice(slashIdx + 1))
    }
    setScheduleEnabled(config.schedule.enabled)

    // Auto-detect browser timezone and prefill if not already set
    if (!config.timezone || config.timezone === 'UTC') {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected && detected !== 'UTC') {
        mutate({ timezone: detected })
      }
    }
  }, [config, mutate])

  const isSaving = updateConfig.isPending
  const isComplete = step === TOTAL_STEPS

  const state: WizardState = {
    name,
    provider,
    model,
    memoryEnabled,
    embeddingProvider,
    embeddingModel,
    scheduleEnabled,
  }

  function saveAndAdvance() {
    const patch = buildStepPatch(step, state)
    if (patch) {
      updateConfig.mutate(patch, { onSuccess: () => setStep(step + 1) })
    } else {
      setStep(step + 1)
    }
  }

  function skip() {
    if (step < TOTAL_STEPS) setStep(step + 1)
    else updateConfig.mutate({ onboardingComplete: true })
  }

  const canContinue = canContinueFromStep(step, state)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="flex justify-center">
          <StepIndicator current={Math.min(step, TOTAL_STEPS - 1)} total={TOTAL_STEPS} />
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {step === 0 && <NameStep name={name} onChange={setName} />}
          {step === 1 && (
            <ModelStep
              provider={provider}
              model={model}
              onProviderChange={setProvider}
              onModelChange={setModel}
            />
          )}
          {step === 2 && (
            <MemoryStep
              enabled={memoryEnabled}
              onChange={setMemoryEnabled}
              embeddingProvider={embeddingProvider}
              embeddingModel={embeddingModel}
              onEmbeddingProviderChange={setEmbeddingProvider}
              onEmbeddingModelChange={setEmbeddingModel}
            />
          )}
          {step === 3 && <ScheduleStep enabled={scheduleEnabled} onChange={setScheduleEnabled} />}
          {step === 4 && <PluginsStep />}
          {step === 5 && (
            <CompleteStep
              name={name.trim() || 'Pandora'}
              model={model || 'Default'}
              memoryEnabled={memoryEnabled}
              scheduleEnabled={scheduleEnabled}
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            {step > 0 && !isComplete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep(step - 1)}
                disabled={isSaving}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isComplete && (
              <Button variant="ghost" size="sm" onClick={skip} disabled={isSaving}>
                Skip
              </Button>
            )}
            <Button onClick={saveAndAdvance} disabled={isSaving || !(isComplete || canContinue)}>
              {isSaving && <Loader2Icon className="size-4 animate-spin" />}
              {isComplete ? 'Start chatting' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
