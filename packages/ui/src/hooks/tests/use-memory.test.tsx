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
} from '../use-memory'

const { mockMemory } = vi.hoisted(() => ({
  mockMemory: {
    getObservations: vi.fn(),
    getRecord: vi.fn(),
    getWorkingMemory: vi.fn(),
    updateWorkingMemory: vi.fn(),
  },
}))

vi.mock('@/lib/api', () => ({
  client: {
    memory: mockMemory,
  },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

import { toast } from 'sonner'

function createWrapper(): ({ children }: { children: ReactNode }) => React.JSX.Element {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }): React.JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useObservations', () => {
  it('fetches observations via client.memory.getObservations', async () => {
    const data = { observations: 'some observations' }
    mockMemory.getObservations.mockResolvedValueOnce(data)

    const { result } = renderHook(() => useObservations(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockMemory.getObservations).toHaveBeenCalled()
    expect(result.current.data).toEqual(data)
  })
})

describe('useOMRecord', () => {
  it('fetches OM record via client.memory.getRecord', async () => {
    const data = { record: null, thresholds: null }
    mockMemory.getRecord.mockResolvedValueOnce(data)

    const { result } = renderHook(() => useOMRecord(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockMemory.getRecord).toHaveBeenCalled()
    expect(result.current.data).toEqual(data)
  })
})

describe('useWorkingMemory', () => {
  it('fetches working memory via client.memory.getWorkingMemory', async () => {
    const data = { content: 'memory content' }
    mockMemory.getWorkingMemory.mockResolvedValueOnce(data)

    const { result } = renderHook(() => useWorkingMemory(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockMemory.getWorkingMemory).toHaveBeenCalled()
    expect(result.current.data).toEqual(data)
  })
})

describe('useUpdateWorkingMemory', () => {
  it('calls client.memory.updateWorkingMemory with content', async () => {
    const responseData = { content: 'updated' }
    mockMemory.updateWorkingMemory.mockResolvedValueOnce(responseData)

    const { result } = renderHook(() => useUpdateWorkingMemory(), { wrapper: createWrapper() })

    result.current.mutate('new content')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockMemory.updateWorkingMemory).toHaveBeenCalledWith('new content')
  })

  it('shows toast on error', async () => {
    mockMemory.updateWorkingMemory.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useUpdateWorkingMemory(), { wrapper: createWrapper() })

    result.current.mutate('fail')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith('Failed to save: Network error')
  })
})
