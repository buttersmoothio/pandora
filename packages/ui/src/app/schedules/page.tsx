'use client'

import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { HeartbeatCard } from '@/components/schedules/heartbeat-card'
import { MasterToggle } from '@/components/schedules/master-toggle'
import { TaskDialog } from '@/components/schedules/task-dialog'
import { TaskList } from '@/components/schedules/task-list'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/hooks/use-config'

export default function SchedulesPage(): React.JSX.Element {
  const [createOpen, setCreateOpen] = useState(false)
  const { data: config } = useConfig()
  const schedulingEnabled = config?.schedule.enabled ?? false

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 p-6">
      <div className="flex items-center justify-between">
        <h1 className="display-heading-medium font-display text-2xl">Schedules</h1>
        <Button size="sm" onClick={(): void => setCreateOpen(true)}>
          <PlusIcon className="mr-1 size-4" />
          New Schedule
        </Button>
      </div>

      <MasterToggle />

      {schedulingEnabled && <HeartbeatCard />}

      <div>
        <h2 className="display-heading-medium font-display text-base">Scheduled Tasks</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Tasks that run automatically on a schedule. Recurring tasks use cron expressions; one-time
          tasks run at a specific date and time.
        </p>
        <div className="mt-4">
          <TaskList />
        </div>
      </div>

      <TaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
