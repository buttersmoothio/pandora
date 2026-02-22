import { MSSQLStore } from '@mastra/mssql'
import type { Config, StorageFactory, StoragePlugin } from '@pandora/core/storage'
import { SQLAuthStore, SQLConfigStore } from '@pandora/core/storage'
import sql from 'mssql'

export const createStorage: StorageFactory = async (env) => {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for MSSQL storage')
  }

  const pool = new sql.ConnectionPool(env.DATABASE_URL)
  await pool.connect()

  const mastra = new MSSQLStore({
    id: 'pandora-mssql',
    pool,
  })

  const executeMssql = async (query: string, params?: unknown[]) => {
    const request = pool.request()
    if (params) {
      for (let i = 0; i < params.length; i++) {
        request.input(`p${i + 1}`, params[i])
      }
    }
    const result = await request.query(query)
    return result.recordset
  }

  const config = new SQLConfigStore<Config>(executeMssql, 'mssql')
  const auth = new SQLAuthStore(executeMssql, 'mssql')

  return { mastra, config, auth, close: () => pool.close() }
}

export default {
  id: 'storage-mssql',
  name: 'MSSQL',
  schemaVersion: 1,
  envVars: ['DATABASE_URL'],
  factory: createStorage,
} satisfies StoragePlugin
