import type { ScheduledTask } from '../config'
import { CronerScheduler } from './providers/croner'

export type { ScheduledTask }

export type TaskHandler = (task: ScheduledTask) => Promise<void>

export interface Scheduler {
  /** Replace all running jobs with the given task list */
  sync(tasks: ScheduledTask[], timezone?: string): void
  /** Stop all jobs and clean up */
  stop(): void
  /** Next run time for a task (null if not scheduled) */
  nextRun(taskId: string): Date | null
  /** Whether a task's handler is currently executing */
  isRunning(taskId: string): boolean
}

export function createScheduler(
  handler: TaskHandler,
  onComplete?: (taskId: string) => void,
  timezone?: string,
): Scheduler {
  return new CronerScheduler(handler, onComplete, timezone)
}
