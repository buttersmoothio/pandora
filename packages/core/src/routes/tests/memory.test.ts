import { describe, expect, it } from 'vitest'
import { authRequest } from '../../test-helpers'

describe('Memory routes', () => {
  describe('GET /api/memory/observations', () => {
    it('returns observations (possibly null)', async () => {
      const res = await authRequest('/api/memory/observations')
      expect(res.status).toBe(200)

      const body = (await res.json()) as { observations: string | null }
      expect('observations' in body).toBe(true)
    })
  })

  describe('GET /api/memory/record', () => {
    it('returns record and thresholds', async () => {
      const res = await authRequest('/api/memory/record')
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        record: Record<string, unknown> | null
        thresholds: Record<string, unknown> | null
      }
      expect('record' in body).toBe(true)
      expect('thresholds' in body).toBe(true)
    })

    it('thresholds include expected fields when OM is active', async () => {
      const res = await authRequest('/api/memory/record')
      const body = (await res.json()) as {
        record: Record<string, unknown> | null
        thresholds: { scope: string; messageTokens: number; observationTokens: number } | null
      }

      if (body.thresholds) {
        expect(body.thresholds.scope).toBeDefined()
        expect(typeof body.thresholds.messageTokens).toBe('number')
        expect(typeof body.thresholds.observationTokens).toBe('number')
      }
    })

    it('record includes monitoring fields when OM is active', async () => {
      const res = await authRequest('/api/memory/record')
      const body = (await res.json()) as {
        record: Record<string, unknown> | null
        thresholds: Record<string, unknown> | null
      }

      if (body.record) {
        expect(typeof body.record.observationTokenCount).toBe('number')
        expect(typeof body.record.pendingMessageTokens).toBe('number')
        expect(typeof body.record.totalTokensObserved).toBe('number')
        expect(typeof body.record.generationCount).toBe('number')
        expect(typeof body.record.isObserving).toBe('boolean')
        expect(typeof body.record.isReflecting).toBe('boolean')
      }
    })
  })
})
