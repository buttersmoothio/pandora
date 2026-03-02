# Plugin Architecture — Remaining Work

The plugin system is implemented. This document tracks what's left. For how it works, see the code:

- **Manifest schema:** `packages/core/src/manifest/schema.ts`
- **Discovery:** `packages/core/src/manifest/discover.ts`
- **Loader:** `packages/core/src/manifest/loader.ts` + `compartment-loader.ts`
- **Adapter:** `packages/core/src/manifest/adapter.ts`
- **Orchestrator:** `packages/core/src/manifest/load-all.ts`
- **Endowments:** `packages/core/src/manifest/plugin-endowments.ts`
- **Sandbox:** `packages/core/src/tools/sandbox/compartment.ts` + `endowments.ts`
- **Tool binding:** `packages/core/src/tools/define.ts`
- **SDK types:** `packages/sdk/src/tools.ts`

---

## Compartment Sandbox (remaining)

- [ ] Test third-party plugin compatibility in Compartments (`ai`, `zod`, `@tavily/ai-sdk`, `@ai-sdk/*` providers)
- [ ] Source map support via `sourceMapHook` for Compartment stack traces

---

## Agent-Written Code Sandbox Wiring

`executeInCompartment()` exists and is tested (`packages/core/src/tools/sandbox/compartment.ts`), but is not called from the tool execution path. It needs to be invoked when a tool's `sandbox` mode is `'compartment'` and it's generated code (not a plugin). This is blocked on the Tool Generation Flow (see [DESIGN-DRAFT.md](./DESIGN-DRAFT.md#4-tool-generation-flow)).

---

## Per-Dependency Policy

Not needed for the initial implementation. If the flat permission propagation model proves too coarse:

- [ ] Per-package authority via compartment-mapper policy system
- [ ] LavaMoat TOFU (Trust On First Use) auto-generated policy
- [ ] Policy file format and generation CLI

---

## Plugin Store & Distribution

- [ ] Plugin store API (index, search, metadata, trust levels)
- [ ] Store UI in `packages/ui` (browse, install, enable/disable)
- [ ] `pandora build` CLI wrapping `@endo/bundle-source` to produce `.pandora` bundles
- [ ] Bundle integrity verification with `@endo/check-bundle`
- [ ] Runtime bundle loading with `@endo/import-bundle`
- [ ] npm registry integration for plugin distribution
- [ ] Curated store layer with review/approval workflow

### Build-time Bundling (Approach B)

Approach A (runtime `@endo/compartment-mapper`) is implemented. Approach B is the future distribution format for the store:

- [ ] `@endo/bundle-source` postinstall step for pre-compiled bundles
- [ ] `endoZipBase64` archive format with SHA-512 per-module hashes
- [ ] `@endo/import-bundle` runtime loading from bundle
- [ ] Bundle caching and portability

### Store Plugin Hot Reload

`runtime.reload()` exists for config changes, but the store install flow needs:

- [ ] Install plugin without server restart
- [ ] Unload/replace plugin at runtime (clear registration + Compartment)
- [ ] UI-driven install -> enable flow

---

## Miscellaneous

- [ ] Pin Endo package versions to exact tested release (currently `^2.0.0` / `^1.14.0`)
