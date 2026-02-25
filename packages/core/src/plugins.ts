import telegram from '@pandora/channel-telegram'
import libsql from '@pandora/storage-libsql'
import datetime from '@pandora/tools-datetime'
import vectorLibsql from '@pandora/vector-libsql'
import { registerChannelPlugin } from './channels'
import { registerStoragePlugin } from './storage'
import { registerToolPlugin } from './tools'
import { registerVectorPlugin } from './vector'

// Agent plugins: import { registerAgentPlugin } from './agents'
// registerAgentPlugin(myAgentPlugin)

registerStoragePlugin(libsql)
registerVectorPlugin(vectorLibsql)
registerToolPlugin(datetime)
registerChannelPlugin(telegram)
