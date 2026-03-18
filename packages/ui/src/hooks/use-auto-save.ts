import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface UseAutoSaveOptions<T> {
  /** The current local value (from user input) */
  value: T
  /** The last known server value (from useConfig/query data) */
  serverValue: T
  /** Function to persist the value */
  onSave: (value: T) => Promise<unknown>
  /** Debounce delay in ms (default 800, use 0 for immediate) */
  delay?: number
  /** Whether auto-save is active */
  enabled?: boolean
}

interface UseAutoSaveReturn {
  status: 'idle' | 'saving' | 'saved' | 'error'
}

export function useAutoSave<T>({
  value,
  serverValue,
  onSave,
  delay = 800,
  enabled = true,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [status, setStatus] = useState<UseAutoSaveReturn['status']>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(
    async (val: T): Promise<void> => {
      setStatus('saving')
      try {
        await onSave(val)
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      } catch (err) {
        setStatus('error')
        toast.error(err instanceof Error ? err.message : 'Failed to save')
        setTimeout(() => setStatus('idle'), 3000)
      }
    },
    [onSave],
  )

  useEffect(() => {
    // Only save if local value differs from server value
    if (JSON.stringify(value) === JSON.stringify(serverValue)) {
      return
    }

    if (!enabled) {
      return
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      save(value)
    }, delay)

    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [value, serverValue, delay, enabled, save])

  return { status }
}
