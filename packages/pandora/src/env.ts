import { getRuntimeKey } from 'hono/adapter'

export type Runtime = ReturnType<typeof getRuntimeKey>

const SERVERLESS_RUNTIMES: Runtime[] = ['workerd', 'edge-light', 'fastly']

export function isServerless(): boolean {
  return SERVERLESS_RUNTIMES.includes(getRuntimeKey())
}

export { getRuntimeKey }
