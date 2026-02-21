import libsql from '@pandora/storage-libsql'
import datetime from '@pandora/tools-datetime'
import { registerStorageProvider } from './storage'
import { registerToolPackage } from './tools'

registerStorageProvider(libsql)
registerToolPackage(datetime)
