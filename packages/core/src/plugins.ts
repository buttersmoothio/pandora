import research from '@pandora/agent-research'
import telegram from '@pandora/channel-telegram'
import libsql from '@pandora/storage-libsql'
import datetime from '@pandora/tools-datetime'
import websearch from '@pandora/tools-websearch'
import vectorLibsql from '@pandora/vector-libsql'
import { registerAgentPlugin } from './agents'
import { registerChannelPlugin } from './channels'
import { registerStoragePlugin } from './storage'
import { registerToolPlugin } from './tools'
import { registerVectorPlugin } from './vector'

registerStoragePlugin(libsql)
registerVectorPlugin(vectorLibsql)
registerToolPlugin(datetime)
registerToolPlugin(websearch)
registerChannelPlugin(telegram)
registerAgentPlugin(research)
