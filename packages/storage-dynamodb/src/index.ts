import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import { DynamoDBStore } from '@mastra/dynamodb'
import type {
  AuthStore,
  Config,
  ConfigStore,
  PasswordCredential,
  Session,
  StorageFactory,
  StoragePlugin,
} from '@pandora/core/storage'

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

class DynamoDBAuthStore implements AuthStore {
  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string,
  ) {}

  async init(): Promise<void> {
    // DynamoDB tables are created externally (via CloudFormation, CDK, etc.)
  }

  async getCredential(): Promise<PasswordCredential | null> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: 'PANDORA_AUTH', SK: 'credential' },
        }),
      )
      if (!result.Item) return null
      return {
        hash: result.Item.hash as string,
        salt: result.Item.salt as string,
        iterations: result.Item.iterations as number,
        createdAt: result.Item.createdAt as string,
      }
    } catch {
      return null
    }
  }

  async setCredential(credential: PasswordCredential): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: 'PANDORA_AUTH',
          SK: 'credential',
          hash: credential.hash,
          salt: credential.salt,
          iterations: credential.iterations,
          createdAt: credential.createdAt,
        },
      }),
    )
  }

  async createSession(session: Session): Promise<void> {
    const ttl = Math.floor(new Date(session.expiresAt).getTime() / 1000)
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: 'PANDORA_AUTH',
          SK: `session#${session.tokenHash}`,
          expiresAt: session.expiresAt,
          createdAt: session.createdAt,
          userAgent: session.userAgent,
          ip: session.ip,
          ttl,
        },
      }),
    )
  }

  async getSession(tokenHash: string): Promise<Session | null> {
    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: 'PANDORA_AUTH', SK: `session#${tokenHash}` },
        }),
      )
      if (!result.Item) return null

      // Check expiration (TTL may not have cleaned it up yet)
      if (new Date(result.Item.expiresAt as string) <= new Date()) {
        await this.deleteSession(tokenHash)
        return null
      }

      return {
        tokenHash,
        expiresAt: result.Item.expiresAt as string,
        createdAt: result.Item.createdAt as string,
        userAgent: (result.Item.userAgent as string) ?? undefined,
        ip: (result.Item.ip as string) ?? undefined,
      }
    } catch {
      return null
    }
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: 'PANDORA_AUTH', SK: `session#${tokenHash}` },
      }),
    )
  }

  async deleteAllSessions(): Promise<void> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': 'PANDORA_AUTH', ':prefix': 'session#' },
      }),
    )
    if (result.Items) {
      for (const item of result.Items) {
        await this.client.send(
          new DeleteCommand({
            TableName: this.tableName,
            Key: { PK: item.PK, SK: item.SK },
          }),
        )
      }
    }
  }

  async listSessions(): Promise<Session[]> {
    try {
      const now = new Date().toISOString()
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          FilterExpression: 'expiresAt > :now',
          ExpressionAttributeValues: { ':pk': 'PANDORA_AUTH', ':prefix': 'session#', ':now': now },
        }),
      )
      return (result.Items ?? []).map((item) => ({
        tokenHash: (item.SK as string).replace('session#', ''),
        expiresAt: item.expiresAt as string,
        createdAt: item.createdAt as string,
        userAgent: (item.userAgent as string) ?? undefined,
        ip: (item.ip as string) ?? undefined,
      }))
    } catch {
      return []
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
  const auth = new DynamoDBAuthStore(client, tableName)

  return { mastra, config, auth }
}

export default {
  id: 'storage-dynamodb',
  schemaVersion: 1,
  factory: createStorage,
} satisfies StoragePlugin
