import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js'

let cached: ReturnType<typeof makeReadPowers>

/** Singleton ReadPowers for the compartment mapper. */
export function getReadPowers(): ReturnType<typeof makeReadPowers> {
  cached ??= makeReadPowers({ fs, url, crypto, path })
  return cached
}
