export { adaptManifest } from './adapter'
export { type LoadInCompartmentOptions, loadInCompartment } from './compartment-loader'
export { type DiscoveredPlugin, discoverPlugins } from './discover'
export { loadAllPlugins } from './load-all'
export { type LoadedEntry, loadEntry } from './loader'
export { buildPluginEndowments } from './plugin-endowments'
export { getReadPowers } from './read-powers'
export {
  normalizeProvidesEntries,
  type PluginManifest,
  type ProvidesEntry,
  type ProvidesKey,
  pluginManifestSchema,
} from './schema'
