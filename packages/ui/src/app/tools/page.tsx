'use client'

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
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
import { type ToolPluginInfo, useTools } from '@/hooks/use-tools'

// ---------------------------------------------------------------------------
// Plugin alerts (errors + warnings)
// ---------------------------------------------------------------------------

function PluginAlerts({ plugin }: { plugin: ToolPluginInfo }) {
  return (
    <>
      {!plugin.envConfigured && plugin.envVars.length > 0 && (
        <EnvVarWarning envVars={plugin.envVars} />
      )}

      {plugin.validationErrors.length > 0 && (
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
      )}

      {plugin.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangleIcon className="size-3.5" />
            Warning
          </p>
          <ul className="mt-1.5 list-inside list-disc text-muted-foreground">
            {plugin.warnings.map((w) => (
              <li key={w} className="text-xs">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Plugin status badge
// ---------------------------------------------------------------------------

function PluginStatusBadge({
  plugin,
  configured,
}: {
  plugin: ToolPluginInfo
  configured: boolean
}) {
  if (plugin.validationErrors.length > 0) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        <AlertTriangleIcon className="size-3" />
        Invalid config
      </Badge>
    )
  }
  if (!plugin.envConfigured) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        <XCircleIcon className="size-3" />
        Missing env vars
      </Badge>
    )
  }
  if (configured) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        <CheckCircle2Icon className="size-3" />
        Configured
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      Not configured
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Tool plugin card
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

  const hasBody =
    (!plugin.envConfigured && plugin.envVars.length > 0) ||
    plugin.validationErrors.length > 0 ||
    plugin.warnings.length > 0 ||
    (plugin.envConfigured && plugin.configFields.length > 0) ||
    enabled

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm">{plugin.name}</CardTitle>
          <CardDescription className="font-mono text-xs">{plugin.id}</CardDescription>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <PluginStatusBadge plugin={plugin} configured={configured} />
          </div>
        </div>
        <CardAction>
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={!canEnable} />
        </CardAction>
      </CardHeader>

      {hasBody && (
        <CardContent className="flex flex-col gap-4">
          <PluginAlerts plugin={plugin} />

          {enabled && (
            <div className="flex items-center gap-3">
              <Switch
                id={`${plugin.id}-approval`}
                checked={!!fields.requireApproval}
                onCheckedChange={(checked) => {
                  const next = { ...fields, requireApproval: checked }
                  setFields(next)
                  updateConfig.mutate({
                    toolPlugins: { [plugin.id]: { ...next, enabled } },
                  })
                }}
                size="sm"
              />
              <Label htmlFor={`${plugin.id}-approval`}>Require Approval</Label>
            </div>
          )}

          {plugin.envConfigured && plugin.configFields.length > 0 && (
            <>
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
                <Button
                  size="sm"
                  className="self-end"
                  disabled={updateConfig.isPending}
                  onClick={save}
                >
                  {updateConfig.isPending ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </Button>
              )}
            </>
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
  const { plugins, isLoading, error } = useTools()

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Tools</h1>

      <section className="flex flex-col gap-4">
        {plugins.map((plugin) => (
          <ToolPluginCard key={plugin.id} plugin={plugin} />
        ))}
      </section>
    </div>
  )
}
