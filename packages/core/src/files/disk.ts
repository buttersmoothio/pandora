import { resolve } from 'node:path'
import { Disk } from 'flydrive'
import { FSDriver } from 'flydrive/drivers/fs'

const DEFAULT_STORAGE_PATH = 'data/uploads'

/**
 * Create a FlyDrive Disk backed by the local filesystem.
 *
 * Location defaults to `data/uploads/` relative to cwd, or set
 * the `FILE_STORAGE_PATH` env var to an absolute or relative path.
 */
export function createFileDisk(env: Record<string, string | undefined>): Disk {
  const location = resolve(env.FILE_STORAGE_PATH ?? DEFAULT_STORAGE_PATH)

  return new Disk(
    new FSDriver({
      location,
      visibility: 'private',
      urlBuilder: {
        async generateURL(key: string): Promise<string> {
          return `/api/files/${key}`
        },
        async generateSignedURL(key: string): Promise<string> {
          return `/api/files/${key}`
        },
      },
    }),
  )
}
