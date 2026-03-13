import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    tools: 'src/tools.ts',
    channels: 'src/channels.ts',
    agents: 'src/agents.ts',
    'api-types': 'src/api-types.ts',
    client: 'src/client/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
})
