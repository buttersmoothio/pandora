'use client'

import { parseObservationSections, useMemory, useToolNames } from '@pandorakit/react-sdk'
import { Loader2Icon } from 'lucide-react'
import { useMemo } from 'react'
import { Streamdown } from 'streamdown'
import { MemoryProgress } from '@/components/memory/memory-progress'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTokens, timeAgo } from '@/lib/memory-utils'

export function LongTermSection(): React.JSX.Element {
  const { observations, record: recordQuery } = useMemory()
  const { data: obsData, isLoading } = observations
  const { data: recordData } = recordQuery
  const toolNames = useToolNames()

  const raw = obsData?.observations ?? null
  const record = recordData?.record ?? null
  const thresholds = recordData?.thresholds ?? null
  const sections = useMemo(
    () => (raw ? parseObservationSections(raw, toolNames) : []),
    [raw, toolNames],
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Long-term Memory</CardTitle>
          <CardDescription>
            Observations built up over time from your conversations.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {record?.isObserving && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              Processing
            </Badge>
          )}
          {record?.isReflecting && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              Condensing
            </Badge>
          )}
          {record && !(record.isObserving || record.isReflecting) && (
            <Badge variant="outline">Idle</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {record && thresholds && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/50 p-4">
            <MemoryProgress
              label="Observation capacity"
              tokens={record.observationTokenCount}
              threshold={thresholds.observationTokens}
              tooltip="Active observation size. Condensed automatically when full."
            />
            <div className="flex items-center gap-4 text-muted-foreground text-xs">
              <span>{formatTokens(record.totalTokensObserved)} processed</span>
              <span>
                {record.generationCount}{' '}
                {record.generationCount === 1 ? 'condensation' : 'condensations'}
              </span>
              {record.lastObservedAt && <span>Last active {timeAgo(record.lastObservedAt)}</span>}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : sections.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sections.map((section) => (
              <div
                key={section.title ?? 'summary'}
                className="max-h-64 overflow-y-auto rounded-md border bg-muted/50 p-4"
              >
                {section.title && (
                  <p className="mb-2 text-muted-foreground text-xs">{section.title}</p>
                )}
                <Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {section.content}
                </Streamdown>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nothing here yet. Observations are created once enough conversation has accumulated.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
