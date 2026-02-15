import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DynamoDBStore } from '@mastra/dynamodb'
import { DynamoDBConfigStore } from '../config-store'
import type { StorageResult } from '../index'

/**
 * DynamoDB storage provider with shared client.
 *
 * Requires: bun add @mastra/dynamodb @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
 *
 * Environment variables:
 * - DYNAMODB_TABLE_NAME: DynamoDB table name (defaults to 'pandora')
 * - AWS_REGION: AWS region
 * - AWS_ACCESS_KEY_ID: AWS access key (optional, uses default credentials if not set)
 * - AWS_SECRET_ACCESS_KEY: AWS secret key (optional)
 */
export async function createDynamoDBStorage(
  env: Record<string, string | undefined>,
): Promise<StorageResult> {
  const tableName = env.DYNAMODB_TABLE_NAME ?? 'pandora'

  // Create shared DynamoDB client
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

  // Mastra storage uses the shared client
  const mastra = new DynamoDBStore({
    name: 'pandora-dynamodb',
    config: {
      id: 'pandora-dynamodb',
      client,
      tableName,
    },
  })

  // Pandora config uses the same client
  const config = new DynamoDBConfigStore(client, tableName)

  return { mastra, config }
}
