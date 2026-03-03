import { Cron } from 'croner'
import type { ScheduledTask } from '../../config'
import { getLogger } from '../../logger'
import type { Scheduler, TaskHandler } from '../index'

export class CronerScheduler implements Scheduler {
  private jobs = new Map<string, Cron>()
  private running = new Set<string>()

  constructor(
    private handler: TaskHandler,
    private onComplete?: (taskId: string) => void,
  ) {}

  sync(tasks: ScheduledTask[]): void {
    const log = getLogger()

    // Stop all existing jobs
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()

    // Create new jobs for enabled tasks
    for (const task of tasks) {
      if (!task.enabled) continue

      try {
        let runs = 0
        const job = new Cron(
          task.cron,
          {
            timezone: task.timezone,
            protect: true,
            maxRuns: task.maxRuns,
          },
          async () => {
            runs++
            this.running.add(task.id)
            try {
              await this.handler(task)
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error'
              log.error(`Scheduled task "${task.name}" failed`, { taskId: task.id, error: message })
            } finally {
              this.running.delete(task.id)
            }

            // If maxRuns exhausted, notify for auto-disable
            if (task.maxRuns && runs >= task.maxRuns) {
              this.onComplete?.(task.id)
            }
          },
        )
        this.jobs.set(task.id, job)
        log.info(`Scheduled task "${task.name}"`, {
          taskId: task.id,
          cron: task.cron,
          nextRun: job.nextRun()?.toISOString(),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        log.error(`Invalid cron for task "${task.name}"`, {
          taskId: task.id,
          cron: task.cron,
          error: message,
        })
      }
    }
  }

  stop(): void {
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()
  }

  nextRun(taskId: string): Date | null {
    const job = this.jobs.get(taskId)
    return job?.nextRun() ?? null
  }

  isRunning(taskId: string): boolean {
    return this.running.has(taskId)
  }
}
