import { Cron } from 'croner'
import type { ScheduledTask } from '../../config'
import { getLogger } from '../../logger'
import type { Scheduler, TaskHandler } from '../index'

export class CronerScheduler implements Scheduler {
  private jobs = new Map<string, Cron>()
  private running = new Set<string>()
  private timezone: string

  constructor(
    private handler: TaskHandler,
    private onComplete?: (taskId: string) => void,
    timezone = 'UTC',
  ) {
    this.timezone = timezone
  }

  sync(tasks: ScheduledTask[]): void {
    for (const job of this.jobs.values()) job.stop()
    this.jobs.clear()

    for (const task of tasks) {
      if (task.enabled) this.scheduleTask(task)
    }
  }

  private scheduleTask(task: ScheduledTask): void {
    const log = getLogger()
    const schedule = task.runAt ? new Date(task.runAt) : task.cron
    if (!schedule) return

    try {
      let runs = 0
      const job = new Cron(
        schedule,
        { timezone: this.timezone, protect: true, maxRuns: task.maxRuns },
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

          if (task.runAt || (task.maxRuns && runs >= task.maxRuns)) {
            this.onComplete?.(task.id)
          }
        },
      )
      this.jobs.set(task.id, job)
      log.info(`Scheduled task "${task.name}"`, {
        taskId: task.id,
        ...(task.cron ? { cron: task.cron } : { runAt: task.runAt }),
        nextRun: job.nextRun()?.toISOString(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error(`Invalid schedule for task "${task.name}"`, {
        taskId: task.id,
        ...(task.cron ? { cron: task.cron } : { runAt: task.runAt }),
        error: message,
      })
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
