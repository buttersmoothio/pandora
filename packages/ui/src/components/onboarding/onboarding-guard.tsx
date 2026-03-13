'use client'

import { useConfig } from '@pandorakit/react-sdk'
import { Loader2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { OnboardingWizard } from './onboarding-wizard'

export function OnboardingGuard({ children }: { children: ReactNode }): React.JSX.Element | null {
  const { data: config, isLoading } = useConfig()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (config && !config.onboardingComplete) {
    return <OnboardingWizard />
  }

  return <>{children}</>
}
