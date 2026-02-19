'use client'

import { Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type ToolConfig, useConfig, useUpdateConfig } from '@/hooks/use-config'

function ToolCard({
  toolId,
  tool,
  allTools,
}: {
  toolId: string
  tool: ToolConfig
  allTools: Record<string, ToolConfig>
}) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(tool.enabled)
  const [requireApproval, setRequireApproval] = useState(tool.requireApproval ?? false)
  const [settings, setSettings] = useState<Record<string, string>>(tool.settings ?? {})

  useEffect(() => {
    setEnabled(tool.enabled)
    setRequireApproval(tool.requireApproval ?? false)
    setSettings(tool.settings ?? {})
  }, [tool])

  function save() {
    updateConfig.mutate({
      tools: {
        ...allTools,
        [toolId]: {
          enabled,
          requireApproval: requireApproval || undefined,
          settings: Object.keys(settings).length > 0 ? settings : undefined,
        },
      },
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="font-mono text-sm">{toolId}</CardTitle>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </CardHeader>
      {enabled && (
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Switch
              id={`${toolId}-approval`}
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
              size="sm"
            />
            <Label htmlFor={`${toolId}-approval`}>Require Approval</Label>
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

          <Button size="sm" className="self-end" disabled={updateConfig.isPending} onClick={save}>
            {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
          </Button>
        </CardContent>
      )}
    </Card>
  )
}

export default function ToolsPage() {
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
        <p className="text-destructive">Failed to load tools: {error.message}</p>
      </div>
    )
  }

  if (!config) return null

  const tools = config.tools
  const toolIds = Object.keys(tools)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Tools</h1>
      {toolIds.length === 0 ? (
        <p className="text-muted-foreground">No tools configured.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {toolIds.map((id) => (
            <ToolCard key={id} toolId={id} tool={tools[id]} allTools={tools} />
          ))}
        </div>
      )}
    </div>
  )
}
