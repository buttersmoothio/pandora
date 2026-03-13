import { createTool } from '@mastra/core/tools'
import type { Channel } from '@pandorakit/sdk/channels'
import { z } from 'zod'
import type { InboxStore } from '../storage/inbox-store'
import type { ToolRecord } from '../tools/types'

export interface SendToToolDeps {
  inboxStore: InboxStore
  threadId: string
  channels: Map<string, Channel>
  channelNames: Map<string, string>
  /** When set, lock the tool to this single destination. */
  destination?: string
}

export function createSendToTools(deps: SendToToolDeps): ToolRecord {
  const { inboxStore, threadId, channels, channelNames } = deps

  // Build mapping of friendly names to channels that support notify
  const notifiable = new Map<string, { nsKey: string; channel: Channel }>()
  for (const [friendlyName, nsKey] of channelNames) {
    const channel = channels.get(nsKey)
    if (channel?.notify) {
      notifiable.set(friendlyName, { nsKey, channel })
    }
  }

  const allDestinations = ['Web Inbox', ...notifiable.keys()] as [string, ...string[]]
  const destinations = deps.destination ? ([deps.destination] as [string]) : allDestinations

  const send_to = createTool({
    id: 'send_to',
    description: deps.destination
      ? `Send a notification to the user via ${deps.destination}.`
      : 'Send a notification to the user. "Web Inbox" delivers to the web inbox only. ' +
        'Other destinations deliver via that channel and also appear in the web inbox.',
    inputSchema: z.object({
      subject: z.string().min(1).describe('Brief subject line'),
      body: z.string().min(1).describe('Message body in markdown'),
      destination: z.enum(destinations).describe('Where to deliver the notification'),
    }),
    // biome-ignore lint/nursery/useExplicitType: input type inferred from inputSchema
    execute: async (input): Promise<Record<string, unknown>> => {
      const { subject, body, destination } = input

      if (destination === 'Web Inbox') {
        const msg = await inboxStore.add({
          subject,
          body,
          threadId,
          destination: 'web',
          status: 'sent',
        })
        return { sent: true, id: msg.id, destination: 'web', status: 'sent' }
      }

      const entry = notifiable.get(destination)
      if (!entry?.channel.notify) {
        return { sent: false, error: `Destination "${destination}" is not available` }
      }

      const msg = await inboxStore.add({
        subject,
        body,
        threadId,
        destination: entry.nsKey,
        status: 'pending',
      })

      try {
        await entry.channel.notify({ subject, body })
        await inboxStore.updateStatus(msg.id, 'sent')
        return { sent: true, id: msg.id, destination: entry.nsKey, status: 'sent' }
      } catch (err) {
        await inboxStore.updateStatus(msg.id, 'failed')
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        return {
          sent: false,
          id: msg.id,
          destination: entry.nsKey,
          status: 'failed',
          error: errorMsg,
        }
      }
    },
  })

  return { send_to }
}
