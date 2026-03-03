import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { InboxStore } from '../storage/inbox-store'
import type { ToolRecord } from '../tools/types'

export function createInboxTools(inboxStore: InboxStore, threadId: string): ToolRecord {
  const send_to_inbox = createTool({
    id: 'send_to_inbox',
    description:
      "Send a message to the user's inbox with your findings. Keep subjects brief and bodies concise. " +
      'Use markdown for formatting.',
    inputSchema: z.object({
      subject: z.string().min(1).describe('Brief subject line'),
      body: z.string().min(1).describe('Message body in markdown'),
    }),
    execute: async (input) => {
      const msg = await inboxStore.add({
        subject: input.subject,
        body: input.body,
        threadId,
      })
      return { sent: true, id: msg.id }
    },
  })

  return { send_to_inbox }
}
