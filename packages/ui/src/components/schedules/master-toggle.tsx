'use client'

import { useConfig } from '@pandorakit/react-sdk'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'

export function MasterToggle(): React.JSX.Element {
  const { data: config, update, isUpdating } = useConfig()
  const enabled = config?.schedule.enabled ?? false

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="display-heading-medium font-display text-base">Scheduling</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {enabled
              ? 'Scheduled tasks are active and will run on their configured schedule.'
              : 'Scheduling is disabled. Tasks will not run until enabled.'}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={isUpdating}
          onCheckedChange={(checked: boolean): void => {
            update({
              schedule: { enabled: checked, tasks: config?.schedule.tasks ?? [] },
            }).catch((err: Error) => toast.error(`Failed to update config: ${err.message}`))
          }}
        />
      </div>
    </div>
  )
}
