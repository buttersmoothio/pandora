'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, ChevronsUpDownIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { Textarea } from '@/components/ui/textarea'
import { useConfig, useUpdateConfig } from '@/hooks/use-config'
import { useModels } from '@/hooks/use-models'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

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

function WorkingMemorySection() {
  const { data: config } = useConfig()
  const updateConfig = useUpdateConfig()
  const { data, isLoading } = useWorkingMemory()
  const updateMemory = useUpdateWorkingMemory()
  const [enabled, setEnabled] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (config) {
      setEnabled(config.memory.workingMemory.enabled)
    }
  }, [config])

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
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Working Memory</CardTitle>
          <CardDescription>
            A persistent scratchpad that lets your agent remember important facts and context across
            conversations.
          </CardDescription>
        </div>
        <Switch
          id="working-memory"
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked)
            updateConfig.mutate({
              memory: { workingMemory: { enabled: checked } },
            })
          }}
        />
      </CardHeader>
      {enabled && (
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
              No memories yet. Start chatting and your agent will begin remembering.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function SemanticRecallSection() {
  const { data: config } = useConfig()
  const { data: modelsData } = useModels()
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(false)
  const [embeddingProvider, setEmbeddingProvider] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => {
    if (config) {
      setEnabled(config.memory.semanticRecall.enabled)
      const embedder = config.memory.semanticRecall.embedder ?? ''
      const slashIndex = embedder.indexOf('/')
      if (slashIndex !== -1) {
        setEmbeddingProvider(embedder.slice(0, slashIndex))
        setEmbeddingModel(embedder.slice(slashIndex + 1))
      }
    }
  }, [config])

  const allProviders = modelsData?.providers ?? []
  const providers = [...allProviders].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  const selectedProvider = allProviders.find((p) => p.id === embeddingProvider)
  const models = selectedProvider?.models ?? []
  const embedder =
    embeddingProvider && embeddingModel ? `${embeddingProvider}/${embeddingModel}` : ''

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Semantic Recall</CardTitle>
          <CardDescription>
            Uses embeddings to find and recall relevant context from past conversations.
          </CardDescription>
        </div>
        <Switch
          id="semantic-recall"
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked)
            if (!checked) {
              updateConfig.mutate({
                memory: { semanticRecall: { enabled: false, embedder } },
              })
            }
          }}
        />
      </CardHeader>
      {enabled && (
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Provider</Label>
              <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-between font-normal">
                    <span className="flex items-center gap-2 truncate">
                      {selectedProvider && <ProviderLogo providerId={embeddingProvider} />}
                      {selectedProvider
                        ? selectedProvider.name
                        : embeddingProvider || 'Select provider...'}
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
                            setEmbeddingProvider(p.id)
                            if (embeddingProvider !== p.id) setEmbeddingModel('')
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
                    className="justify-between font-normal"
                    disabled={!embeddingProvider}
                  >
                    {embeddingModel || 'Select model...'}
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
                            setEmbeddingModel(m)
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
            disabled={updateConfig.isPending || !embeddingProvider || !embeddingModel}
            onClick={() =>
              updateConfig.mutate({
                memory: { semanticRecall: { enabled, embedder } },
              })
            }
          >
            {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
          </Button>
        </CardContent>
      )}
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
      <WorkingMemorySection />
      <SemanticRecallSection />
    </div>
  )
}
