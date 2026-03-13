import { handle } from 'hono/vercel'
import app from '../src/index'

export const GET: (req: Request) => Response | Promise<Response> = handle(app)
export const POST: (req: Request) => Response | Promise<Response> = handle(app)
export const PUT: (req: Request) => Response | Promise<Response> = handle(app)
export const DELETE: (req: Request) => Response | Promise<Response> = handle(app)
export const PATCH: (req: Request) => Response | Promise<Response> = handle(app)
