import { Hono } from 'hono'
import mime from 'mime'
import type { Env } from './helpers'

const fileRoutes: Hono<Env> = new Hono<Env>()

// Serve files from FlyDrive storage
fileRoutes.get('/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const disk = c.var.runtime.fileDisk

  try {
    const [bytes, meta] = await Promise.all([disk.getBytes(key), disk.getMetaData(key)])
    const contentType = meta.contentType ?? mime.getType(key) ?? 'application/octet-stream'

    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(meta.contentLength),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
})

export { fileRoutes }
