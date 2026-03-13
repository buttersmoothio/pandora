import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  useObservations,
  useOMRecord,
  useUpdateWorkingMemory,
  useWorkingMemory,
} from './use-memory'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

const mockApiFetch: ReturnType<typeof vi.mocked<typeof apiFetch>> = vi.mocked(apiFetch)

function createWrapper(): ({ children }: { children: ReactNode }) => React.JSX.Element {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }): React.JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useObservations', () => {
  it('fetches observations from the correct endpoint', async () => {
    const data = { observations: 'some observations' }
    mockApiFetch.mockResolvedValueOnce(data)

    const { result } = renderHook(() => useObservations(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/memory/observations')
    expect(result.current.data).toEqual(data)
  })
})

describe('useOMRecord', () => {
  it('fetches OM record from the correct endpoint', async () => {
    const data = { record: null, thresholds: null }
    mockApiFetch.mockResolvedValueOnce(data)

    const { result } = renderHook(() => useOMRecord(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/memory/record')
    expect(result.current.data).toEqual(data)
  })
})

describe('useWorkingMemory', () => {
  it('fetches working memory from the correct endpoint', async () => {
    const data = { content: 'memory content' }
    mockApiFetch.mockResolvedValueOnce(data)

    const { result } = renderHook(() => useWorkingMemory(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/memory/working')
    expect(result.current.data).toEqual(data)
  })
})

describe('useUpdateWorkingMemory', () => {
  it('sends PUT with JSON body', async () => {
    const responseData = { content: 'updated' }
    mockApiFetch.mockResolvedValueOnce(responseData)

    const { result } = renderHook(() => useUpdateWorkingMemory(), { wrapper: createWrapper() })

    result.current.mutate('new content')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith('/api/memory/working', {
      method: 'PUT',
      body: JSON.stringify({ content: 'new content' }),
    })
  })

  it('shows toast on error', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useUpdateWorkingMemory(), { wrapper: createWrapper() })

    result.current.mutate('fail')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith('Failed to save: Network error')
  })
})
