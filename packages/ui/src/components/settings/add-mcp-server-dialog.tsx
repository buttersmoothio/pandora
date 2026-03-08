'use client'

import { GlobeIcon, Loader2Icon, PlusIcon, TerminalIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUpdateConfig } from '@/hooks/use-config'
import { cn } from '@/lib/utils'

type Transport = 'stdio' | 'sse'
type AuthMode = 'none' | 'headers' | 'oauth'

export function AddMcpServerDialog() {
  const [open, setOpen] = useState(false)
  const [transport, setTransport] = useState<Transport>('stdio')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [requireApproval, setRequireApproval] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>('none')
  const [headers, setHeaders] = useState<Array<{ id: number; key: string; value: string }>>([])
  const [nextHeaderId, setNextHeaderId] = useState(0)
  const updateConfig = useUpdateConfig()

  function reset() {
    setTransport('stdio')
    setId('')
    setName('')
    setCommand('')
    setArgs('')
    setUrl('')
    setRequireApproval(true)
    setAuthMode('none')
    setHeaders([])
    setNextHeaderId(0)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const serverId = id.trim()
    if (!serverId) return

    const config: Record<string, unknown> = {
      enabled: true,
      requireApproval,
    }

    if (name.trim()) config.name = name.trim()

    if (transport === 'stdio') {
      config.command = command.trim()
      const parsed = args
        .trim()
        .split(/\s+/)
        .filter((a) => a.length > 0)
      if (parsed.length > 0) config.args = parsed
    } else {
      config.url = url.trim()

      if (authMode === 'headers') {
        const h: Record<string, string> = {}
        for (const { key, value } of headers) {
          const k = key.trim()
          if (k) h[k] = value
        }
        if (Object.keys(h).length > 0) config.headers = h
      } else if (authMode === 'oauth') {
        config.oauth = true
      }
    }

    updateConfig.mutate(
      { mcpServers: { [serverId]: config } },
      {
        onSuccess: () => {
          reset()
          setOpen(false)
        },
      },
    )
  }

  const isValid =
    id.trim().length > 0 &&
    (transport === 'stdio' ? command.trim().length > 0 : url.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Transport toggle */}
          <div className="flex flex-col gap-2">
            <Label>Transport</Label>
            <div className="flex gap-2">
              {(
                [
                  { key: 'stdio', label: 'Local (stdio)', icon: TerminalIcon },
                  { key: 'sse', label: 'Remote (HTTP)', icon: GlobeIcon },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTransport(key)
                    if (key === 'stdio') setAuthMode('none')
                  }}
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

          {/* Server ID */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="mcp-id">Server ID</Label>
            <Input
              id="mcp-id"
              placeholder="e.g. github"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
            />
            <p className="text-muted-foreground text-xs">
              Unique identifier for this server in your config.
            </p>
          </div>

          {/* Display name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="mcp-name">Display Name</Label>
            <Input
              id="mcp-name"
              placeholder="e.g. GitHub"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Stdio fields */}
          {transport === 'stdio' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mcp-command">Command</Label>
                <Input
                  id="mcp-command"
                  placeholder="e.g. bunx"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mcp-args">Arguments</Label>
                <Input
                  id="mcp-args"
                  placeholder="e.g. @modelcontextprotocol/server-github"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">Space-separated arguments.</p>
              </div>
            </>
          )}

          {/* SSE fields */}
          {transport === 'sse' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mcp-url">Server URL</Label>
                <Input
                  id="mcp-url"
                  type="url"
                  placeholder="https://example.com/mcp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              {/* Auth mode selector */}
              <div className="flex flex-col gap-2">
                <Label>Authentication</Label>
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
                      onClick={() => setAuthMode(key)}
                      className={cn(
                        'inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors',
                        authMode === key
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

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
                      onClick={() => {
                        setHeaders([...headers, { id: nextHeaderId, key: '', value: '' }])
                        setNextHeaderId(nextHeaderId + 1)
                      }}
                    >
                      <PlusIcon className="size-3" />
                      Add
                    </Button>
                  </div>
                  {headers.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      Add headers like Authorization for authenticated servers.
                    </p>
                  )}
                  {headers.map((header) => (
                    <div key={header.id} className="flex gap-2">
                      <Input
                        placeholder="Header name"
                        value={header.key}
                        onChange={(e) =>
                          setHeaders(
                            headers.map((h) =>
                              h.id === header.id ? { ...h, key: e.target.value } : h,
                            ),
                          )
                        }
                        className="flex-1"
                      />
                      <Input
                        placeholder="Value"
                        value={header.value}
                        onChange={(e) =>
                          setHeaders(
                            headers.map((h) =>
                              h.id === header.id ? { ...h, value: e.target.value } : h,
                            ),
                          )
                        }
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                        onClick={() => setHeaders(headers.filter((h) => h.id !== header.id))}
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
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="mcp-approval">Require Approval</Label>
              <p className="text-muted-foreground text-xs">
                Ask for confirmation before running tools from this server.
              </p>
            </div>
            <Switch
              id="mcp-approval"
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!isValid || updateConfig.isPending}>
              {updateConfig.isPending && <Loader2Icon className="mr-1.5 size-4 animate-spin" />}
              Add Server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
