import type { EnvVarDescriptor } from '@/hooks/use-channels'

export function EnvVarWarning({ envVars }: { envVars: EnvVarDescriptor[] }) {
  const required = envVars.filter((v) => v.required !== false)
  const optional = envVars.filter((v) => v.required === false)
  return (
    <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm">
      <p className="font-medium text-yellow-600 dark:text-yellow-400">
        Missing environment variables
      </p>
      <p className="mt-1 text-muted-foreground">Add the following to your environment:</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {required.map((v) => (
          <code key={v.name} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {v.name}
          </code>
        ))}
      </div>
      {optional.length > 0 && (
        <div className="mt-2">
          <p className="text-muted-foreground text-xs">Optional:</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {optional.map((v) => (
              <code
                key={v.name}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs opacity-60"
              >
                {v.name}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
