/**
 * Request Context - Per-request state via AsyncLocalStorage.
 *
 * The gateway wraps each message in a context so that tools, subagents, and
 * other code running within the request can access request-scoped data
 * (conversation ID, channel, user) without explicit parameter threading.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request context available to all code within a gateway request. */
export interface RequestContext {
  /** Current conversation ID */
  conversationId: string;
  /** Channel this request originated from */
  channelName: string;
  /** User ID this request originated from */
  userId: string;
}

/** AsyncLocalStorage instance for request-scoped context. */
export const requestContext = new AsyncLocalStorage<RequestContext>();
