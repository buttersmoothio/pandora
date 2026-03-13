'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function EditMessageForm({
  text,
  onChange,
  onCancel,
  onSubmit,
}: {
  text: string
  onChange: (text: string) => void
  onCancel: () => void
  onSubmit: () => void
}): React.JSX.Element {
  return (
    <div className="flex w-full flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void => onChange(e.target.value)}
        className="min-h-[80px] resize-none"
        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
          if (e.key === 'Escape') {
            onCancel()
          }
        }}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <XIcon className="size-3.5" />
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!text.trim()}>
          <CheckIcon className="size-3.5" />
          Send
        </Button>
      </div>
    </div>
  )
}
