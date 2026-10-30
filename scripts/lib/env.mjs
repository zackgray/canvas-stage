// Shared by the setup scripts (preflight, import-lora). Node 22, no dependencies.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const ENV_FILE = path.join(ROOT, 'app', '.env')
export const CREDITS_PER_USD = 211 // about 2.11 credits per US cent

/** KEY=value lines of a .env file (quotes stripped, # comments and blanks skipped). Later lines win. */
export function parseEnv(text) {
  const out = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw)
    if (!m || raw.trimStart().startsWith('#')) continue
    let v = m[2]
    const q = /^(["'])(.*)\1$/.exec(v)
    out[m[1]] = q ? q[2] : v.replace(/\s+#.*$/, '')
  }
  return out
}

/** app/.env merged under the process environment (the process wins, as in the app). */
export function loadEnv({ fs = { existsSync, readFileSync }, file = ENV_FILE, proc = process.env } = {}) {
  const fromFile = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {}
  const env = { ...fromFile }
  for (const [k, v] of Object.entries(proc)) if (typeof v === 'string' && v.trim()) env[k] = v
  return { env, fileFound: fs.existsSync(file) }
}

/** CANVAS_DAY_BUDGET -> credits, or null when unset / not a positive number (same rule as the app). */
export function parseBudget(v) {
  const n = Number(String(v ?? '').trim())
  return v && Number.isFinite(n) && n > 0 ? n : null
}

/** Remove anything that looks like a Comfy key from text that is about to be printed. */
export const redact = (s) => String(s).replace(/comfyui-[A-Za-z0-9_-]+/g, 'comfyui-REDACTED')
