/**
 * One setting from the environment: the process first, then app/.env and app/.env.local (the dev server reads those for
 * its config but only copies a few keys into the process, so a setting added later would otherwise never arrive).
 * Tests (VITEST) see the process only, never the developer's own files.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export function envValue(name: string): string | undefined {
  const own = process.env[name]?.trim()
  if (own) return own
  if (process.env.VITEST) return undefined
  try { return loadEnv('development', APP, '')[name]?.trim() || undefined } catch { return undefined }
}
