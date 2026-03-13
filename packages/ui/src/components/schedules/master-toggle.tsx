'use client'

import { useConfig } from '@pandorakit/react-sdk'
import { toast } from 'sonner'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

export function MasterToggle(): React.JSX.Element {
  const { data: config, update, isUpdating } = useConfig()
  const enabled = config?.schedule.enabled ?? false

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Scheduling</CardTitle>
            <CardDescription>
              {enabled
                ? 'Scheduled tasks are active and will run on their configured schedule.'
                : 'Scheduling is disabled. Tasks will not run until enabled.'}
            </CardDescription>
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
      </CardHeader>
    </Card>
  )
}
