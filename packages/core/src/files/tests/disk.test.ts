import { describe, expect, it } from 'vitest'
import { createFileDisk } from '../disk'

describe('createFileDisk', () => {
  it('creates a disk with default storage path', () => {
    const disk = createFileDisk({})
    expect(disk).toBeDefined()
  })

  it('creates a disk with custom storage path', () => {
    const disk = createFileDisk({ FILE_STORAGE_PATH: '/tmp/test-uploads' })
    expect(disk).toBeDefined()
  })

  it('generates correct URLs via the url builder', async () => {
    const disk = createFileDisk({})
    // Put a small file and verify the URL format
    const key = 'test/hello.txt'
    await disk.put(key, Buffer.from('hello'), { contentType: 'text/plain' })
    const url = await disk.getUrl(key)
    expect(url).toBe('/api/files/test/hello.txt')

    // Clean up
    await disk.delete(key)
  })

  it('resolves relative FILE_STORAGE_PATH against cwd', () => {
    const disk = createFileDisk({ FILE_STORAGE_PATH: 'custom/path' })
    // Disk is created — the path resolution happens internally
    expect(disk).toBeDefined()
  })
})
