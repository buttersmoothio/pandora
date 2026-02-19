'use client'

import { CheckIcon, ChevronsUpDownIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  const [description, setDescription] = useState('')
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (config) {
      setName(config.identity.name)
      setDescription(config.identity.description)
      setVersion(config.identity.version)
    }
  }, [config])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>Configure your agent&apos;s identity.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="identity-name">Name</Label>
          <Input id="identity-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="identity-description">Description</Label>
          <Input
            id="identity-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="identity-version">Version</Label>
          <Input
            id="identity-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </div>
        <Button
          className="self-end"
          disabled={updateConfig.isPending}
          onClick={() => updateConfig.mutate({ identity: { name, description, version } })}
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
  const [traits, setTraits] = useState<string[]>([])
  const [systemPrompt, setSystemPrompt] = useState('')
  const [traitInput, setTraitInput] = useState('')

  useEffect(() => {
    if (config) {
      setTraits(config.personality.traits)
      setSystemPrompt(config.personality.systemPrompt ?? '')
    }
  }, [config])

  function addTrait() {
    const value = traitInput.trim()
    if (value && !traits.includes(value)) {
      setTraits([...traits, value])
      setTraitInput('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personality</CardTitle>
        <CardDescription>Define traits and system prompt.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Traits</Label>
          <div className="flex flex-wrap gap-1">
            {traits.map((trait) => (
              <Badge
                key={trait}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setTraits(traits.filter((t) => t !== trait))}
              >
                {trait} &times;
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add a trait..."
              value={traitInput}
              onChange={(e) => setTraitInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTrait()
                }
              }}
            />
            <Button variant="outline" onClick={addTrait}>
              Add
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="system-prompt">System Prompt</Label>
          <Textarea
            id="system-prompt"
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Optional system prompt override..."
          />
        </div>
        <Button
          className="self-end"
          disabled={updateConfig.isPending}
          onClick={() =>
            updateConfig.mutate({
              personality: { traits, systemPrompt: systemPrompt || undefined },
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

  const providers = modelsData?.providers ?? []
  const selectedProvider = providers.find((p) => p.id === provider)
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
                <Button
                  variant="outline"
                  className="justify-between font-normal"
                >
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
                          className={cn('mr-2 size-4', provider === p.id ? 'opacity-100' : 'opacity-0')}
                        />
                        {p.name}
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
        <Button
          className="self-end"
          disabled={updateConfig.isPending}
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
        <h1 className="text-2xl font-semibold">Configuration</h1>
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
