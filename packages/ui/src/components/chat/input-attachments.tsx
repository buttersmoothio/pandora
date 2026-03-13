'use client'

import { MessageAttachment, MessageAttachments } from '@/components/ai-elements/message'
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'

export function InputAttachments(): React.JSX.Element | null {
  const attachments = usePromptInputAttachments()

  if (attachments.files.length === 0) {
    return null
  }

  return (
    <MessageAttachments>
      {attachments.files.map((file) => (
        <MessageAttachment
          data={file}
          key={file.id}
          onRemove={(): void => attachments.remove(file.id)}
        />
      ))}
    </MessageAttachments>
  )
}
