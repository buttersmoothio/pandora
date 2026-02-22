'use client'

import { CheckCircle2Icon, Loader2Icon, RadioIcon, WebhookIcon, XCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfigField } from '@/components/config-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { type ChannelInfo, useChannels } from '@/hooks/use-channels'
import { useUpdateConfig } from '@/hooks/use-config'

function ChannelCard({ channel }: { channel: ChannelInfo }) {
  const updateConfig = useUpdateConfig()
  const [enabled, setEnabled] = useState(channel.enabled)
  const [fields, setFields] = useState<Record<string, unknown>>(channel.config)

  useEffect(() => {
    setEnabled(channel.enabled)
    setFields(channel.config)
  }, [channel])

  const requiredFieldsFilled = channel.configFields
    .filter((f) => f.required)
    .every((f) => {
      const val = fields[f.key]
      return typeof val === 'string' ? val.trim() !== '' : val != null
    })

  const savedRequiredFieldsFilled = channel.configFields
    .filter((f) => f.required)
    .every((f) => {
      const val = channel.config[f.key]
      return typeof val === 'string' ? val.trim() !== '' : val != null
    })

  const configured = channel.envConfigured && savedRequiredFieldsFilled
  const canEnable = channel.envConfigured && requiredFieldsFilled

  const isDirty =
    enabled !== channel.enabled || JSON.stringify(fields) !== JSON.stringify(channel.config)

  function save() {
    updateConfig.mutate({
      channels: { [channel.id]: { ...fields, enabled } },
    })
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    updateConfig.mutate({
      channels: { [channel.id]: { ...channel.config, enabled: checked } },
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm">{channel.name}</CardTitle>
          <CardDescription className="font-mono text-xs">{channel.id}</CardDescription>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {channel.envConfigured ? (
              configured ? (
                <Badge variant="secondary" className="text-[10px]">
                  <CheckCircle2Icon className="size-3" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Not configured
                </Badge>
              )
            ) : (
              <Badge variant="destructive" className="text-[10px]">
                <XCircleIcon className="size-3" />
                Missing env vars
              </Badge>
            )}
            {channel.webhook && (
              <Badge variant="outline" className="text-[10px]">
                <WebhookIcon className="size-3" />
                Webhook
              </Badge>
            )}
            {channel.realtime && (
              <Badge variant="outline" className="text-[10px]">
                <RadioIcon className="size-3" />
                Realtime
              </Badge>
            )}
          </div>
        </div>
        <CardAction>
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={!canEnable} />
        </CardAction>
      </CardHeader>

      {!channel.envConfigured && (
        <CardContent>
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              Missing environment variables
            </p>
            <p className="mt-1 text-muted-foreground">Add the following to your environment:</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {channel.envVars
                .filter((v) => v.required !== false)
                .map((v) => (
                  <code key={v.name} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {v.name}
                  </code>
                ))}
            </div>
            {channel.envVars.some((v) => v.required === false) && (
              <div className="mt-2">
                <p className="text-muted-foreground text-xs">Optional:</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {channel.envVars
                    .filter((v) => v.required === false)
                    .map((v) => (
                      <code
                        key={v.name}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs opacity-60"
                      >
                        {v.name}
                      </code>
                    ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}

      {channel.envConfigured && channel.configFields.length > 0 && (
        <CardContent className="flex flex-col gap-4">
          {channel.configFields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              scopeId={channel.id}
              value={fields[field.key]}
              onChange={(v) => setFields({ ...fields, [field.key]: v })}
            />
          ))}

          {isDirty && (
            <Button size="sm" className="self-end" disabled={updateConfig.isPending} onClick={save}>
              {updateConfig.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}

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
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Channels</h1>
      <div className="flex flex-col gap-4">
        {channels.map((channel) => (
          <ChannelCard key={channel.id} channel={channel} />
        ))}
      </div>
    </div>
  )
}
