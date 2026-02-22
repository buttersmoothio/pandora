'use client'

import {
  CheckCircle2Icon,
  ClockIcon,
  DicesIcon,
  FolderIcon,
  GlobeIcon,
  KeyIcon,
  Loader2Icon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfigField } from '@/components/config-field'
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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUpdateConfig } from '@/hooks/use-config'
import { type ToolInfo, type ToolPluginInfo, useTools } from '@/hooks/use-tools'

// ---------------------------------------------------------------------------
// Permission badges
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool plugin card (env vars, configFields, enable toggle)
// ---------------------------------------------------------------------------

function ToolPluginCard({ plugin }: { plugin: ToolPluginInfo }) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(plugin.enabled)
  const [fields, setFields] = useState<Record<string, unknown>>(plugin.config)

  useEffect(() => {
    setEnabled(plugin.enabled)
    setFields(plugin.config)
  }, [plugin])

  const requiredFieldsFilled = plugin.configFields
    .filter((f) => f.required)
    .every((f) => {
      const val = fields[f.key]
      return typeof val === 'string' ? val.trim() !== '' : val != null
    })

  const savedRequiredFieldsFilled = plugin.configFields
    .filter((f) => f.required)
    .every((f) => {
      const val = plugin.config[f.key]
      return typeof val === 'string' ? val.trim() !== '' : val != null
    })

  const configured = plugin.envConfigured && savedRequiredFieldsFilled
  const canEnable = plugin.envConfigured && requiredFieldsFilled

  const isDirty =
    enabled !== plugin.enabled || JSON.stringify(fields) !== JSON.stringify(plugin.config)

  function save() {
    updateConfig.mutate({
      toolPlugins: { [plugin.id]: { ...fields, enabled } },
    })
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    updateConfig.mutate({
      toolPlugins: { [plugin.id]: { ...plugin.config, enabled: checked } },
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm">{plugin.name}</CardTitle>
          <CardDescription className="font-mono text-xs">{plugin.id}</CardDescription>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plugin.envConfigured ? (
              configured ? (
                <Badge variant="secondary" className="text-[10px]">
                  <CheckCircle2Icon className="size-3" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Not configured
                </Badge>
              )
            ) : (
              <Badge variant="destructive" className="text-[10px]">
                <XCircleIcon className="size-3" />
                Missing env vars
              </Badge>
            )}
          </div>
        </div>
        <CardAction>
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={!canEnable} />
        </CardAction>
      </CardHeader>

      {!plugin.envConfigured && plugin.envVars.length > 0 && (
        <CardContent>
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              Missing environment variables
            </p>
            <p className="mt-1 text-muted-foreground">Add the following to your environment:</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {plugin.envVars.map((v) => (
                <code key={v} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {v}
                </code>
              ))}
            </div>
          </div>
        </CardContent>
      )}

      {plugin.envConfigured && plugin.configFields.length > 0 && (
        <CardContent className="flex flex-col gap-4">
          {plugin.configFields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              scopeId={plugin.id}
              value={fields[field.key]}
              onChange={(v) => setFields({ ...fields, [field.key]: v })}
            />
          ))}

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

// ---------------------------------------------------------------------------
// Individual tool card (enable, require approval)
// ---------------------------------------------------------------------------

function ToolCard({ tool, allTools }: { tool: ToolInfo; allTools: ToolInfo[] }) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(tool.enabled)
  const [requireApproval, setRequireApproval] = useState(tool.requireApproval ?? false)

  useEffect(() => {
    setEnabled(tool.enabled)
    setRequireApproval(tool.requireApproval ?? false)
  }, [tool])

  const isDirty = enabled !== tool.enabled || requireApproval !== (tool.requireApproval ?? false)

  function buildToolsRecord(overrides: Partial<{ enabled: boolean; requireApproval: boolean }>) {
    const record: Record<
      string,
      { enabled: boolean; requireApproval?: boolean; settings?: Record<string, string> }
    > = {}
    for (const t of allTools) {
      if (t.id === tool.id) {
        record[t.id] = {
          enabled: overrides.enabled ?? enabled,
          requireApproval: (overrides.requireApproval ?? requireApproval) || undefined,
          settings: t.settings,
        }
      } else {
        record[t.id] = {
          enabled: t.enabled,
          requireApproval: t.requireApproval || undefined,
          settings: t.settings,
        }
      }
    }
    return record
  }

  function save() {
    updateConfig.mutate({ tools: buildToolsRecord({}) })
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    updateConfig.mutate({ tools: buildToolsRecord({ enabled: checked }) })
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ToolsPage() {
  const { tools, plugins, isLoading, error } = useTools()

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

  if ((!tools || tools.length === 0) && (!plugins || plugins.length === 0)) {
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

      {plugins && plugins.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-medium text-muted-foreground text-sm">Plugins</h2>
          {plugins.map((plugin) => (
            <ToolPluginCard key={plugin.id} plugin={plugin} />
          ))}
        </section>
      )}

      {tools && tools.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-medium text-muted-foreground text-sm">Tools</h2>
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} allTools={tools} />
          ))}
        </section>
      )}
    </div>
  )
}
