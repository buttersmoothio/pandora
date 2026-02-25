'use client'

import {
  AlertTriangleIcon,
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
import { ConfigField } from '@/components/settings/config-field'
import { EnvVarWarning } from '@/components/settings/env-var-warning'
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
// Individual tool row (enable, require approval)
// ---------------------------------------------------------------------------

function ToolRow({ tool, allTools }: { tool: ToolInfo; allTools: ToolInfo[] }) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(tool.enabled)
  const [requireApproval, setRequireApproval] = useState(tool.requireApproval ?? false)

  useEffect(() => {
    setEnabled(tool.enabled)
    setRequireApproval(tool.requireApproval ?? false)
  }, [tool])

  function buildToolsRecord(overrides: Partial<{ enabled: boolean; requireApproval: boolean }>) {
    const record: Record<
      string,
      { enabled: boolean; requireApproval?: boolean; settings?: Record<string, string> }
    > = {}
    for (const t of allTools) {
      if (t.id === tool.id) {
        const approval = overrides.requireApproval ?? requireApproval
        record[t.id] = {
          enabled: overrides.enabled ?? enabled,
          requireApproval: approval,
          settings: t.settings,
        }
      } else {
        record[t.id] = {
          enabled: t.enabled,
          requireApproval: t.requireApproval,
          settings: t.settings,
        }
      }
    }
    return record
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    updateConfig.mutate({ tools: buildToolsRecord({ enabled: checked }) })
  }

  function handleApprovalToggle(checked: boolean) {
    setRequireApproval(checked)
    updateConfig.mutate({ tools: buildToolsRecord({ requireApproval: checked }) })
  }

  const permissions = tool.permissions ?? {}
  const permissionKeys = Object.keys(permissions).filter(
    (k) => permissions[k as keyof typeof permissions],
  )

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-sm">{tool.name}</p>
          <p className="text-muted-foreground text-xs">{tool.description}</p>
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
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="flex items-center gap-3">
          <Switch
            id={`${tool.id}-approval`}
            checked={requireApproval}
            onCheckedChange={handleApprovalToggle}
            size="sm"
          />
          <Label htmlFor={`${tool.id}-approval`}>Require Approval</Label>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tool plugin card (plugin config + nested tools)
// ---------------------------------------------------------------------------

function ToolPluginCard({
  plugin,
  tools,
  allTools,
}: {
  plugin: ToolPluginInfo
  tools: ToolInfo[]
  allTools: ToolInfo[]
}) {
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
            {plugin.validationErrors.length > 0 ? (
              <Badge variant="destructive" className="text-[10px]">
                <AlertTriangleIcon className="size-3" />
                Invalid config
              </Badge>
            ) : plugin.envConfigured ? (
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
          <EnvVarWarning envVars={plugin.envVars} />
        </CardContent>
      )}

      {plugin.validationErrors.length > 0 && (
        <CardContent>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-destructive">
              <AlertTriangleIcon className="size-3.5" />
              Invalid configuration
            </p>
            <ul className="mt-1.5 list-inside list-disc text-muted-foreground">
              {plugin.validationErrors.map((err) => (
                <li key={err} className="font-mono text-xs">
                  {err}
                </li>
              ))}
            </ul>
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

      {enabled && tools.length > 0 && (
        <CardContent className="flex flex-col gap-3">
          <p className="font-medium text-muted-foreground text-xs">Tools</p>
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} allTools={allTools} />
          ))}
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

  if (!plugins || plugins.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <WrenchIcon className="size-10" />
        <p className="text-sm">No tools available. Install a tool package to get started.</p>
      </div>
    )
  }

  const toolsById = new Map((tools ?? []).map((t) => [t.id, t]))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Tools</h1>

      <section className="flex flex-col gap-4">
        {plugins.map((plugin) => {
          const pluginTools = plugin.toolIds
            .map((id) => toolsById.get(id))
            .filter((t): t is ToolInfo => t != null)
          return (
            <ToolPluginCard
              key={plugin.id}
              plugin={plugin}
              tools={pluginTools}
              allTools={tools ?? []}
            />
          )
        })}
      </section>
    </div>
  )
}
