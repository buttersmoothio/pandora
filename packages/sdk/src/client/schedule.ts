import type {
  CreateScheduleInput,
  HeartbeatConfig,
  ScheduleTask,
  UpdateScheduleInput,
} from '../api-types'
import type { FetchContext } from './fetch-wrapper'
import { fetchJson } from './fetch-wrapper'

/**
 * Schedule client — manage scheduled tasks and the heartbeat.
 *
 * Access via `client.schedule`.
 */
export interface ScheduleClient {
  /** List available notification destinations (e.g. `"Web Inbox"`, channel names). */
  destinations(): Promise<{ data: string[] }>

  /** List all scheduled tasks with their enabled/running status. */
  list(): Promise<{
    data: ScheduleTask[]
    total: number
    page: number
    perPage: number | false
    hasMore: boolean
    enabled: boolean
  }>

  /**
   * Get a single scheduled task.
   * @param id - Task ID.
   * @throws {@link PandoraApiError} with status `404` if not found.
   */
  get(id: string): Promise<ScheduleTask>

  /**
   * Create a new scheduled task.
   * @param input - Task definition. Provide either `cron` or `runAt` (mutually exclusive).
   * @throws {@link PandoraApiError} with status `400` on validation errors.
   */
  create(input: CreateScheduleInput): Promise<ScheduleTask>

  /**
   * Update an existing scheduled task.
   * @param id - Task ID.
   * @param patch - Fields to update. Set optional fields to `null` to clear them.
   * @throws {@link PandoraApiError} with status `404` if not found.
   */
  update(id: string, patch: UpdateScheduleInput): Promise<ScheduleTask>

  /**
   * Delete a scheduled task.
   * @param id - Task ID.
   * @throws {@link PandoraApiError} with status `404` if not found.
   */
  delete(id: string): Promise<{ id: string }>

  /** Get the heartbeat configuration. */
  heartbeat(): Promise<HeartbeatConfig>

  /**
   * Update the heartbeat configuration.
   * @param patch - Fields to update.
   */
  updateHeartbeat(patch: Partial<HeartbeatConfig>): Promise<HeartbeatConfig>
}

/** @internal */
export function createScheduleClient(ctx: FetchContext): ScheduleClient {
  return {
    destinations(): Promise<{ data: string[] }> {
      return fetchJson(ctx, '/api/schedule/destinations')
    },
    list(): Promise<{
      data: ScheduleTask[]
      total: number
      page: number
      perPage: number | false
      hasMore: boolean
      enabled: boolean
    }> {
      return fetchJson(ctx, '/api/schedule')
    },
    get(id: string): Promise<ScheduleTask> {
      return fetchJson(ctx, `/api/schedule/${id}`)
    },
    create(input: CreateScheduleInput): Promise<ScheduleTask> {
      return fetchJson(ctx, '/api/schedule', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    update(id: string, patch: UpdateScheduleInput): Promise<ScheduleTask> {
      return fetchJson(ctx, `/api/schedule/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
    delete(id: string): Promise<{ id: string }> {
      return fetchJson(ctx, `/api/schedule/${id}`, { method: 'DELETE' })
    },
    heartbeat(): Promise<HeartbeatConfig> {
      return fetchJson(ctx, '/api/schedule/heartbeat')
    },
    updateHeartbeat(patch: Partial<HeartbeatConfig>): Promise<HeartbeatConfig> {
      return fetchJson(ctx, '/api/schedule/heartbeat', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
  }
}
