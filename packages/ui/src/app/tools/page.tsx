'use client'

import {
  ClockIcon,
  DicesIcon,
  FolderIcon,
  GlobeIcon,
  KeyIcon,
  Loader2Icon,
  WrenchIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUpdateConfig } from '@/hooks/use-config'
import { type ToolInfo, useTools } from '@/hooks/use-tools'

const PERMISSION_BADGES: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  time: { label: 'Time', icon: ClockIcon },
  network: { label: 'Network', icon: GlobeIcon },
  env: { label: 'Env', icon: KeyIcon },
  fs: { label: 'Filesystem', icon: FolderIcon },
  random: { label: 'Random', icon: DicesIcon },
}

function ToolCard({ tool, allTools }: { tool: ToolInfo; allTools: ToolInfo[] }) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(tool.enabled)
  const [requireApproval, setRequireApproval] = useState(tool.requireApproval ?? false)
  const [settings, setSettings] = useState<Record<string, string>>(tool.settings ?? {})

  useEffect(() => {
    setEnabled(tool.enabled)
    setRequireApproval(tool.requireApproval ?? false)
    setSettings(tool.settings ?? {})
  }, [tool])

  const isDirty =
    enabled !== tool.enabled ||
    requireApproval !== (tool.requireApproval ?? false) ||
    JSON.stringify(settings) !== JSON.stringify(tool.settings ?? {})

  function save() {
    const toolsRecord: Record<
      string,
      { enabled: boolean; requireApproval?: boolean; settings?: Record<string, string> }
    > = {}
    for (const t of allTools) {
      if (t.id === tool.id) {
        toolsRecord[t.id] = {
          enabled,
          requireApproval: requireApproval || undefined,
          settings: Object.keys(settings).length > 0 ? settings : undefined,
        }
      } else {
        toolsRecord[t.id] = {
          enabled: t.enabled,
          requireApproval: t.requireApproval || undefined,
          settings: t.settings,
        }
      }
    }
    updateConfig.mutate({ tools: toolsRecord })
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    // Save immediately on toggle
    const toolsRecord: Record<
      string,
      { enabled: boolean; requireApproval?: boolean; settings?: Record<string, string> }
    > = {}
    for (const t of allTools) {
      if (t.id === tool.id) {
        toolsRecord[t.id] = {
          enabled: checked,
          requireApproval: tool.requireApproval || undefined,
          settings: tool.settings,
        }
      } else {
        toolsRecord[t.id] = {
          enabled: t.enabled,
          requireApproval: t.requireApproval || undefined,
          settings: t.settings,
        }
      }
    }
    updateConfig.mutate({ tools: toolsRecord })
  }

  const permissions = tool.permissions ?? {}
  const permissionKeys = Object.keys(permissions).filter(
    (k) => permissions[k as keyof typeof permissions],
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm">{tool.name}</CardTitle>
          <CardDescription>{tool.description}</CardDescription>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {tool.sandbox}
            </Badge>
            {permissionKeys.map((key) => {
              const badge = PERMISSION_BADGES[key]
              if (!badge) return null
              const Icon = badge.icon
              return (
                <Badge key={key} variant="secondary" className="text-[10px]">
                  <Icon className="size-3" />
                  {badge.label}
                </Badge>
              )
            })}
          </div>
        </div>
        <CardAction>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </CardAction>
      </CardHeader>
      {enabled && (
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Switch
              id={`${tool.id}-approval`}
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
              size="sm"
            />
            <Label htmlFor={`${tool.id}-approval`}>Require Approval</Label>
          </div>

          {Object.entries(settings).length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground text-xs">Settings</Label>
              {Object.entries(settings).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <Label className="w-32 shrink-0 text-xs">{key}</Label>
                  <Input
                    value={value}
                    onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {isDirty && (
            <Button size="sm" className="self-end" disabled={updateConfig.isPending} onClick={save}>
              {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}

export default function ToolsPage() {
  const { data: tools, isLoading, error } = useTools()

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
        <p className="text-destructive">Failed to load tools: {error.message}</p>
      </div>
    )
  }

  if (!tools || tools.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <WrenchIcon className="size-10" />
        <p className="text-sm">No tools available. Install a tool package to get started.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Tools</h1>
      <div className="flex flex-col gap-4">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} allTools={tools} />
        ))}
      </div>
    </div>
  )
}
