import type { RecordResponse } from '../api-types'
import type { FetchContext } from './fetch-wrapper'
import { fetchJson } from './fetch-wrapper'

/**
 * Memory client — read and update working memory and observational memory.
 *
 * Access via `client.memory`.
 */
export interface MemoryClient {
  /** Get the current working memory content. */
  getWorkingMemory(): Promise<{ content: string }>

  /**
   * Replace the working memory content.
   * @param content - New working memory content string.
   * @returns The updated content.
   */
  updateWorkingMemory(content: string): Promise<{ content: string }>

  /**
   * Get observational memory observations.
   * @returns Observations, or `null` if observational memory is not configured.
   */
  getObservations(): Promise<{ observations: unknown | null }>

  /**
   * Get the full observational memory record with metadata and thresholds.
   * @returns Record and thresholds, or `null` values if OM is not configured.
   */
  getRecord(): Promise<RecordResponse>
}

/** @internal */
export function createMemoryClient(ctx: FetchContext): MemoryClient {
  return {
    getWorkingMemory(): Promise<{ content: string }> {
      return fetchJson(ctx, '/api/memory/working')
    },
    updateWorkingMemory(content: string): Promise<{ content: string }> {
      return fetchJson(ctx, '/api/memory/working', {
        method: 'PUT',
        body: JSON.stringify({ content }),
      })
    },
    getObservations(): Promise<{ observations: unknown | null }> {
      return fetchJson(ctx, '/api/memory/observations')
    },
    getRecord(): Promise<RecordResponse> {
      return fetchJson(ctx, '/api/memory/record')
    },
  }
}
