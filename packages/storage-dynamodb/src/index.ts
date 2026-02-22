import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { DynamoDBStore } from '@mastra/dynamodb'
import type {
  AuthStore,
  Config,
  ConfigStore,
  PasswordCredential,
  RefreshToken,
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
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: 'PANDORA_CONFIG', SK: 'main' },
      }),
    )
    if (!result.Item) return null
    return JSON.parse(result.Item.value as string) as Config
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

  async setCredentialIfNotExists(credential: PasswordCredential): Promise<boolean> {
    try {
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
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
      return true
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return false
      }
      throw err
    }
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
  }

  async createRefreshToken(token: RefreshToken): Promise<void> {
    const ttl = Math.floor(new Date(token.expiresAt).getTime() / 1000)
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: 'PANDORA_AUTH',
          SK: `refresh#${token.tokenHash}`,
          sessionHash: token.sessionHash,
          expiresAt: token.expiresAt,
          createdAt: token.createdAt,
          userAgent: token.userAgent,
          ip: token.ip,
          used: token.used,
          ttl,
        },
      }),
    )
  }

  async getRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: 'PANDORA_AUTH', SK: `refresh#${tokenHash}` },
      }),
    )
    if (!result.Item) return null

    if (new Date(result.Item.expiresAt as string) <= new Date()) {
      await this.deleteRefreshToken(tokenHash)
      return null
    }

    return {
      tokenHash,
      sessionHash: result.Item.sessionHash as string,
      expiresAt: result.Item.expiresAt as string,
      createdAt: result.Item.createdAt as string,
      userAgent: (result.Item.userAgent as string) ?? undefined,
      ip: (result.Item.ip as string) ?? undefined,
      used: (result.Item.used as boolean) ?? false,
    }
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: 'PANDORA_AUTH', SK: `refresh#${tokenHash}` },
      }),
    )
  }

  async deleteAllRefreshTokens(): Promise<void> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': 'PANDORA_AUTH', ':prefix': 'refresh#' },
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

  async markRefreshTokenUsed(tokenHash: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: 'PANDORA_AUTH', SK: `refresh#${tokenHash}` },
        UpdateExpression: 'SET used = :used',
        ExpressionAttributeValues: { ':used': true },
      }),
    )
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

  return {
    mastra,
    config,
    auth,
    close: async () => {
      dynamoClient.destroy()
    },
  }
}

export default {
  id: 'storage-dynamodb',
  name: 'DynamoDB',
  schemaVersion: 1,
  envVars: ['AWS_REGION'],
  factory: createStorage,
} satisfies StoragePlugin
