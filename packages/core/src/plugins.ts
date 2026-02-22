import telegram from '@pandora/channel-telegram'
import libsql from '@pandora/storage-libsql'
import datetime from '@pandora/tools-datetime'
import { registerChannelPlugin } from './channels'
import { registerStoragePlugin } from './storage'
import { registerToolPlugin } from './tools'

registerStoragePlugin(libsql)
registerToolPlugin(datetime)
registerChannelPlugin(telegram)
