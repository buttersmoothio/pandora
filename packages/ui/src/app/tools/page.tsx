'use client'

import { Loader2Icon, WrenchIcon } from 'lucide-react'
import { aggregatePermissions } from '@/components/settings/permission-display'
import { PluginCard } from '@/components/settings/plugin-card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUpdateConfig } from '@/hooks/use-config'
import { type ToolInfo, type ToolPluginInfo, useTools } from '@/hooks/use-tools'

// ---------------------------------------------------------------------------
// Require-approval toggle (shown in the dialog when plugin is enabled)
// ---------------------------------------------------------------------------

function RequireApprovalToggle({ plugin }: { plugin: ToolPluginInfo }) {
  const updateConfig = useUpdateConfig()
  if (!plugin.enabled) return null

  return (
    <div className="flex items-center gap-3">
      <Switch
        id={`${plugin.id}-approval`}
        checked={!!plugin.config.requireApproval}
        onCheckedChange={(checked) => {
          updateConfig.mutate({
            toolPlugins: {
              [plugin.id]: { ...plugin.config, requireApproval: checked, enabled: plugin.enabled },
            },
          })
        }}
        size="sm"
      />
      <Label htmlFor={`${plugin.id}-approval`}>Require Approval</Label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tool plugin card wrapper
// ---------------------------------------------------------------------------

function ToolPluginCardWrapper({ plugin, tools }: { plugin: ToolPluginInfo; tools: ToolInfo[] }) {
  const pluginPerms = plugin.permissions
  const permsToShow =
    pluginPerms && Object.keys(pluginPerms).length > 0 ? pluginPerms : aggregatePermissions(tools)

  return (
    <PluginCard
      plugin={plugin}
      configKey="toolPlugins"
      permissions={{ permissions: permsToShow, sandbox: plugin.sandbox }}
      compactPermissions={{ permissions: permsToShow, sandbox: plugin.sandbox }}
      dialogContent={<RequireApprovalToggle plugin={plugin} />}
    />
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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Tools</h1>

      <section className="flex flex-col gap-4">
        {plugins.map((plugin) => {
          const pluginTools = plugin.toolIds
            .map((id) => toolsById.get(id))
            .filter((t): t is ToolInfo => t != null)
          return <ToolPluginCardWrapper key={plugin.id} plugin={plugin} tools={pluginTools} />
        })}
      </section>
    </div>
  )
}
