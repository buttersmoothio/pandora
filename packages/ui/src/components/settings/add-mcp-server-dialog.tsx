'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { GlobeIcon, Loader2Icon, PlusIcon, TerminalIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAddMcpServer } from '@/hooks/use-mcp'
import { cn } from '@/lib/utils'

const formSchema = z.discriminatedUnion('transport', [
  z.object({
    transport: z.literal('stdio'),
    name: z.string().min(1, 'Name is required'),
    command: z.string().min(1, 'Command is required'),
    args: z.string(),
    requireApproval: z.boolean(),
  }),
  z.object({
    transport: z.literal('http'),
    name: z.string().min(1, 'Name is required'),
    url: z.url({ error: 'Must be a valid URL' }),
    authMode: z.enum(['none', 'headers', 'oauth']),
    headers: z.array(z.object({ key: z.string(), value: z.string() })),
    requireApproval: z.boolean(),
  }),
])

type FormValues = z.infer<typeof formSchema>

const STDIO_DEFAULTS: FormValues = {
  transport: 'stdio',
  name: '',
  command: '',
  args: '',
  requireApproval: true,
}

const HTTP_DEFAULTS: FormValues = {
  transport: 'http',
  name: '',
  url: '',
  authMode: 'none',
  headers: [],
  requireApproval: true,
}

function toServerConfig(values: FormValues): Record<string, unknown> {
  const config: Record<string, unknown> = {
    enabled: true,
    requireApproval: values.requireApproval,
    name: values.name,
  }

  if (values.transport === 'stdio') {
    config.command = values.command.trim()
    const parsed = values.args
      .trim()
      .split(/\s+/)
      .filter((a) => a.length > 0)
    if (parsed.length > 0) config.args = parsed
    return config
  }

  config.url = values.url.trim()
  if (values.authMode === 'headers') {
    const h: Record<string, string> = {}
    for (const { key, value } of values.headers) {
      const k = key.trim()
      if (k) h[k] = value
    }
    if (Object.keys(h).length > 0) config.headers = h
  } else if (values.authMode === 'oauth') {
    config.oauth = true
  }
  return config
}

export function AddMcpServerDialog() {
  const [open, setOpen] = useState(false)
  const addServer = useAddMcpServer()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: STDIO_DEFAULTS,
  })

  const transport = form.watch('transport')
  const authMode = transport === 'http' ? form.watch('authMode') : 'none'

  const headerFields = useFieldArray({
    control: form.control,
    // biome-ignore lint/suspicious/noExplicitAny: headers only exists on sse variant
    name: 'headers' as any,
  })

  function switchTransport(t: 'stdio' | 'http') {
    const name = form.getValues('name')
    const requireApproval = form.getValues('requireApproval')
    form.reset(
      t === 'stdio'
        ? { ...STDIO_DEFAULTS, name, requireApproval }
        : { ...HTTP_DEFAULTS, name, requireApproval },
    )
  }

  function onSubmit(values: FormValues) {
    addServer.mutate(toServerConfig(values), {
      onSuccess: () => {
        form.reset(STDIO_DEFAULTS)
        setOpen(false)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) form.reset(STDIO_DEFAULTS)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <PlusIcon className="size-4" />
          Add Server
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Connect a Model Context Protocol server to extend your agent with additional tools.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* Transport toggle */}
            <div className="flex flex-col gap-2">
              <Label>Transport</Label>
              <div className="flex gap-2">
                {(
                  [
                    { key: 'stdio', label: 'Local (stdio)', icon: TerminalIcon },
                    { key: 'http', label: 'Remote (HTTP)', icon: GlobeIcon },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => switchTransport(key)}
                    className={cn(
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
                      transport === key
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. GitHub" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Stdio fields */}
            {transport === 'stdio' && (
              <>
                <FormField
                  control={form.control}
                  name="command"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Command</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. bunx" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="args"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Arguments</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. @modelcontextprotocol/server-github" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Space-separated arguments.
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* HTTP fields */}
            {transport === 'http' && (
              <>
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server URL</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://example.com/mcp" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Auth mode selector */}
                <FormField
                  control={form.control}
                  name="authMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authentication</FormLabel>
                      <div className="flex gap-2">
                        {(
                          [
                            { key: 'none', label: 'None' },
                            { key: 'headers', label: 'Headers' },
                            { key: 'oauth', label: 'OAuth' },
                          ] as const
                        ).map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => field.onChange(key)}
                            className={cn(
                              'inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors',
                              field.value === key
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )}
                />

                {/* Headers input */}
                {authMode === 'headers' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label>Headers</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-xs"
                        onClick={() => headerFields.append({ key: '', value: '' })}
                      >
                        <PlusIcon className="size-3" />
                        Add
                      </Button>
                    </div>
                    {headerFields.fields.length === 0 && (
                      <p className="text-muted-foreground text-xs">
                        Add headers like Authorization for authenticated servers.
                      </p>
                    )}
                    {headerFields.fields.map((field, index) => (
                      <div key={field.id} className="flex gap-2">
                        <Input
                          placeholder="Header name"
                          {...form.register(`headers.${index}.key` as 'headers.0.key')}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Value"
                          {...form.register(`headers.${index}.value` as 'headers.0.value')}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0"
                          onClick={() => headerFields.remove(index)}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* OAuth info */}
                {authMode === 'oauth' && (
                  <p className="text-muted-foreground text-xs">
                    After adding the server, you will be prompted to authorize access.
                  </p>
                )}
              </>
            )}

            {/* Require approval */}
            <FormField
              control={form.control}
              name="requireApproval"
              render={({ field }) => (
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="mcp-approval">Require Approval</Label>
                    <p className="text-muted-foreground text-xs">
                      Ask for confirmation before running tools from this server.
                    </p>
                  </div>
                  <Switch
                    id="mcp-approval"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={addServer.isPending}>
                {addServer.isPending && <Loader2Icon className="mr-1.5 size-4 animate-spin" />}
                Add Server
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
