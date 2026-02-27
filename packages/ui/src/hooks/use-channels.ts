import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface ConfigFieldDescriptor {
  key: string
  label: string
  type: 'text' | 'number' | 'password' | 'enum'
  required?: boolean
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[]
}

export interface EnvVarDescriptor {
  name: string
  required?: boolean
  configured?: boolean
}

export interface ChannelInfo {
  id: string
  name: string
  description?: string
  author?: string
  icon?: string
  version?: string
  homepage?: string
  repository?: string
  license?: string
  envVars: EnvVarDescriptor[]
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
