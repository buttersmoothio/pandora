'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Streamdown } from 'streamdown'
import { ProviderLogo } from '@/components/provider-logo'
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
import { Switch } from '@/components/ui/switch'
import { useConfig, useUpdateConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

function useObservations() {
  return useQuery({
    queryKey: ['observations'],
    queryFn: () => apiFetch<{ observations: string | null }>('/api/memory/observations'),
    refetchInterval: 30_000,
  })
}

function useOMRecord() {
  return useQuery({
    queryKey: ['om-record'],
    queryFn: () =>
      apiFetch<{
        record: {
          generationCount: number
          updatedAt: string
        } | null
      }>('/api/memory/record'),
    refetchInterval: 30_000,
  })
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

  if (!config?.memory.enabled) return null

  const observations = obsData?.observations ?? null
  const record = recordData?.record ?? null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Observations</CardTitle>
          <CardDescription>
            What your agent currently remembers. Managed automatically as you chat.
          </CardDescription>
        </div>
        {record && (
          <span className="text-muted-foreground text-xs">Generation {record.generationCount}</span>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : observations ? (
          <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/50 p-4">
            <Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              {observations}
            </Streamdown>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No observations yet. Start chatting and memories will appear here automatically.
          </p>
        )}
      </CardContent>
    </Card>
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
      <ObservationsSection />
    </div>
  )
}
