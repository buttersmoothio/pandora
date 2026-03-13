import { resolve } from 'node:path'
import { z } from 'zod'
import { pluginManifestSchema } from '../src/manifest/schema'

const raw: Record<string, unknown> = z.toJSONSchema(pluginManifestSchema, {
  target: 'draft-2020-12',
})

// Strip Zod internal metadata
const cleaned: Record<string, unknown> = Object.fromEntries(
  Object.entries(raw).filter(([k]) => !k.startsWith('~')),
)

const schema: Record<string, unknown> = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://pandorakit.com/schemas/manifest-v1.json',
  title: 'Pandora Plugin Manifest',
  description: 'Schema for pandora.manifest.json plugin manifest files.',
  ...cleaned,
}

const json: string = `${JSON.stringify(schema, null, 2)}\n`

const root: string = resolve(import.meta.dirname, '../../..')
const sdkOut: string = resolve(root, 'packages/sdk/schemas/pandora.manifest.schema.json')
const docsOut: string = resolve(root, 'packages/docs/public/schemas/manifest-v1.json')

await Bun.write(sdkOut, json)
await Bun.write(docsOut, json)
