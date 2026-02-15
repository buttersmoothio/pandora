import { MongoDBStore } from '@mastra/mongodb'
import type { Config, ConfigStore, StorageFactory } from '@pandora/core/storage'
import type { Collection } from 'mongodb'
import { MongoClient } from 'mongodb'

const CONFIG_COLLECTION = 'pandora_config'
const CONFIG_ID = 'main'

interface ConfigDocument {
  _id: string
  value: unknown
  updatedAt: Date
}

class MongoDBConfigStore implements ConfigStore<Config> {
  constructor(private getCollection: () => Promise<Collection<ConfigDocument>>) {}

  async get(): Promise<Config | null> {
    try {
      const collection = await this.getCollection()
      const doc = await collection.findOne({ _id: CONFIG_ID })
      return (doc?.value as Config) ?? null
    } catch {
      return null
    }
  }

  async set(config: Config): Promise<void> {
    const collection = await this.getCollection()
    await collection.updateOne(
      { _id: CONFIG_ID },
      { $set: { value: config, updatedAt: new Date() } },
      { upsert: true },
    )
  }

  async delete(): Promise<void> {
    try {
      const collection = await this.getCollection()
      await collection.deleteOne({ _id: CONFIG_ID })
    } catch {
      // Collection might not exist
    }
  }
}

export const createStorage: StorageFactory = async (env) => {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required for MongoDB storage')
  }

  const dbName = env.MONGODB_DB_NAME ?? 'pandora'

  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(dbName)

  const mastra = new MongoDBStore({
    id: 'pandora-mongodb',
    connectorHandler: {
      getCollection: async (collectionName: string) => db.collection(collectionName),
      close: async () => {
        await client.close()
      },
    },
  })

  const config = new MongoDBConfigStore(async () =>
    db.collection<ConfigDocument>(CONFIG_COLLECTION),
  )

  return { mastra, config }
}
