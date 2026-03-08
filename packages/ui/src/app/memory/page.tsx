'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
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
import { Textarea } from '@/components/ui/textarea'
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

const WORKING_MEMORY_KEY = ['working-memory'] as const

function useWorkingMemory() {
  return useQuery({
    queryKey: WORKING_MEMORY_KEY,
    queryFn: () => apiFetch<{ content: string | null }>('/api/memory/working'),
  })
}

function useUpdateWorkingMemory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<{ content: string }>('/api/memory/working', {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(WORKING_MEMORY_KEY, data)
    },
    onError: (err: Error) => {
      toast.error(`Failed to save: ${err.message}`)
    },
  })
}

/** Extract the data portion from the raw working memory string. */
function parseWorkingMemoryData(raw: string): string {
  const match = raw.match(/<working_memory_data>([\s\S]*?)<\/working_memory_data>/)
  return match ? match[1].trim() : raw.trim()
}

/** Reconstruct the full working memory string, replacing only the data portion. */
function replaceWorkingMemoryData(raw: string, newData: string): string {
  const hasWrapper = /<working_memory_data>[\s\S]*?<\/working_memory_data>/.test(raw)
  if (hasWrapper) {
    return raw.replace(
      /<working_memory_data>[\s\S]*?<\/working_memory_data>/,
      `<working_memory_data>\n${newData}\n</working_memory_data>`,
    )
  }
  return newData
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
                  updateConfig.mutate({ memory: { enabled, model: null } })
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

function ShortTermSection() {
  const { data, isLoading } = useWorkingMemory()
  const updateMemory = useUpdateWorkingMemory()
  const [editContent, setEditContent] = useState('')
  const [editing, setEditing] = useState(false)

  const rawContent = data?.content ?? null
  const displayContent = rawContent ? parseWorkingMemoryData(rawContent) : null

  function startEditing() {
    if (displayContent) setEditContent(displayContent)
    setEditing(true)
  }

  function cancelEditing() {
    setEditContent(displayContent ?? '')
    setEditing(false)
  }

  function saveEdit() {
    if (!rawContent) return
    const updated = replaceWorkingMemoryData(rawContent, editContent.trim())
    updateMemory.mutate(updated, { onSuccess: () => setEditing(false) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Short-term Memory</CardTitle>
        <CardDescription>
          Key facts and context, available immediately in every conversation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : displayContent ? (
          <div className="flex flex-col gap-4">
            {editing ? (
              <>
                <Textarea
                  rows={10}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={cancelEditing}>
                    Cancel
                  </Button>
                  <Button disabled={updateMemory.isPending} onClick={saveEdit}>
                    {updateMemory.isPending ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      'Save'
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="max-h-80 overflow-y-auto rounded-md border bg-muted/50 p-4">
                  <Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    {displayContent}
                  </Streamdown>
                </div>
                <Button variant="outline" className="self-end" onClick={startEditing}>
                  Edit
                </Button>
              </>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nothing here yet. Key facts will appear as your agent learns more about you.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function LongTermSection() {
  const { data: obsData, isLoading } = useObservations()
  const { data: recordData } = useOMRecord()
  const toolNames = useToolNames()

  const raw = obsData?.observations ?? null
  const record = recordData?.record ?? null
  const thresholds = recordData?.thresholds ?? null
  const sections = useMemo(
    () => (raw ? parseObservationSections(raw, toolNames) : []),
    [raw, toolNames],
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Long-term Memory</CardTitle>
          <CardDescription>
            Observations built up over time from your conversations.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {record?.isObserving && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              Processing
            </Badge>
          )}
          {record?.isReflecting && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              Condensing
            </Badge>
          )}
          {record && !(record.isObserving || record.isReflecting) && (
            <Badge variant="outline">Idle</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {record && thresholds && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/50 p-4">
            <MemoryProgress
              label="Observation capacity"
              tokens={record.observationTokenCount}
              threshold={thresholds.observationTokens}
              tooltip="Active observation size. Condensed automatically when full."
            />
            <div className="flex items-center gap-4 text-muted-foreground text-xs">
              <span>{formatTokens(record.totalTokensObserved)} processed</span>
              <span>
                {record.generationCount}{' '}
                {record.generationCount === 1 ? 'condensation' : 'condensations'}
              </span>
              {record.lastObservedAt && <span>Last active {timeAgo(record.lastObservedAt)}</span>}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : sections.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sections.map((section) => (
              <div
                key={section.title ?? 'summary'}
                className="max-h-64 overflow-y-auto rounded-md border bg-muted/50 p-4"
              >
                {section.title && (
                  <p className="mb-2 text-muted-foreground text-xs">{section.title}</p>
                )}
                <Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {section.content}
                </Streamdown>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nothing here yet. Observations are created once enough conversation has accumulated.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function MemoryPage() {
  const { data: config, isLoading, error } = useConfig()

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
      {config?.memory.enabled && (
        <>
          <ShortTermSection />
          <LongTermSection />
        </>
      )}
    </div>
  )
}
