'use client'

import { GlobeIcon, Loader2Icon, PlusIcon, TerminalIcon } from 'lucide-react'
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

export function AddMcpServerDialog() {
  const [open, setOpen] = useState(false)
  const [transport, setTransport] = useState<Transport>('stdio')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [requireApproval, setRequireApproval] = useState(true)
  const updateConfig = useUpdateConfig()

  function reset() {
    setTransport('stdio')
    setId('')
    setName('')
    setCommand('')
    setArgs('')
    setUrl('')
    setRequireApproval(true)
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
                  onClick={() => setTransport(key)}
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

          {/* SSE field */}
          {transport === 'sse' && (
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
