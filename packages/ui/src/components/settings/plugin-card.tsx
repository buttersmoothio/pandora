'use client'

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  SettingsIcon,
  XCircleIcon,
} from 'lucide-react'
import Image from 'next/image'
import type React from 'react'
import { useEffect, useState } from 'react'
import type { ConfigFieldDescriptor, EnvVarDescriptor } from '@/hooks/use-channels'
import type { Config } from '@/hooks/use-config'
import { useUpdateConfig } from '@/hooks/use-config'
import type { Alert } from '@/hooks/use-tools'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
import { Switch } from '../ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { ConfigField } from './config-field'
import { EnvVarOverview } from './env-var-warning'
import type { PermissionDisplayProps } from './permission-display'
import { PermissionDisplay, SandboxBadge } from './permission-display'

// ---------------------------------------------------------------------------
// Shared plugin base type
// ---------------------------------------------------------------------------

export interface PluginBase {
  id: string
  name: string
  description?: string
  author?: string
  icon?: string
  version?: string
  homepage?: string
  repository?: string
  license?: string
  envVars: EnvVarDescriptor[]
  envConfigured: boolean
  configFields: ConfigFieldDescriptor[]
  enabled: boolean
  config: Record<string, unknown>
  validationErrors?: string[]
  alerts?: Alert[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requiredFieldsFilled(
  configFields: ConfigFieldDescriptor[],
  config: Record<string, unknown>,
) {
  return configFields
    .filter((f) => f.required)
    .every((f) => {
      const val = config[f.key]
      return typeof val === 'string' ? val.trim() !== '' : val != null
    })
}

// ---------------------------------------------------------------------------
// PluginIcon — renders icon URL or letter-initial fallback
// ---------------------------------------------------------------------------

const INITIAL_COLORS = [
  'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
]

function hashColor(name: string) {
  let hash = 0
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  return INITIAL_COLORS[Math.abs(hash) % INITIAL_COLORS.length]
}

function PluginIcon({ plugin, size = 'md' }: { plugin: PluginBase; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 'size-5' : 'size-10'
  const text = size === 'sm' ? 'text-xs' : 'text-base'
  const rounded = size === 'sm' ? 'rounded' : 'rounded-lg'

  if (plugin.icon) {
    return (
      <Image
        src={plugin.icon}
        alt={plugin.name}
        width={size === 'sm' ? 20 : 40}
        height={size === 'sm' ? 20 : 40}
        className={`${px} ${rounded} object-cover`}
      />
    )
  }

  const initial = plugin.name.charAt(0).toUpperCase()
  const color = hashColor(plugin.name)

  return (
    <div
      className={`${px} ${rounded} ${color} flex shrink-0 items-center justify-center font-semibold ${text}`}
    >
      {initial}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MetadataItem — label + value pair for the sidebar
// ---------------------------------------------------------------------------

function MetadataItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PluginMetadataSidebar — right panel
// ---------------------------------------------------------------------------

function PluginMetadataSidebar({
  plugin,
  permissions,
}: {
  plugin: PluginBase
  permissions?: PermissionDisplayProps
}) {
  return (
    <div className="flex flex-col gap-4">
      {plugin.author && (
        <MetadataItem label="Author">
          <p>{plugin.author}</p>
        </MetadataItem>
      )}
      {plugin.version && (
        <MetadataItem label="Version">
          <p>{plugin.version}</p>
        </MetadataItem>
      )}
      {plugin.license && (
        <MetadataItem label="License">
          <p>{plugin.license}</p>
        </MetadataItem>
      )}
      {permissions && (
        <MetadataItem label="Sandbox">
          <SandboxBadge sandbox={permissions.sandbox} />
        </MetadataItem>
      )}
      {plugin.homepage && (
        <MetadataItem label="Homepage">
          <a
            href={plugin.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 text-sm hover:underline dark:text-blue-400"
          >
            Visit
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </MetadataItem>
      )}
      {plugin.repository && (
        <MetadataItem label="Repository">
          <a
            href={plugin.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 text-sm hover:underline dark:text-blue-400"
          >
            Source
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </MetadataItem>
      )}
      <MetadataItem label="Plugin ID">
        <code className="font-mono text-muted-foreground">{plugin.id}</code>
      </MetadataItem>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section — labeled group inside the dialog
// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">{label}</p>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

export function PluginStatusBadge({
  plugin,
  configured,
}: {
  plugin: PluginBase
  configured: boolean
}) {
  if (plugin.validationErrors && plugin.validationErrors.length > 0) {
    return (
      <Badge variant="destructive">
        <AlertTriangleIcon className="size-3.5" />
        Invalid config
      </Badge>
    )
  }
  if (!plugin.envConfigured) {
    return (
      <Badge variant="destructive">
        <XCircleIcon className="size-3.5" />
        Missing env vars
      </Badge>
    )
  }
  if (configured) {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon className="size-3.5" />
        Configured
      </Badge>
    )
  }
  return <Badge variant="outline">Not configured</Badge>
}

// ---------------------------------------------------------------------------
// Alerts (validation errors + warnings)
// ---------------------------------------------------------------------------

function PluginAlerts({ plugin }: { plugin: PluginBase }) {
  const warnings = plugin.alerts?.filter((a) => a.level === 'warning') ?? []
  if ((plugin.validationErrors?.length ?? 0) === 0 && warnings.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {plugin.validationErrors && plugin.validationErrors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 font-medium text-destructive text-sm">
            <AlertTriangleIcon className="size-4" />
            Invalid configuration
          </p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground text-sm">
            {plugin.validationErrors.map((err) => (
              <li key={err} className="font-mono">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 font-medium text-amber-600 text-sm dark:text-amber-400">
            <AlertTriangleIcon className="size-4" />
            Warning
          </p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground text-sm">
            {warnings.map((w) => (
              <li key={w.message}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header action button (Chrome Web Store style)
// ---------------------------------------------------------------------------

function HeaderActionButton({
  plugin,
  configured,
  onToggle,
  isPending,
}: {
  plugin: PluginBase
  configured: boolean
  onToggle: (enabled: boolean) => void
  isPending: boolean
}) {
  if (plugin.enabled) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => onToggle(false)}
        disabled={isPending}
      >
        {isPending && <Loader2Icon className="size-4 animate-spin" />}
        Disable
      </Button>
    )
  }

  if (!configured) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="default" size="sm" className="shrink-0" disabled>
                Enable
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Configure required settings first</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <Button
      variant="default"
      size="sm"
      className="shrink-0"
      onClick={() => onToggle(true)}
      disabled={isPending}
    >
      {isPending && <Loader2Icon className="size-4 animate-spin" />}
      Enable
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Dialog header content
// ---------------------------------------------------------------------------

function DialogHeaderContent({
  plugin,
  hasSidebar,
  configured,
  onToggle,
  isPending,
}: {
  plugin: PluginBase & { enabled: boolean }
  hasSidebar: boolean
  configured: boolean
  onToggle: (enabled: boolean) => void
  isPending: boolean
}) {
  return (
    <DialogHeader className="px-6 pt-6 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PluginIcon plugin={plugin} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg">{plugin.name}</DialogTitle>
              {plugin.version && !hasSidebar && (
                <Badge variant="secondary">v{plugin.version}</Badge>
              )}
            </div>
            {(plugin.description || plugin.author) && (
              <DialogDescription>
                {plugin.description}
                {plugin.author && (
                  <>
                    {plugin.description && ' \u00b7 '}
                    by {plugin.author}
                  </>
                )}
              </DialogDescription>
            )}
          </div>
        </div>
        <HeaderActionButton
          plugin={plugin}
          configured={configured}
          onToggle={onToggle}
          isPending={isPending}
        />
      </div>
    </DialogHeader>
  )
}

// ---------------------------------------------------------------------------
// Plugin info dialog — two-panel layout
// ---------------------------------------------------------------------------

export interface PluginInfoDialogProps {
  plugin: PluginBase
  /** Config key for the PATCH /api/config request (e.g. 'channels', 'toolPlugins', 'agentPlugins') */
  configKey: keyof Config
  /** Permissions to display in the dialog */
  permissions?: PermissionDisplayProps
  /** Extra content rendered inside the dialog (e.g. capability badges, require approval toggle) */
  children?: React.ReactNode
  /** Trigger element */
  trigger: React.ReactNode
}

export function PluginInfoDialog({
  plugin,
  configKey,
  permissions,
  children,
  trigger,
}: PluginInfoDialogProps) {
  const updateConfig = useUpdateConfig()
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState<Record<string, unknown>>(plugin.config)
  const [enabled, setEnabled] = useState(plugin.enabled)

  // Reset local state when server data changes
  useEffect(() => {
    setFields(plugin.config)
    setEnabled(plugin.enabled)
  }, [plugin])

  const isDirty =
    JSON.stringify(fields) !== JSON.stringify(plugin.config) || enabled !== plugin.enabled

  const configured =
    plugin.envConfigured && requiredFieldsFilled(plugin.configFields, plugin.config)

  function handleToggle(next: boolean) {
    setEnabled(next)
  }

  function save() {
    updateConfig.mutate(
      { [configKey]: { [plugin.id]: { ...fields, enabled } } },
      { onSuccess: () => setOpen(false) },
    )
  }

  const hasEnvVars = plugin.envVars.length > 0
  const hasConfigFields = plugin.envConfigured && plugin.configFields.length > 0
  const hasSidebar =
    plugin.author ||
    plugin.version ||
    plugin.license ||
    plugin.homepage ||
    plugin.repository ||
    permissions

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={`flex max-h-[85vh] flex-col gap-0 p-0 ${hasSidebar ? 'sm:max-w-2xl' : ''}`}
        showCloseButton={false}
      >
        <DialogHeaderContent
          plugin={{ ...plugin, enabled }}
          hasSidebar={!!hasSidebar}
          configured={configured}
          onToggle={handleToggle}
          isPending={updateConfig.isPending}
        />

        {/* Body — two-panel on md+, stacked on mobile */}
        <div className="flex min-h-0 flex-1 flex-col border-t md:flex-row">
          {/* Left panel — main content, scrollable */}
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <PluginAlerts plugin={plugin} />

            {hasConfigFields && (
              <Section label="Configuration">
                <div className="flex flex-col gap-4">
                  {plugin.configFields.map((field) => (
                    <ConfigField
                      key={field.key}
                      field={field}
                      scopeId={plugin.id}
                      value={fields[field.key]}
                      onChange={(v) => setFields({ ...fields, [field.key]: v })}
                    />
                  ))}
                </div>
              </Section>
            )}

            {children}

            {hasEnvVars && (
              <Section label="Environment">
                <EnvVarOverview envVars={plugin.envVars} />
              </Section>
            )}

            {permissions && (
              <Section label="Permissions">
                <PermissionDisplay {...permissions} />
              </Section>
            )}
          </div>

          {/* Right panel — metadata sidebar */}
          {hasSidebar && (
            <div className="w-full shrink-0 overflow-y-auto border-t bg-muted/30 px-6 py-5 md:w-60 md:border-t-0 md:border-l">
              <PluginMetadataSidebar plugin={plugin} permissions={permissions} />
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t px-6 py-4">
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" disabled={!isDirty || updateConfig.isPending} onClick={save}>
            {updateConfig.isPending && <Loader2Icon className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Plugin card
// ---------------------------------------------------------------------------

export interface PluginCardProps {
  plugin: PluginBase
  /** Config key for the PATCH /api/config request */
  configKey: keyof Config
  /** Permissions to display in the dialog */
  permissions?: PermissionDisplayProps
  /** Compact permission badges shown on the card */
  compactPermissions?: PermissionDisplayProps
  /** Extra badges shown on the card (e.g. webhook, realtime) */
  badges?: React.ReactNode
  /** Extra content rendered inside the dialog (e.g. capability badges, require approval) */
  dialogContent?: React.ReactNode
}

export function PluginCard({
  plugin,
  configKey,
  permissions,
  compactPermissions,
  badges,
  dialogContent,
}: PluginCardProps) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(plugin.enabled)

  useEffect(() => {
    setEnabled(plugin.enabled)
  }, [plugin])

  const configured =
    plugin.envConfigured && requiredFieldsFilled(plugin.configFields, plugin.config)
  const canEnable = configured

  const infos = plugin.alerts?.filter((a) => a.level === 'info') ?? []

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    updateConfig.mutate({
      [configKey]: { [plugin.id]: { ...plugin.config, enabled: checked } },
    })
  }

  return (
    <div className="flex flex-col rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <PluginIcon plugin={plugin} size="sm" />
            <p className="font-semibold text-sm">{plugin.name}</p>
            {infos.map((info, i) => (
              <Badge key={`${i}-${info.message}`} variant="outline">
                {info.message}
              </Badge>
            ))}
          </div>
          {plugin.description && (
            <p className="text-muted-foreground text-sm">{plugin.description}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {compactPermissions && <PermissionDisplay {...compactPermissions} compact />}
            <PluginStatusBadge plugin={plugin} configured={configured} />
            {badges}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEnable ? (
            <>
              <PluginInfoDialog
                plugin={plugin}
                configKey={configKey}
                permissions={permissions}
                trigger={
                  <Button variant="ghost" size="icon" className="size-7">
                    <SettingsIcon className="size-4" />
                  </Button>
                }
              >
                {dialogContent}
              </PluginInfoDialog>
              <Switch
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={updateConfig.isPending}
              />
            </>
          ) : (
            <PluginInfoDialog
              plugin={plugin}
              configKey={configKey}
              permissions={permissions}
              trigger={
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              }
            >
              {dialogContent}
            </PluginInfoDialog>
          )}
        </div>
      </div>
    </div>
  )
}
