import { MongoDBStore } from '@mastra/mongodb'
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
import type { Collection } from 'mongodb'
import { MongoClient } from 'mongodb'

const CONFIG_COLLECTION = 'pandora_config'
const CONFIG_ID = 'main'
const AUTH_CREDENTIALS_COLLECTION = 'pandora_auth_credentials'
const AUTH_SESSIONS_COLLECTION = 'pandora_auth_sessions'
const AUTH_REFRESH_TOKENS_COLLECTION = 'pandora_auth_refresh_tokens'
const OWNER_KEY = 'owner'

interface ConfigDocument {
  _id: string
  value: unknown
  updatedAt: Date
}

class MongoDBConfigStore implements ConfigStore<Config> {
  constructor(private getCollection: () => Promise<Collection<ConfigDocument>>) {}

  async get(): Promise<Config | null> {
    const collection = await this.getCollection()
    const doc = await collection.findOne({ _id: CONFIG_ID })
    return (doc?.value as Config) ?? null
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

interface CredentialDocument {
  _id: string
  hash: string
  salt: string
  iterations: number
  createdAt: string
}

interface SessionDocument {
  _id: string
  expiresAt: Date
  createdAt: string
  userAgent?: string
  ip?: string
}

interface RefreshTokenDocument {
  _id: string
  sessionHash: string
  expiresAt: Date
  createdAt: string
  userAgent?: string
  ip?: string
  used: boolean
}

class MongoDBAuthStore implements AuthStore {
  constructor(
    private getCredentials: () => Promise<Collection<CredentialDocument>>,
    private getSessions: () => Promise<Collection<SessionDocument>>,
    private getRefreshTokens: () => Promise<Collection<RefreshTokenDocument>>,
  ) {}

  async init(): Promise<void> {
    const sessions = await this.getSessions()
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  }

  async getCredential(): Promise<PasswordCredential | null> {
    const col = await this.getCredentials()
    const doc = await col.findOne({ _id: OWNER_KEY })
    if (!doc) return null
    return {
      hash: doc.hash,
      salt: doc.salt,
      iterations: doc.iterations,
      createdAt: doc.createdAt,
    }
  }

  async setCredential(credential: PasswordCredential): Promise<void> {
    const col = await this.getCredentials()
    await col.updateOne(
      { _id: OWNER_KEY },
      {
        $set: {
          hash: credential.hash,
          salt: credential.salt,
          iterations: credential.iterations,
          createdAt: credential.createdAt,
        },
      },
      { upsert: true },
    )
  }

  async setCredentialIfNotExists(credential: PasswordCredential): Promise<boolean> {
    const col = await this.getCredentials()
    const existing = await col.findOne({ _id: OWNER_KEY })
    if (existing) return false
    await col.insertOne({
      _id: OWNER_KEY,
      hash: credential.hash,
      salt: credential.salt,
      iterations: credential.iterations,
      createdAt: credential.createdAt,
    })
    return true
  }

  async createSession(session: Session): Promise<void> {
    const col = await this.getSessions()
    await col.insertOne({
      _id: session.tokenHash,
      expiresAt: new Date(session.expiresAt),
      createdAt: session.createdAt,
      userAgent: session.userAgent,
      ip: session.ip,
    })
  }

  async getSession(tokenHash: string): Promise<Session | null> {
    const col = await this.getSessions()
    const doc = await col.findOne({ _id: tokenHash, expiresAt: { $gt: new Date() } })
    if (!doc) return null
    return {
      tokenHash: doc._id,
      expiresAt: doc.expiresAt.toISOString(),
      createdAt: doc.createdAt,
      userAgent: doc.userAgent,
      ip: doc.ip,
    }
  }

  async deleteSession(tokenHash: string): Promise<void> {
    const col = await this.getSessions()
    await col.deleteOne({ _id: tokenHash })
  }

  async deleteAllSessions(): Promise<void> {
    const col = await this.getSessions()
    await col.deleteMany({})
  }

  async listSessions(): Promise<Session[]> {
    const col = await this.getSessions()
    const docs = await col.find({ expiresAt: { $gt: new Date() } }).toArray()
    return docs.map((doc) => ({
      tokenHash: doc._id,
      expiresAt: doc.expiresAt.toISOString(),
      createdAt: doc.createdAt,
      userAgent: doc.userAgent,
      ip: doc.ip,
    }))
  }

  async createRefreshToken(token: RefreshToken): Promise<void> {
    const col = await this.getRefreshTokens()
    await col.insertOne({
      _id: token.tokenHash,
      sessionHash: token.sessionHash,
      expiresAt: new Date(token.expiresAt),
      createdAt: token.createdAt,
      userAgent: token.userAgent,
      ip: token.ip,
      used: token.used,
    })
  }

  async getRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    const col = await this.getRefreshTokens()
    const doc = await col.findOne({ _id: tokenHash, expiresAt: { $gt: new Date() } })
    if (!doc) return null
    return {
      tokenHash: doc._id,
      sessionHash: doc.sessionHash,
      expiresAt: doc.expiresAt.toISOString(),
      createdAt: doc.createdAt,
      userAgent: doc.userAgent,
      ip: doc.ip,
      used: doc.used,
    }
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    const col = await this.getRefreshTokens()
    await col.deleteOne({ _id: tokenHash })
  }

  async deleteAllRefreshTokens(): Promise<void> {
    const col = await this.getRefreshTokens()
    await col.deleteMany({})
  }

  async markRefreshTokenUsed(tokenHash: string): Promise<void> {
    const col = await this.getRefreshTokens()
    await col.updateOne({ _id: tokenHash }, { $set: { used: true } })
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

  const auth = new MongoDBAuthStore(
    async () => db.collection<CredentialDocument>(AUTH_CREDENTIALS_COLLECTION),
    async () => db.collection<SessionDocument>(AUTH_SESSIONS_COLLECTION),
    async () => db.collection<RefreshTokenDocument>(AUTH_REFRESH_TOKENS_COLLECTION),
  )

  return { mastra, config, auth, close: () => client.close() }
}

export default {
  id: 'storage-mongodb',
  schemaVersion: 1,
  factory: createStorage,
} satisfies StoragePlugin
