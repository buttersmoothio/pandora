import { MSSQLStore } from '@mastra/mssql'
import type { Config, StorageFactory } from '@pandora/core/storage'
import { SQLConfigStore } from '@pandora/core/storage'
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

  const config = new SQLConfigStore<Config>(async (query, params) => {
    const request = pool.request()
    if (params) {
      for (let i = 0; i < params.length; i++) {
        request.input(`p${i + 1}`, params[i])
      }
    }
    const result = await request.query(query)
    return result.recordset
  }, 'mssql')

  return { mastra, config }
}
