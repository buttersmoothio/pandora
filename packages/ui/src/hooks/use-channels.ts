import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface ConfigFieldDescriptor {
  key: string
  label: string
  type: 'text' | 'number' | 'password'
  required?: boolean
  placeholder?: string
  description?: string
}

export interface ChannelInfo {
  id: string
  name: string
  envVars: string[]
  envConfigured: boolean
  configFields: ConfigFieldDescriptor[]
  enabled: boolean
  config: Record<string, unknown>
  loaded: boolean
  webhook: boolean | null
  realtime: boolean | null
}

export const CHANNELS_KEY = ['channels'] as const

function fetchChannels() {
  return apiFetch<{ channels: ChannelInfo[] }>('/api/channels').then((res) => res.channels)
}

export function useChannels() {
  return useQuery({
    queryKey: CHANNELS_KEY,
    queryFn: fetchChannels,
  })
}
