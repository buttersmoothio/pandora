'use client'

import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { Streamdown } from 'streamdown'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateWorkingMemory, useWorkingMemory } from '@/hooks/use-memory'
import { parseWorkingMemoryData, replaceWorkingMemoryData } from '@/lib/memory-utils'

export function ShortTermSection(): React.JSX.Element {
  const { data, isLoading } = useWorkingMemory()
  const updateMemory = useUpdateWorkingMemory()
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

  function saveEdit(): void {
    if (!rawContent) {
      return
    }
    const updated = replaceWorkingMemoryData(rawContent, editContent.trim())
    updateMemory.mutate(updated, { onSuccess: () => setEditing(false) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Short-term Memory</CardTitle>
        <CardDescription>
          Key facts and context, available immediately in every conversation.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                  <Button disabled={updateMemory.isPending} onClick={saveEdit}>
                    {updateMemory.isPending ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      'Save'
                    )}
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
      </CardContent>
    </Card>
  )
}
