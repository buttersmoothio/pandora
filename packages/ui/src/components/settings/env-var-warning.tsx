import type { EnvVarDescriptor as BaseEnvVarDescriptor } from '@pandorakit/react-sdk'
import { CheckCircle2Icon, CircleDotIcon, XCircleIcon } from 'lucide-react'

type EnvVarDescriptor = BaseEnvVarDescriptor & { configured?: boolean }

function EnvVarRow({ v }: { v: EnvVarDescriptor }): React.JSX.Element {
  const isOptional = v.required === false

  if (v.configured) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" />
        <code className="font-mono text-sm">{v.name}</code>
        {isOptional && <span className="text-muted-foreground text-xs">optional</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-0.5">
      {isOptional ? (
        <CircleDotIcon className="size-4 shrink-0 text-muted-foreground/40" />
      ) : (
        <XCircleIcon className="size-4 shrink-0 text-destructive" />
      )}
      <code className="font-mono text-muted-foreground text-sm">{v.name}</code>
      {isOptional && <span className="text-muted-foreground text-xs">optional</span>}
    </div>
  )
}

export function EnvVarOverview({
  envVars,
}: {
  envVars: EnvVarDescriptor[]
}): React.JSX.Element | null {
  if (envVars.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col">
      {envVars.map((v) => (
        <EnvVarRow key={v.name} v={v} />
      ))}
    </div>
  )
}
