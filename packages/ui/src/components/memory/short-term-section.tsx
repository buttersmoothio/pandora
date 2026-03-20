'use client'

import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Streamdown } from 'streamdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useMemory } from '@/hooks/use-memory'
import { parseWorkingMemoryData, replaceWorkingMemoryData } from '@/lib/memory-utils'

export function ShortTermSection(): React.JSX.Element {
  const { workingMemory, updateWorkingMemory } = useMemory()
  const { data, isLoading } = workingMemory
  const [editContent, setEditContent] = useState('')
  const [editing, setEditing] = useState(false)

  const rawContent = data?.content ?? null
  const displayContent = rawContent ? parseWorkingMemoryData(rawContent) : null

  function startEditing(): void {
    if (displayContent) {
      setEditContent(displayContent)
    }
    setEditing(true)
  }

  function cancelEditing(): void {
    setEditContent(displayContent ?? '')
    setEditing(false)
  }

  const [isSaving, setIsSaving] = useState(false)

  function saveEdit(): void {
    if (!rawContent) {
      return
    }
    const updated = replaceWorkingMemoryData(rawContent, editContent.trim())
    setIsSaving(true)
    updateWorkingMemory(updated)
      .then(() => setEditing(false))
      .catch((err: Error) => toast.error(`Failed to update memory: ${err.message}`))
      .finally(() => setIsSaving(false))
  }

  return (
    <div>
      <h2 className="display-heading-medium font-display text-base">Short-term Memory</h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Key facts and context, available immediately in every conversation.
      </p>
      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : displayContent ? (
          <div className="flex flex-col gap-4">
            {editing ? (
              <>
                <Textarea
                  rows={10}
                  value={editContent}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void =>
                    setEditContent(e.target.value)
                  }
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={cancelEditing}>
                    Cancel
                  </Button>
                  <Button disabled={isSaving} onClick={saveEdit}>
                    {isSaving ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="max-h-80 overflow-y-auto rounded-md border bg-muted/50 p-4">
                  <Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    {displayContent}
                  </Streamdown>
                </div>
                <Button variant="outline" className="self-end" onClick={startEditing}>
                  Edit
                </Button>
              </>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nothing here yet. Key facts will appear as your agent learns more about you.
          </p>
        )}
      </div>
    </div>
  )
}
