import telegram from '@pandora/channel-telegram'
import libsql from '@pandora/storage-libsql'
import datetime from '@pandora/tools-datetime'
import { registerChannelFactory } from './channels'
import { registerStorageProvider } from './storage'
import { registerToolPackage } from './tools'

registerStorageProvider(libsql)
registerToolPackage(datetime)
registerChannelFactory(telegram)
