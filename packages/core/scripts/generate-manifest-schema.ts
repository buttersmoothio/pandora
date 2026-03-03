import { resolve } from 'node:path'
import { z } from 'zod'
import { pluginManifestSchema } from '../src/manifest/schema'

const raw = z.toJSONSchema(pluginManifestSchema, { target: 'draft-2020-12' })

// Strip Zod internal metadata
const cleaned = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('~')))

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://pandorakit.com/schemas/manifest-v1.json',
  title: 'Pandora Plugin Manifest',
  description: 'Schema for pandora.manifest.json plugin manifest files.',
  ...cleaned,
}

const json = `${JSON.stringify(schema, null, 2)}\n`

const root = resolve(import.meta.dirname, '../../..')
const sdkOut = resolve(root, 'packages/sdk/schemas/pandora.manifest.schema.json')
const docsOut = resolve(root, 'packages/docs/public/schemas/manifest-v1.json')

await Bun.write(sdkOut, json)
await Bun.write(docsOut, json)

console.log(`Wrote ${sdkOut}`)
console.log(`Wrote ${docsOut}`)
