'use client'

import { Loader2Icon, RadioIcon, WebhookIcon } from 'lucide-react'
import { PluginCard } from '@/components/settings/plugin-card'
import { Badge } from '@/components/ui/badge'
import { useChannels } from '@/hooks/use-channels'

export default function ChannelsPage() {
  const { data: channels, isLoading, error } = useChannels()

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
        <p className="text-destructive">Failed to load channels: {error.message}</p>
      </div>
    )
  }

  if (!channels || channels.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <RadioIcon className="size-10" />
        <p className="text-sm">No channels available. Install a channel package to get started.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Channels</h1>
      <div className="flex flex-col gap-4">
        {channels.map((channel) => (
          <PluginCard
            key={channel.id}
            plugin={channel}
            configKey="channels"
            badges={
              <>
                {channel.webhook && (
                  <Badge variant="outline">
                    <WebhookIcon className="size-3" />
                    Webhook
                  </Badge>
                )}
                {channel.realtime && (
                  <Badge variant="outline">
                    <RadioIcon className="size-3" />
                    Realtime
                  </Badge>
                )}
              </>
            }
            dialogContent={
              <div className="flex flex-wrap gap-1.5">
                {channel.webhook && (
                  <Badge variant="outline">
                    <WebhookIcon className="size-3" />
                    Webhook
                  </Badge>
                )}
                {channel.realtime && (
                  <Badge variant="outline">
                    <RadioIcon className="size-3" />
                    Realtime
                  </Badge>
                )}
              </div>
            }
          />
        ))}
      </div>
    </div>
  )
}
