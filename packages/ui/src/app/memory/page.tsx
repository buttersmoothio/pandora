'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Streamdown } from 'streamdown'
import { ProviderLogo } from '@/components/provider-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfig, useUpdateConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import { useToolNames } from '@/hooks/use-plugins'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

interface OMRecord {
  id: string
  scope: 'resource' | 'thread'
  generationCount: number
  updatedAt: string
  lastObservedAt?: string
  observationTokenCount: number
  pendingMessageTokens: number
  totalTokensObserved: number
  isObserving: boolean
  isReflecting: boolean
}

interface OMThresholds {
  scope: 'resource' | 'thread'
  messageTokens: number
  observationTokens: number
}

interface RecordResponse {
  record: OMRecord | null
  thresholds: OMThresholds | null
}

const POLL_INTERVAL = 10_000

function useObservations() {
  return useQuery({
    queryKey: ['observations'],
    queryFn: () => apiFetch<{ observations: string | null }>('/api/memory/observations'),
    refetchInterval: POLL_INTERVAL,
  })
}

function useOMRecord() {
  return useQuery({
    queryKey: ['om-record'],
    queryFn: () => apiFetch<RecordResponse>('/api/memory/record'),
    refetchInterval: POLL_INTERVAL,
  })
}

function formatTokens(tokens: number) {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return String(tokens)
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface ObservationSection {
  title: string | null
  content: string
}

/** Clean raw OM text and split into date-based sections for card rendering. */
function parseObservationSections(
  raw: string,
  toolNames: Map<string, string>,
): ObservationSection[] {
  const cleaned = raw
    .replace(/<thread[^>]*>|<\/thread>/gu, '') // strip resource-scope wrapper tags
    .replace(/`([^`]+)`/g, (_match, id: string) => {
      const name = toolNames.get(id)
      return name ? `*${name}*` : `*${id}*`
    })
    .trim()

  // Split by "Date: ..." headers
  const parts = cleaned.split(/(?=^Date:\s)/m)
  const sections: ObservationSection[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const dateMatch = trimmed.match(/^Date:\s*(.+)/m)
    if (dateMatch) {
      sections.push({
        title: dateMatch[1].trim(),
        content: trimmed.replace(/^Date:\s*.+\n?/, '').trim(),
      })
    } else {
      sections.push({ title: null, content: trimmed })
    }
  }

  return sections
}

function MemoryProgress({
  label,
  tokens,
  threshold,
  tooltip,
}: {
  label: string
  tokens: number
  threshold: number
  tooltip: string
}) {
  const percent = threshold > 0 ? Math.min((tokens / threshold) * 100, 100) : 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-muted-foreground">{Math.round(percent)}%</span>
            </div>
            <Progress
              value={percent}
              className={cn(
                'h-1.5',
                percent >= 90 &&
                  'bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive',
                percent >= 70 &&
                  percent < 90 &&
                  'bg-yellow-500/20 [&>[data-slot=progress-indicator]]:bg-yellow-500',
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function MonitoringSection() {
  const { data: config } = useConfig()
  const { data: recordData } = useOMRecord()

  if (!config?.memory.enabled) return null

  const record = recordData?.record ?? null
  const thresholds = recordData?.thresholds ?? null

  if (!(record && thresholds)) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Status</CardTitle>
          <CardDescription>Current memory activity and usage.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {record.isObserving && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              Processing
            </Badge>
          )}
          {record.isReflecting && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              Condensing
            </Badge>
          )}
          {!(record.isObserving || record.isReflecting) && <Badge variant="outline">Idle</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <MemoryProgress
          label="Observation capacity"
          tokens={record.observationTokenCount}
          threshold={thresholds.observationTokens}
          tooltip="Active observation size. Condensed automatically when full."
        />

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm">{formatTokens(record.totalTokensObserved)}</span>
            <span className="text-muted-foreground text-xs">Processed</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm">{record.generationCount}</span>
            <span className="text-muted-foreground text-xs">
              {record.generationCount === 1 ? 'Condensation' : 'Condensations'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm">
              {record.lastObservedAt ? timeAgo(record.lastObservedAt) : '—'}
            </span>
            <span className="text-muted-foreground text-xs">Last active</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MemorySection() {
  const { data: config } = useConfig()
  const { data: modelsData } = useModels()
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(true)
  const [override, setOverride] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => {
    if (config) {
      setEnabled(config.memory.enabled)
      const m = config.memory.model ?? ''
      const slashIdx = m.indexOf('/')
      if (slashIdx !== -1) {
        setOverride(true)
        setProvider(m.slice(0, slashIdx))
        setModel(m.slice(slashIdx + 1))
      } else {
        setOverride(false)
        setProvider('')
        setModel('')
      }
    }
  }, [config])

  const allProviders = modelsData?.providers ?? []
  const providers = [...allProviders].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const selectedProvider = allProviders.find((p) => p.id === provider)
  const models = selectedProvider?.models ?? []
  const memoryModel = provider && model ? `${provider}/${model}` : undefined

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Memory</CardTitle>
          <CardDescription>
            Automatically remembers important details across all your conversations.
          </CardDescription>
        </div>
        <Switch
          id="memory-enabled"
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked)
            updateConfig.mutate({ memory: { enabled: checked } })
          }}
        />
      </CardHeader>
      {enabled && (
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Label htmlFor="model-override">Use a different model</Label>
              <p className="text-muted-foreground text-xs">
                By default, memory uses your chat model. A fast model with a large context window
                works best.
              </p>
            </div>
            <Switch
              id="model-override"
              checked={override}
              onCheckedChange={(checked) => {
                setOverride(checked)
                if (!checked) {
                  setProvider('')
                  setModel('')
                  updateConfig.mutate({ memory: { enabled, model: undefined } })
                }
              }}
            />
          </div>
          {override && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Provider</Label>
                  <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between font-normal">
                        <span className="flex items-center gap-2 truncate">
                          {selectedProvider && <ProviderLogo providerId={provider} />}
                          {selectedProvider
                            ? selectedProvider.name
                            : provider || 'Select provider...'}
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
              </div>
              <Button
                className="self-end"
                disabled={updateConfig.isPending || !provider || !model}
                onClick={() => updateConfig.mutate({ memory: { enabled, model: memoryModel } })}
              >
                {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function ObservationsSection() {
  const { data: config } = useConfig()
  const { data: obsData, isLoading } = useObservations()
  const { data: recordData } = useOMRecord()
  const toolNames = useToolNames()

  if (!config?.memory.enabled) return null

  const raw = obsData?.observations ?? null
  const record = recordData?.record ?? null
  const sections = useMemo(
    () => (raw ? parseObservationSections(raw, toolNames) : []),
    [raw, toolNames],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-lg tracking-tight">Observations</h2>
          <p className="text-muted-foreground text-sm">
            What your agent currently remembers. Managed automatically as you chat.
          </p>
        </div>
        {record && record.generationCount > 0 && (
          <span className="text-muted-foreground text-xs">
            Condensed {record.generationCount} {record.generationCount === 1 ? 'time' : 'times'}
          </span>
        )}
      </div>
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading...
          </CardContent>
        </Card>
      ) : sections.length > 0 ? (
        sections.map((section) => (
          <Card key={section.title ?? 'summary'}>
            {section.title && (
              <CardHeader className="pb-2">
                <CardDescription>{section.title}</CardDescription>
              </CardHeader>
            )}
            <CardContent className={cn('max-h-64 overflow-y-auto', section.title ? '' : 'pt-6')}>
              <Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {section.content}
              </Streamdown>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              No observations yet. Start chatting and memories will appear here automatically.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function MemoryPage() {
  const { isLoading, error } = useConfig()

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
        <p className="text-destructive">Failed to load configuration: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Memory</h1>
      <MemorySection />
      <MonitoringSection />
      <ObservationsSection />
    </div>
  )
}
