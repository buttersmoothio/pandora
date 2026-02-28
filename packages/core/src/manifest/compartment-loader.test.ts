import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addTsExtensions, loadInCompartment } from './compartment-loader'

const testDir = join(tmpdir(), 'pandora-compartment-test')

function writePluginFiles(
  name: string,
  files: Record<string, string>,
  packageJson?: Record<string, unknown>,
): string {
  const dir = join(testDir, name)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '0.0.1',
      type: 'module',
      exports: { '.': './src/index.ts' },
      ...packageJson,
    }),
  )
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(dir, filePath)
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'))
    mkdirSync(parentDir, { recursive: true })
    writeFileSync(fullPath, content)
  }
  return dir
}

beforeEach(() => {
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('loadInCompartment', () => {
  it('loads a simple TypeScript plugin and returns exports', async () => {
    const dir = writePluginFiles('test-plugin', {
      'src/index.ts': `
        export const tools = [
          {
            id: 'test-tool',
            name: 'Test Tool',
            description: 'A test tool',
            execute: async (input: { value: string }) => ({ result: input.value }),
          },
        ]
      `,
    })

    const ns = await loadInCompartment({
      packageDir: dir,
      entryPath: join(dir, 'src/index.ts'),
      envVars: {},
    })

    expect(ns.tools).toBeDefined()
    const tools = ns.tools as Array<{ id: string }>
    expect(tools).toHaveLength(1)
    expect(tools[0].id).toBe('test-tool')
  })

  it('provides Date/Intl with time permission', async () => {
    const dir = writePluginFiles('time-plugin', {
      'src/index.ts': `
        export const tools = [
          {
            id: 'time-tool',
            name: 'Time',
            description: 'Uses Date',
            execute: async () => {
              const now = new Date()
              return { iso: now.toISOString() }
            },
          },
        ]
      `,
    })

    const ns = await loadInCompartment({
      packageDir: dir,
      entryPath: join(dir, 'src/index.ts'),
      permissions: { time: true },
      envVars: {},
    })

    const tools = ns.tools as Array<{ execute: (input: unknown) => Promise<{ iso: string }> }>
    const result = await tools[0].execute({})
    expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('provides scoped env to plugins', async () => {
    const dir = writePluginFiles('env-plugin', {
      'src/index.ts': `
        export const tools = [
          {
            id: 'env-tool',
            name: 'Env',
            description: 'Reads env',
            execute: async () => {
              return { key: env.get('MY_KEY'), secret: env.get('SECRET') }
            },
          },
        ]
      `,
    })

    const ns = await loadInCompartment({
      packageDir: dir,
      entryPath: join(dir, 'src/index.ts'),
      permissions: { env: ['MY_KEY'] },
      envVars: { MY_KEY: 'hello', SECRET: 'hidden' },
    })

    const tools = ns.tools as Array<{
      execute: (input: unknown) => Promise<{ key: string | undefined; secret: string | undefined }>
    }>
    const result = await tools[0].execute({})
    expect(result.key).toBe('hello')
    expect(result.secret).toBeUndefined()
  })

  it('resolves multi-file imports without explicit .ts extensions', async () => {
    const dir = writePluginFiles('multi-file-plugin', {
      'src/helper.ts': `
        export function greet(name: string): string {
          return 'hello ' + name
        }
      `,
      'src/index.ts': `
        import { greet } from './helper'

        export const tools = [
          {
            id: 'greet-tool',
            name: 'Greet',
            description: 'Greets someone',
            execute: async (input: { name: string }) => ({ message: greet(input.name) }),
          },
        ]
      `,
    })

    const ns = await loadInCompartment({
      packageDir: dir,
      entryPath: join(dir, 'src/index.ts'),
      envVars: {},
    })

    const tools = ns.tools as Array<{
      execute: (input: { name: string }) => Promise<{ message: string }>
    }>
    const result = await tools[0].execute({ name: 'world' })
    expect(result.message).toBe('hello world')
  })

  it('strips TypeScript type annotations', async () => {
    const dir = writePluginFiles('typed-plugin', {
      'src/index.ts': `
        interface ToolResult {
          value: string
        }

        const helper = (x: string): ToolResult => ({ value: x })

        export const tools = [
          {
            id: 'typed-tool',
            name: 'Typed',
            description: 'Has types',
            execute: async (input: { msg: string }): Promise<ToolResult> => {
              return helper(input.msg)
            },
          },
        ]
      `,
    })

    const ns = await loadInCompartment({
      packageDir: dir,
      entryPath: join(dir, 'src/index.ts'),
      envVars: {},
    })

    const tools = ns.tools as Array<{
      execute: (input: { msg: string }) => Promise<{ value: string }>
    }>
    const result = await tools[0].execute({ msg: 'hello' })
    expect(result.value).toBe('hello')
  })
})

describe('addTsExtensions', () => {
  it('adds .ts to bare relative imports', () => {
    expect(addTsExtensions(`from './foo'`)).toBe(`from './foo.ts'`)
    expect(addTsExtensions(`from "./foo"`)).toBe(`from "./foo.ts"`)
  })

  it('skips paths that already have an extension', () => {
    expect(addTsExtensions(`from './foo.js'`)).toBe(`from './foo.js'`)
    expect(addTsExtensions(`from './foo.ts'`)).toBe(`from './foo.ts'`)
    expect(addTsExtensions(`from './foo.bar'`)).toBe(`from './foo.bar'`)
  })

  it('handles parent-directory imports', () => {
    expect(addTsExtensions(`from '../utils/bar'`)).toBe(`from '../utils/bar.ts'`)
  })

  it('does not rewrite non-relative imports', () => {
    expect(addTsExtensions(`from 'zod'`)).toBe(`from 'zod'`)
    expect(addTsExtensions(`from '@pandora/core'`)).toBe(`from '@pandora/core'`)
  })

  it('rewrites dynamic import() with relative paths', () => {
    expect(addTsExtensions(`import('./foo')`)).toBe(`import('./foo.ts')`)
    expect(addTsExtensions(`import('../utils/bar')`)).toBe(`import('../utils/bar.ts')`)
  })

  it('does not rewrite dynamic import() with package specifiers', () => {
    expect(addTsExtensions(`import('zod')`)).toBe(`import('zod')`)
    expect(addTsExtensions(`import('@tavily/ai-sdk')`)).toBe(`import('@tavily/ai-sdk')`)
  })

  it('skips dynamic import() when path has extension', () => {
    expect(addTsExtensions(`import('./foo.js')`)).toBe(`import('./foo.js')`)
  })

  it('handles multiple imports in one source', () => {
    const input = `import { a } from './a'\nimport { b } from './b.js'`
    const expected = `import { a } from './a.ts'\nimport { b } from './b.js'`
    expect(addTsExtensions(input)).toBe(expected)
  })
})
