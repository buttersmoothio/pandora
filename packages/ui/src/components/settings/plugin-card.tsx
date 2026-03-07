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
import { createContext, useContext, useEffect, useState } from 'react'
import type { Alert, ConfigFieldDescriptor, EnvVarDescriptor } from '@/hooks/plugin-types'
import type { Config } from '@/hooks/use-config'
import { useUpdateConfig } from '@/hooks/use-config'
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
// Draft config context — lets dialog children read/write config without
// directly calling updateConfig.mutate(). Changes are committed via Save.
// ---------------------------------------------------------------------------

interface PluginConfigDraftCtx {
  config: Record<string, unknown>
  setConfig: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
}

const PluginConfigDraftContext = createContext<PluginConfigDraftCtx | null>(null)

/** Read/write the draft plugin config inside a PluginInfoDialog. */
export function usePluginConfigDraft() {
  const ctx = useContext(PluginConfigDraftContext)
  if (!ctx) throw new Error('usePluginConfigDraft must be used within a PluginInfoDialog')
  return ctx
}

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

export function PluginIcon({
  name,
  icon,
  size = 'md',
}: {
  name: string
  icon?: string
  size?: 'sm' | 'md'
}) {
  const px = size === 'sm' ? 'size-5' : 'size-10'
  const text = size === 'sm' ? 'text-xs' : 'text-base'
  const rounded = size === 'sm' ? 'rounded' : 'rounded-lg'

  if (icon) {
    return (
      <Image
        src={icon}
        alt={name}
        width={size === 'sm' ? 20 : 40}
        height={size === 'sm' ? 20 : 40}
        className={`${px} ${rounded} object-cover`}
      />
    )
  }

  const initial = name.charAt(0).toUpperCase()
  const color = hashColor(name)

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

export function MetadataItem({ label, children }: { label: string; children: React.ReactNode }) {
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

export function Section({ label, children }: { label: string; children: React.ReactNode }) {
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
      <span className="inline-flex items-center gap-1 text-destructive text-xs">
        <AlertTriangleIcon className="size-3" />
        Invalid config
      </span>
    )
  }
  if (!plugin.envConfigured) {
    return (
      <span className="inline-flex items-center gap-1 text-destructive text-xs">
        <XCircleIcon className="size-3" />
        Missing env vars
      </span>
    )
  }
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs dark:text-emerald-400">
        <CheckCircle2Icon className="size-3" />
        Configured
      </span>
    )
  }
  return <span className="text-muted-foreground text-xs">Not configured</span>
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
  readonly: isReadonly,
}: {
  plugin: PluginBase
  configured: boolean
  onToggle: (enabled: boolean) => void
  isPending: boolean
  readonly?: boolean
}) {
  if (isReadonly) return null

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
  readonly: isReadonly,
}: {
  plugin: PluginBase & { enabled: boolean }
  hasSidebar: boolean
  configured: boolean
  onToggle: (enabled: boolean) => void
  isPending: boolean
  readonly?: boolean
}) {
  return (
    <DialogHeader className="px-6 pt-6 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PluginIcon name={plugin.name} icon={plugin.icon} />
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
          readonly={isReadonly}
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
  /** Config key for the PATCH /api/config request */
  configKey: keyof Config
  /** Whether the plugin is read-only (e.g. storage/vector — not togglable) */
  readonly?: boolean
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
  readonly: isReadonly,
  permissions,
  children,
  trigger,
}: PluginInfoDialogProps) {
  const updateConfig = useUpdateConfig()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>(plugin.config)

  // Reset draft when server data changes or dialog closes
  // biome-ignore lint/correctness/useExhaustiveDependencies: open triggers reset on dialog reopen
  useEffect(() => {
    setDraft(plugin.config)
  }, [plugin, open])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(plugin.config)

  const configured =
    plugin.envConfigured && requiredFieldsFilled(plugin.configFields, plugin.config)

  function handleToggle(next: boolean) {
    updateConfig.mutate({
      [configKey]: { [plugin.id]: { ...plugin.config, enabled: next } },
    })
  }

  function save() {
    updateConfig.mutate({
      [configKey]: { [plugin.id]: { ...draft, enabled: plugin.enabled } },
    })
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
        className={`flex max-h-[85vh] flex-col gap-0 p-0 ${hasSidebar ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
        showCloseButton={false}
      >
        <DialogHeaderContent
          plugin={plugin}
          hasSidebar={!!hasSidebar}
          configured={configured}
          onToggle={handleToggle}
          isPending={updateConfig.isPending}
          readonly={isReadonly}
        />

        {/* Body — two-panel on md+, stacked on mobile */}
        <PluginConfigDraftContext.Provider value={{ config: draft, setConfig: setDraft }}>
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
                        value={draft[field.key]}
                        onChange={(v) => setDraft((prev) => ({ ...prev, [field.key]: v }))}
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
        </PluginConfigDraftContext.Provider>

        {/* Footer */}
        <DialogFooter className="border-t px-6 py-4">
          {isDirty ? (
            <>
              <DialogClose asChild>
                <Button variant="outline" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button size="sm" disabled={updateConfig.isPending} onClick={save}>
                {updateConfig.isPending && <Loader2Icon className="size-4 animate-spin" />}
                Save
              </Button>
            </>
          ) : (
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Close
              </Button>
            </DialogClose>
          )}
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
  /** Whether the plugin is read-only (e.g. storage/vector — not togglable) */
  readonly?: boolean
  /** Permissions to display in the dialog */
  permissions?: PermissionDisplayProps
  /** Summary line shown below the description (e.g. capability counts) */
  summary?: React.ReactNode
  /** Extra content rendered inside the dialog (e.g. capability badges, require approval) */
  dialogContent?: React.ReactNode
}

export function PluginCard({
  plugin,
  configKey,
  readonly: isReadonly,
  permissions,
  summary,
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
    <div className="flex items-center gap-4 rounded-xl border bg-card px-5 py-4 text-card-foreground shadow-sm">
      <PluginIcon name={plugin.name} icon={plugin.icon} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
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
        <div className="mt-2 flex items-center gap-1.5 text-muted-foreground text-xs">
          <PluginStatusBadge plugin={plugin} configured={configured} />
          {summary && (
            <>
              <span>&middot;</span>
              {summary}
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <PluginInfoDialog
          plugin={plugin}
          configKey={configKey}
          readonly={isReadonly}
          permissions={permissions}
          trigger={
            <Button variant="ghost" size="icon" className="size-7" aria-label="Plugin settings">
              <SettingsIcon className="size-4" />
            </Button>
          }
        >
          {dialogContent}
        </PluginInfoDialog>
        {!isReadonly && canEnable && (
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={updateConfig.isPending}
          />
        )}
      </div>
    </div>
  )
}
