'use client'

import { useConfig } from '@pandorakit/react-sdk'
import { Loader2Icon } from 'lucide-react'
import { LongTermSection } from '@/components/memory/long-term-section'
import { MemorySection } from '@/components/memory/memory-settings'
import { ShortTermSection } from '@/components/memory/short-term-section'

export default function MemoryPage(): React.JSX.Element {
  const { data: config, isLoading, error } = useConfig()

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-destructive">Failed to load configuration: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Memory</h1>
      <MemorySection />
      {config?.memory.enabled && (
        <>
          <ShortTermSection />
          <LongTermSection />
        </>
      )}
    </div>
  )
}
