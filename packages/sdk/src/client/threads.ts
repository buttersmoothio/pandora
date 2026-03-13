import type { ThreadDetailResponse, ThreadForkResponse, ThreadListResponse } from '../api-types'
import type { FetchContext } from './fetch-wrapper'
import { fetchJson } from './fetch-wrapper'

/**
 * Threads client — list, read, fork, and delete conversation threads.
 *
 * Access via `client.threads`.
 */
export interface ThreadsClient {
  /** List all threads with branch info and active stream status. */
  list(): Promise<ThreadListResponse>

  /**
   * Get a thread with its full message history and fork info.
   * @param id - Thread ID.
   * @throws {@link PandoraApiError} with status `404` if not found.
   */
  get(id: string): Promise<ThreadDetailResponse>

  /**
   * Fork a thread at a specific message, creating a new branch.
   * @param id - Source thread ID.
   * @param messageId - Message ID at which to fork.
   * @returns The new fork thread and the number of cloned messages.
   * @throws {@link PandoraApiError} with status `404` if the message is not found.
   */
  fork(id: string, messageId: string): Promise<ThreadForkResponse>

  /**
   * Delete a thread and all its messages.
   * @param id - Thread ID.
   * @throws {@link PandoraApiError} with status `404` if not found.
   */
  delete(id: string): Promise<{ success: true }>
}

/** @internal */
export function createThreadsClient(ctx: FetchContext): ThreadsClient {
  return {
    list(): Promise<ThreadListResponse> {
      return fetchJson(ctx, '/api/threads')
    },
    get(id: string): Promise<ThreadDetailResponse> {
      return fetchJson(ctx, `/api/threads/${id}`)
    },
    fork(id: string, messageId: string): Promise<ThreadForkResponse> {
      return fetchJson(ctx, `/api/threads/${id}/fork`, {
        method: 'POST',
        body: JSON.stringify({ messageId }),
      })
    },
    delete(id: string): Promise<{ success: true }> {
      return fetchJson(ctx, `/api/threads/${id}`, { method: 'DELETE' })
    },
  }
}
