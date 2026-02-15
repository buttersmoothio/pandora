import { UpstashStore } from '@mastra/upstash'
import { Redis } from '@upstash/redis'
import { RedisConfigStore } from '../config-store'
import type { StorageResult } from '../index'

/**
 * Upstash Redis storage provider with shared client.
 *
 * Requires: bun add @mastra/upstash @upstash/redis
 *
 * Environment variables:
 * - UPSTASH_URL: Upstash Redis URL
 * - UPSTASH_TOKEN: Upstash auth token
 */
export async function createUpstashStorage(
  env: Record<string, string | undefined>,
): Promise<StorageResult> {
  if (!env.UPSTASH_URL) {
    throw new Error('UPSTASH_URL is required for Upstash storage')
  }
  if (!env.UPSTASH_TOKEN) {
    throw new Error('UPSTASH_TOKEN is required for Upstash storage')
  }

  // Create shared Redis client for both Mastra and Pandora config
  const redis = new Redis({
    url: env.UPSTASH_URL,
    token: env.UPSTASH_TOKEN,
  })

  // Mastra storage uses the shared client
  const mastra = new UpstashStore({
    id: 'pandora-upstash',
    client: redis,
  })

  // Pandora config uses the same client
  const config = new RedisConfigStore(redis)

  return { mastra, config }
}
