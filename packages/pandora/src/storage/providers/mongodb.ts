import { MongoDBStore } from '@mastra/mongodb'
import { MongoClient } from 'mongodb'
import type { Config } from '../../config'
import { MongoDBConfigStore } from '../config-store'
import type { StorageResult } from '../index'

const CONFIG_COLLECTION = 'pandora_config'

/**
 * MongoDB storage provider with shared client.
 *
 * Requires: bun add @mastra/mongodb mongodb
 *
 * Environment variables:
 * - MONGODB_URI: MongoDB connection URI
 * - MONGODB_DB_NAME: Database name (defaults to 'pandora')
 */
export async function createMongoDBStorage(
  env: Record<string, string | undefined>,
): Promise<StorageResult> {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required for MongoDB storage')
  }

  const dbName = env.MONGODB_DB_NAME ?? 'pandora'

  // Create shared MongoDB client
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(dbName)

  // Mastra storage - uses connectorHandler for custom connection management
  const mastra = new MongoDBStore({
    id: 'pandora-mongodb',
    connectorHandler: {
      getCollection: async (collectionName: string) => db.collection(collectionName),
      close: async () => {
        await client.close()
      },
    },
  })

  // Pandora config uses the same client
  const config = new MongoDBConfigStore(async () =>
    db.collection<{ _id: string; value: Config; updatedAt: Date }>(CONFIG_COLLECTION),
  )

  return { mastra, config }
}
