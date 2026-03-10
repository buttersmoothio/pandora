'use client'

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  SettingsIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useUpdateConfig } from '@/hooks/use-config'
import type { McpServerInfo } from '@/hooks/use-mcp'
import { MetadataItem, PluginIcon, Section } from './plugin-card'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format `create_or_update_file` → `Create or update file` */
function formatToolName(name: string): string {
  const formatted = name.replace(/_/g, ' ')
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

// ---------------------------------------------------------------------------
// Status badge (matching plugin cards)
// ---------------------------------------------------------------------------

function McpStatusBadge({ server }: { server: McpServerInfo }) {
  if (server.authUrl) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 text-xs dark:text-amber-400">
        <KeyRoundIcon className="size-3" />
        Authorization required
      </span>
    )
  }
  if (server.error) {
    return (
      <span className="inline-flex items-center gap-1 text-destructive text-xs">
        <AlertTriangleIcon className="size-3" />
        Error
      </span>
    )
  }
  if (server.enabled) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs dark:text-emerald-400">
        <CheckCircle2Icon className="size-3" />
        Connected
      </span>
    )
  }
  return <span className="text-muted-foreground text-xs">Disabled</span>
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function McpServerCard({ server }: { server: McpServerInfo }) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(server.enabled)

  useEffect(() => {
    setEnabled(server.enabled)
  }, [server.enabled])

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    updateConfig.mutate({
      mcpServers: {
        [server.id]: { enabled: checked },
      },
    })
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card px-5 py-4 text-card-foreground shadow-sm">
      <PluginIcon name={server.name} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm">{server.name}</p>
          <Badge variant="outline" className="text-xs">
            {server.type === 'stdio' ? 'Local' : 'Remote'}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {server.type === 'stdio' ? 'Local process' : 'Remote server'}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
          <McpStatusBadge server={server} />
          {server.enabled && !server.error && server.tools.length > 0 && (
            <>
              <span>&middot;</span>
              <span>
                {server.tools.length} {server.tools.length === 1 ? 'tool' : 'tools'}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {server.authUrl && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => window.open(server.authUrl, '_blank')}
          >
            <ExternalLinkIcon className="size-3.5" />
            Authorize
          </Button>
        )}
        <McpServerDialog server={server}>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Server settings">
            <SettingsIcon className="size-4" />
          </Button>
        </McpServerDialog>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={updateConfig.isPending}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible tool list
// ---------------------------------------------------------------------------

const TOOL_COLLAPSE_THRESHOLD = 8

function ToolList({ tools }: { tools: McpServerInfo['tools'] }) {
  const [expanded, setExpanded] = useState(tools.length <= TOOL_COLLAPSE_THRESHOLD)
  const visible = expanded ? tools : tools.slice(0, TOOL_COLLAPSE_THRESHOLD)
  const hiddenCount = tools.length - TOOL_COLLAPSE_THRESHOLD

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map((tool) => (
        <div key={tool.id} className="rounded-md border px-3 py-2">
          <p className="font-medium text-sm">{formatToolName(tool.name)}</p>
          {tool.description && <p className="text-muted-foreground text-xs">{tool.description}</p>}
        </div>
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center justify-center gap-1 rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs transition-colors hover:bg-muted"
        >
          <ChevronDownIcon className="size-3" />
          Show {hiddenCount} more
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog body panels (extracted for complexity)
// ---------------------------------------------------------------------------

function DialogMainPanel({ server }: { server: McpServerInfo }) {
  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
      {server.authUrl && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 font-medium text-amber-600 text-sm dark:text-amber-400">
            <KeyRoundIcon className="size-4" />
            Authorization Required
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            This server requires OAuth authorization before its tools can be used.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 gap-1.5"
            onClick={() => window.open(server.authUrl, '_blank')}
          >
            <ExternalLinkIcon className="size-3.5" />
            Authorize
          </Button>
        </div>
      )}

      {server.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 font-medium text-destructive text-sm">
            <AlertTriangleIcon className="size-4" />
            Error
          </p>
          <p className="mt-1 text-muted-foreground text-sm">{server.error}</p>
        </div>
      )}

      {server.tools.length > 0 && (
        <Section label={`Tools (${server.tools.length})`}>
          <ToolList tools={server.tools} />
          {server.requireApproval && (
            <p className="text-muted-foreground text-xs">Approval required before running tools.</p>
          )}
        </Section>
      )}
    </div>
  )
}

function DialogSidebar({ server }: { server: McpServerInfo }) {
  return (
    <div className="w-full shrink-0 overflow-y-auto border-t bg-muted/30 px-6 py-5 md:w-60 md:border-t-0 md:border-l">
      <div className="flex flex-col gap-4">
        <MetadataItem label="Type">
          <p>{server.type === 'stdio' ? 'Local (stdio)' : 'Remote (HTTP)'}</p>
        </MetadataItem>
        <MetadataItem label="Server ID">
          <code className="font-mono text-muted-foreground">{server.id}</code>
        </MetadataItem>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog (two-panel layout matching plugin dialogs)
// ---------------------------------------------------------------------------

function McpServerDialog({
  server,
  children,
}: {
  server: McpServerInfo
  children: React.ReactNode
}) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(server.enabled)

  useEffect(() => {
    setEnabled(server.enabled)
  }, [server.enabled])

  function handleToggle(next: boolean) {
    setEnabled(next)
    updateConfig.mutate({
      mcpServers: { [server.id]: { enabled: next } },
    })
  }

  function handleRemove() {
    updateConfig.mutate({
      mcpServers: { [server.id]: null },
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <PluginIcon name={server.name} size="md" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg">{server.name}</DialogTitle>
                </div>
                <DialogDescription>
                  {server.type === 'stdio' ? 'Local process' : 'Remote server'}
                </DialogDescription>
              </div>
            </div>
            <Button
              variant={enabled ? 'outline' : 'default'}
              size="sm"
              className="shrink-0"
              onClick={() => handleToggle(!enabled)}
              disabled={updateConfig.isPending}
            >
              {enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col border-t md:flex-row">
          <DialogMainPanel server={server} />
          <DialogSidebar server={server} />
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRemove}
            disabled={updateConfig.isPending}
          >
            Remove
          </Button>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
