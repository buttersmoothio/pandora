import {
  ChevronDownIcon,
  ClockIcon,
  DicesIcon,
  FolderIcon,
  GlobeIcon,
  KeyIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ToolPermissions } from '@/hooks/plugin-types'

// ---------------------------------------------------------------------------
// Permission metadata
// ---------------------------------------------------------------------------

const PERMISSION_META: Record<
  string,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
    detail: (value: boolean | string[]) => string | null
  }
> = {
  time: {
    label: 'Date & Time',
    icon: ClockIcon,
    detail: () => null,
  },
  network: {
    label: 'Network Access',
    icon: GlobeIcon,
    detail: (v) => (Array.isArray(v) ? `${v.length} host${v.length === 1 ? '' : 's'}` : null),
  },
  env: {
    label: 'Environment Variables',
    icon: KeyIcon,
    detail: (v) => (Array.isArray(v) ? `${v.length} key${v.length === 1 ? '' : 's'}` : null),
  },
  fs: {
    label: 'Filesystem',
    icon: FolderIcon,
    detail: (v) => (Array.isArray(v) ? `${v.length} path${v.length === 1 ? '' : 's'}` : null),
  },
  random: {
    label: 'Randomness',
    icon: DicesIcon,
    detail: () => null,
  },
}

// ---------------------------------------------------------------------------
// SandboxBadge
// ---------------------------------------------------------------------------

export function SandboxBadge({ sandbox }: { sandbox: 'compartment' | 'host' }) {
  if (sandbox === 'compartment') {
    return (
      <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">
        <ShieldCheckIcon className="size-3.5" />
        Sandboxed
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
      <ShieldAlertIcon className="size-3.5" />
      Full Access
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// PermissionRow (expandable for array permissions)
// ---------------------------------------------------------------------------

function PermissionRow({ permKey, value }: { permKey: string; value: boolean | string[] }) {
  const meta = PERMISSION_META[permKey]
  if (!meta) return null

  const Icon = meta.icon
  const detailText = meta.detail(value)
  const items = Array.isArray(value) ? value : null

  if (!items || items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm">{meta.label}</span>
      </div>
    )
  }

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-0.5 text-left">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm">{meta.label}</span>
        {detailText && <span className="text-muted-foreground text-sm">&middot; {detailText}</span>}
        <ChevronDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 ml-6 flex flex-wrap gap-1 pb-1">
          {items.map((item) => (
            <code key={item} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {item}
            </code>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// PermissionDisplay (main export)
// ---------------------------------------------------------------------------

export interface PermissionDisplayProps {
  permissions?: ToolPermissions
  sandbox: 'compartment' | 'host'
  compact?: boolean
}

export function PermissionDisplay({ permissions, sandbox, compact }: PermissionDisplayProps) {
  // Host mode = full access, individual permissions are not enforced
  const activePerms =
    sandbox === 'compartment' && permissions
      ? Object.entries(permissions).filter(
          ([, v]) => v === true || (Array.isArray(v) && v.length > 0),
        )
      : []

  if (compact) {
    if (sandbox === 'host') {
      return (
        <div className="flex flex-wrap gap-1.5">
          <SandboxBadge sandbox={sandbox} />
        </div>
      )
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        <SandboxBadge sandbox={sandbox} />
        {activePerms.map(([key]) => {
          const meta = PERMISSION_META[key]
          if (!meta) return null
          const Icon = meta.icon
          return (
            <Badge key={key} variant="secondary">
              <Icon className="size-3.5" />
              {meta.label}
            </Badge>
          )
        })}
      </div>
    )
  }

  if (sandbox === 'host') {
    return (
      <p className="flex items-center gap-2 text-amber-600 text-sm dark:text-amber-400">
        <ShieldAlertIcon className="size-4 shrink-0" />
        Runs with full system access
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {activePerms.length > 0 ? (
        <div className="flex flex-col">
          {activePerms.map(([key, value]) => (
            <PermissionRow key={key} permKey={key} value={value} />
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-emerald-600 text-sm dark:text-emerald-400">
          <ShieldCheckIcon className="size-4 shrink-0" />
          No special permissions required
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// aggregatePermissions utility
// ---------------------------------------------------------------------------

interface ToolLike {
  permissions?: ToolPermissions
}

function mergeArrays(existing: string[] | undefined, incoming: string[] | undefined): string[] {
  if (!incoming?.length) return existing ?? []
  return [...new Set([...(existing ?? []), ...incoming])]
}

export function aggregatePermissions(tools: ToolLike[]): ToolPermissions {
  const result: ToolPermissions = {}
  for (const tool of tools) {
    const p = tool.permissions
    if (!p) continue
    if (p.time) result.time = true
    if (p.random) result.random = true
    const net = mergeArrays(result.network, p.network)
    if (net.length) result.network = net
    const env = mergeArrays(result.env, p.env)
    if (env.length) result.env = env
    const fs = mergeArrays(result.fs, p.fs)
    if (fs.length) result.fs = fs
  }
  return result
}
