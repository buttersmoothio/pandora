'use client'

import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function ProviderLogo({
  providerId,
  className,
}: {
  providerId: string
  className?: string
}) {
  const [hidden, setHidden] = useState(false)

  if (hidden) return null

  return (
    <Image
      src={`https://models.dev/logos/${providerId}.svg`}
      alt=""
      width={16}
      height={16}
      unoptimized
      className={cn('size-4 shrink-0 dark:invert', className)}
      onError={() => setHidden(true)}
    />
  )
}
