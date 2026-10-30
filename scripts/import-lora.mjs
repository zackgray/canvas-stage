#!/usr/bin/env node
// One-time, per account: asks Comfy Cloud to fetch the Layout-To-Render LoRA, then waits until it is there.
//   node scripts/import-lora.mjs [--dry-run]
// Reads COMFY_API_KEY from app/.env (or the environment). Safe to run twice. --dry-run prints the request and sends nothing.
// Node 22, no dependencies.
import { loadEnv, redact } from './lib/env.mjs'
import { describeRequest, importLora } from './lib/loraImport.mjs'

if (process.argv.includes('--dry-run')) {
  console.log('Dry run: nothing is sent. This would send:\n' + JSON.stringify(describeRequest(), null, 2))
  console.log('\nthen poll GET https://cloud.comfy.org/api/tasks/<task id> until it reports completed.')
  process.exit(0)
}

const { env } = loadEnv()
const key = (env.COMFY_API_KEY ?? '').trim()
if (!key) {
  console.error('No COMFY_API_KEY found in app/.env. Put your Comfy Cloud key there (SETUP step 3), then run this again.')
  process.exit(1)
}
const res = await importLora({ key, log: (l) => console.log(redact(l)) })
if (res.ok) console.log(res.message)
else console.error(res.message)
process.exit(res.ok ? 0 : 1)
