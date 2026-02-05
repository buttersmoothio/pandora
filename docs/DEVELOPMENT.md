# Development

How to extend Pandora. Function and type details are in JSDoc in the source.

## Where to add code

| Add | Files to touch |
|-----|----------------|
| **Channel** | Implement `Channel` from `src/core/types.ts`. Add config schema in `config.ts`, register in `index.ts`. See `src/channels/telegram.ts` as reference. |
| **Subagent** | `src/core/subagents.ts`: create subagent + tool. `src/core/agent.ts`: register tool and instruction line. `config.ts`: add optional agent in schema. |
| **AI provider** | `src/core/providers.ts`: add case in `createModel` and extend `ProviderName`. `config.ts`: add provider and enum value. |
| **Store backend** | Implement `IMessageStore` from `src/store/types.ts`. Add type/path in storage config, add case in `createStore` in `src/store/index.ts`. |

## Codebase layout

- **src/index.ts** — Entry; config, store, agent, gateway, channels, shutdown.
- **src/core/** — agent, config, gateway, logger, providers, subagents, types.
- **src/channels/** — base (re-exports, isOwner), telegram.
- **src/store/** — index (createStore), types (IMessageStore), memory, sqlite.

## Testing

Use Bun: `bun test`. See project Cursor rule for Bun usage.
