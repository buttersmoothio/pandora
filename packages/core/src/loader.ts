/**
 * Extension Loader - Auto-discovers and imports extension files
 *
 * Scans directories for .ts files and dynamically imports them to trigger
 * self-registration. Files starting with _ are excluded (convention for helpers).
 */

import { Glob } from "bun";
import { resolve, relative } from "node:path";
import { logger } from "./logger";

/**
 * Auto-discover and import all TypeScript files in a directory.
 *
 * Files starting with `_` are excluded (use for helper/utility files).
 * Only imports top-level .ts files (not subdirectories, except for channel dirs).
 *
 * @param directory - Absolute path to the directory to scan
 * @param options - Options for discovery
 */
export async function loadExtensions(
  directory: string,
  options: { recursive?: boolean } = {}
): Promise<void> {
  const { recursive = false } = options;

  const pattern = recursive ? "**/*.ts" : "*.ts";
  const glob = new Glob(pattern);

  const files: string[] = [];

  for await (const file of glob.scan({ cwd: directory, absolute: true })) {
    const filename = file.split("/").pop() ?? "";

    // Skip files starting with _ (helpers/utilities)
    if (filename.startsWith("_")) {
      continue;
    }

    // Skip index.ts files (legacy, can be removed)
    if (filename === "index.ts") {
      continue;
    }

    files.push(file);
  }

  // Sort for consistent load order
  files.sort();

  logger.debug("Loader", `Discovered ${files.length} extension(s)`, { directory });

  // Import all discovered files
  for (const file of files) {
    try {
      await import(file);
    } catch (error) {
      logger.error("Loader", `Failed to load extension: ${file}`, error);
      throw error;
    }
  }
}

/**
 * Load extensions from a directory, handling the channels special case
 * where each channel is in a subdirectory.
 *
 * @param directory - Absolute path to the channels directory
 */
export async function loadChannels(directory: string): Promise<void> {
  const glob = new Glob("*/index.ts");

  const files: string[] = [];

  for await (const file of glob.scan({ cwd: directory, absolute: true })) {
    files.push(file);
  }

  // Sort for consistent load order
  files.sort();

  logger.debug("Loader", `Discovered ${files.length} channel(s)`, { directory });

  // Import all discovered channel index files
  for (const file of files) {
    try {
      await import(file);
    } catch (error) {
      logger.error("Loader", `Failed to load channel: ${file}`, error);
      throw error;
    }
  }
}
