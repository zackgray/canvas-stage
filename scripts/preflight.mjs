#!/usr/bin/env node
// Checks the paid-path setup without spending credits:  node scripts/preflight.mjs   (or: npm run preflight in app/)
// Node 22, no dependencies. Exits 1 when a required check fails.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { ROOT, loadEnv, redact } from './lib/env.mjs'
import { format, runAll } from './lib/preflightChecks.mjs'

const run = (cmd, args) => {
  try { return { ok: true, out: String(execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 60_000 })) } } catch { return { ok: false, out: '' } }
}
const fs = { existsSync, readFileSync }
const { env, fileFound } = loadEnv({ fs })
const out = format(await runAll({ env, fileFound, fs, run, fetch, version: process.version, platform: process.platform, root: ROOT }))
console.log(redact(out.text))
process.exit(out.code)
