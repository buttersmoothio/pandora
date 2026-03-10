'use client'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useConfig, useUpdateConfig } from '@/hooks/use-config'

export function MasterToggle() {
  const { data: config } = useConfig()
  const updateConfig = useUpdateConfig()
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
            disabled={updateConfig.isPending}
            onCheckedChange={(checked) =>
              updateConfig.mutate({
                schedule: { enabled: checked, tasks: config?.schedule.tasks ?? [] },
              })
            }
          />
        </div>
      </CardHeader>
    </Card>
  )
}
