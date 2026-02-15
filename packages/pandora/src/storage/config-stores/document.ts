import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import type { Collection } from 'mongodb'
import type { Config, ConfigStore } from '../config-store'

const CONFIG_ID = 'main'

/** Document shape stored in MongoDB */
interface ConfigDocument {
  _id: string
  value: Config
  updatedAt: Date
}

/**
 * MongoDB config store
 */
export class MongoDBConfigStore implements ConfigStore {
  constructor(private getCollection: () => Promise<Collection<ConfigDocument>>) {}

  async get(): Promise<Config | null> {
    try {
      const collection = await this.getCollection()
      const doc = await collection.findOne({ _id: CONFIG_ID })
      return doc?.value ?? null
    } catch {
      // Collection might not exist yet
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

/**
 * DynamoDB config store
 */
export class DynamoDBConfigStore implements ConfigStore {
  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string,
  ) {}

  async get(): Promise<Config | null> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: 'PANDORA_CONFIG', SK: 'main' },
        }),
      )
      if (!result.Item) return null
      return JSON.parse(result.Item.value as string) as Config
    } catch {
      // Table or item might not exist yet
      return null
    }
  }

  async set(config: Config): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: 'PANDORA_CONFIG',
          SK: 'main',
          value: JSON.stringify(config),
          updatedAt: new Date().toISOString(),
        },
      }),
    )
  }

  async delete(): Promise<void> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: 'PANDORA_CONFIG', SK: 'main' },
        }),
      )
    } catch {
      // Table or item might not exist
    }
  }
}
