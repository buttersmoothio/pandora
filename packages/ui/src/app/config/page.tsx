'use client'

import { CheckIcon, ChevronsUpDownIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { useConfig, useResetConfig, useUpdateConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import { cn } from '@/lib/utils'

function IdentitySection() {
  const { data: config } = useConfig()
  const updateConfig = useUpdateConfig()
  const [name, setName] = useState('')

  useEffect(() => {
    if (config) {
      setName(config.identity.name)
    }
  }, [config])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>Configure your agent&apos;s name.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="identity-name">Name</Label>
          <Input id="identity-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          className="self-end"
          disabled={updateConfig.isPending || !name.trim()}
          onClick={() => updateConfig.mutate({ identity: { name } })}
        >
          {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}

function PersonalitySection() {
  const { data: config } = useConfig()
  const updateConfig = useUpdateConfig()
  const [systemPrompt, setSystemPrompt] = useState('')

  useEffect(() => {
    if (config) {
      setSystemPrompt(config.personality.systemPrompt)
    }
  }, [config])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personality</CardTitle>
        <CardDescription>Define how your agent behaves and communicates.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="system-prompt">System Prompt</Label>
          <Textarea
            id="system-prompt"
            rows={12}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>
        <Button
          className="self-end"
          disabled={updateConfig.isPending || !systemPrompt.trim()}
          onClick={() =>
            updateConfig.mutate({
              personality: { systemPrompt },
            })
          }
        >
          {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}

function ModelsSection() {
  const { data: config } = useConfig()
  const { data: modelsData } = useModels()
  const updateConfig = useUpdateConfig()
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState<string>('')
  const [maxTokens, setMaxTokens] = useState<string>('')
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => {
    if (config) {
      setProvider(config.models.operator.provider)
      setModel(config.models.operator.model)
      setTemperature(config.models.operator.temperature?.toString() ?? '')
      setMaxTokens(config.models.operator.maxTokens?.toString() ?? '')
    }
  }, [config])

  const allProviders = modelsData?.providers ?? []
  // Show configured providers first
  const providers = [...allProviders].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const selectedProvider = allProviders.find((p) => p.id === provider)
  const models = selectedProvider?.models ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Models</CardTitle>
        <CardDescription>Configure the operator model.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Provider</Label>
            <Popover open={providerOpen} onOpenChange={setProviderOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between font-normal">
                  {selectedProvider ? selectedProvider.name : provider || 'Select provider...'}
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="model-temperature">Temperature</Label>
            <Input
              id="model-temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="0-2"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="model-max-tokens">Max Tokens</Label>
            <Input
              id="model-max-tokens"
              type="number"
              min={1}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        {selectedProvider && !selectedProvider.configured && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              {selectedProvider.name} is not configured
            </p>
            <ol className="mt-2 list-inside list-decimal space-y-1.5 text-muted-foreground">
              <li>
                {selectedProvider.docUrl ? (
                  <>
                    Get an API key from the{' '}
                    <a
                      href={selectedProvider.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:text-yellow-600 dark:hover:text-yellow-400"
                    >
                      {selectedProvider.name} docs
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </>
                ) : (
                  <>Get an API key from {selectedProvider.name}</>
                )}
              </li>
              <li>
                Add the following environment variable
                {selectedProvider.envVars.length > 1 ? 's' : ''} to your environment:
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selectedProvider.envVars.map((v) => (
                    <code key={v} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {v}
                    </code>
                  ))}
                </div>
              </li>
            </ol>
          </div>
        )}
        <Button
          className="self-end"
          disabled={updateConfig.isPending || !provider || !model}
          onClick={() =>
            updateConfig.mutate({
              models: {
                operator: {
                  provider,
                  model,
                  temperature: temperature ? Number(temperature) : undefined,
                  maxTokens: maxTokens ? Number(maxTokens) : undefined,
                },
              },
            })
          }
        >
          {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function ConfigPage() {
  const { data: config, isLoading, error } = useConfig()
  const resetConfig = useResetConfig()

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

  if (!config) return null

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl">Configuration</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={resetConfig.isPending}
          onClick={() => resetConfig.mutate()}
        >
          {resetConfig.isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            'Reset to Defaults'
          )}
        </Button>
      </div>
      <IdentitySection />
      <PersonalitySection />
      <ModelsSection />
    </div>
  )
}
