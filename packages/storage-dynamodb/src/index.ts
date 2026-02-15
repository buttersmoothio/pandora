import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb'
import { DynamoDBStore } from '@mastra/dynamodb'
import type { Config, ConfigStore, StorageFactory } from '@pandora/core/storage'

class DynamoDBConfigStore implements ConfigStore<Config> {
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

export const createStorage: StorageFactory = async (env) => {
  const tableName = env.DYNAMODB_TABLE_NAME ?? 'pandora'

  const dynamoClient = new DynamoDBClient({
    region: env.AWS_REGION,
    credentials:
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  })

  const client = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: { removeUndefinedValues: true },
  })

  const mastra = new DynamoDBStore({
    name: 'pandora-dynamodb',
    config: {
      id: 'pandora-dynamodb',
      client,
      tableName,
    },
  })

  const config = new DynamoDBConfigStore(client, tableName)

  return { mastra, config }
}
