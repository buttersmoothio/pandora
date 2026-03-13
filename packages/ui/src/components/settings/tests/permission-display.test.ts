import { describe, expect, it } from 'vitest'
import { aggregatePermissions } from '../permission-display'

describe('aggregatePermissions', () => {
  it('returns empty object for no tools', () => {
    expect(aggregatePermissions([])).toEqual({})
  })

  it('returns empty object for tools without permissions', () => {
    expect(aggregatePermissions([{}, { permissions: undefined }])).toEqual({})
  })

  it('collects boolean permissions', () => {
    const result = aggregatePermissions([
      { permissions: { time: true } },
      { permissions: { random: true } },
    ])
    expect(result).toEqual({ time: true, random: true })
  })

  it('merges network arrays without duplicates', () => {
    const result = aggregatePermissions([
      { permissions: { network: ['api.example.com', 'cdn.example.com'] } },
      { permissions: { network: ['cdn.example.com', 'other.com'] } },
    ])
    expect(result.network).toEqual(
      expect.arrayContaining(['api.example.com', 'cdn.example.com', 'other.com']),
    )
    expect(result.network).toHaveLength(3)
  })

  it('merges env arrays without duplicates', () => {
    const result = aggregatePermissions([
      { permissions: { env: ['API_KEY'] } },
      { permissions: { env: ['API_KEY', 'SECRET'] } },
    ])
    expect(result.env).toHaveLength(2)
    expect(result.env).toEqual(expect.arrayContaining(['API_KEY', 'SECRET']))
  })

  it('merges fs arrays without duplicates', () => {
    const result = aggregatePermissions([
      { permissions: { fs: ['/tmp'] } },
      { permissions: { fs: ['/tmp', '/data'] } },
    ])
    expect(result.fs).toHaveLength(2)
    expect(result.fs).toEqual(expect.arrayContaining(['/tmp', '/data']))
  })

  it('combines all permission types from multiple tools', () => {
    const result = aggregatePermissions([
      { permissions: { time: true, network: ['api.com'] } },
      { permissions: { random: true, env: ['KEY'], fs: ['/tmp'] } },
      { permissions: { network: ['cdn.com'] } },
    ])
    expect(result).toEqual({
      time: true,
      random: true,
      network: expect.arrayContaining(['api.com', 'cdn.com']),
      env: ['KEY'],
      fs: ['/tmp'],
    })
  })

  it('does not set array keys when arrays are empty', () => {
    const result = aggregatePermissions([{ permissions: { network: [] } }])
    expect(result).toEqual({})
    expect(result.network).toBeUndefined()
  })

  it('skips tools interspersed with no permissions', () => {
    const result = aggregatePermissions([
      { permissions: { time: true } },
      {},
      { permissions: { random: true } },
    ])
    expect(result).toEqual({ time: true, random: true })
  })
})
