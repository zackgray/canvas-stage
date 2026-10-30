// Asks Comfy Cloud to fetch the Layout-To-Render LoRA into the account, then waits for the task. Everything is injected
// (fetch, sleep, log) so it is tested with a fake Cloud. Safe to rerun: Cloud answers "already there" or finishes at once.
import { CLOUD, LORA_BODY, LORA_PAGE } from './cloud.mjs'
import { redact } from './env.mjs'

export const GATED_HELP = `Hugging Face refused the download. Lightricks gates this file: accept the licence at ${LORA_PAGE}, add a Hugging Face read token to your Comfy Cloud secrets (Comfy Cloud > Settings > Secrets), then run this again.`

const DONE = new Set(['completed', 'complete', 'succeeded', 'success', 'done'])
const BAD = new Set(['failed', 'error', 'cancelled', 'canceled'])
const GATED = /\b(401|403)\b|gated|forbidden|unauthori[sz]ed|access (denied|to this)|licen[cs]e|not authenticated/i

/** What the script would send, with the key hidden. */
export function describeRequest() {
  return { method: 'POST', url: `${CLOUD}/api/assets/download`, headers: { 'X-API-Key': '<COMFY_API_KEY from app/.env>', 'content-type': 'application/json' }, body: LORA_BODY }
}

const taskId = (j) => j?.id ?? j?.task_id ?? j?.taskId ?? j?.task?.id ?? null
const statusOf = (j) => String(j?.status ?? j?.state ?? j?.task?.status ?? '').toLowerCase()
const text = (j) => { try { return JSON.stringify(j) } catch { return String(j) } }

/** Resolves { ok, message }. Never throws; never prints the key. */
export async function importLora({ key, fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, pollMs = 3000, maxMs = 15 * 60_000 }) {
  const headers = { 'X-API-Key': key, 'content-type': 'application/json', accept: 'application/json' }
  const fail = (message) => ({ ok: false, message: redact(message) })
  let r
  try {
    r = await fetchFn(`${CLOUD}/api/assets/download`, { method: 'POST', headers, body: JSON.stringify(LORA_BODY) })
  } catch (e) {
    return fail(`Could not reach Comfy Cloud (${e instanceof Error ? e.message : e}). Check your network and run this again.`)
  }
  const body = await r.json().catch(() => ({}))
  if (r.status === 401 || r.status === 403) return fail(`Comfy Cloud refused your key (HTTP ${r.status}). Check COMFY_API_KEY in app/.env and that your plan has API access (importing needs Creator or above).`)
  if (r.status === 409 || /already (exists|imported|downloaded)/i.test(text(body))) return { ok: true, message: 'LoRA ready (it was already in your account)' }
  if (!r.ok) return fail(GATED.test(text(body)) ? GATED_HELP : `Comfy Cloud answered HTTP ${r.status}: ${text(body).slice(0, 300)}`)
  if (DONE.has(statusOf(body))) return { ok: true, message: 'LoRA ready' }
  const id = taskId(body)
  if (!id) return fail(`Cloud accepted the request but returned no task id: ${text(body).slice(0, 300)}`)
  log(`Import started (task ${id}). Waiting for Cloud to fetch the file, this can take a few minutes.`)

  const t0 = Date.now()
  for (;;) {
    await sleep(pollMs)
    let p, j
    try {
      p = await fetchFn(`${CLOUD}/api/tasks/${encodeURIComponent(id)}`, { headers })
      j = await p.json().catch(() => ({}))
    } catch (e) {
      if (Date.now() - t0 > maxMs) return fail(`Lost contact with Comfy Cloud (${e instanceof Error ? e.message : e}). Run this again.`)
      continue
    }
    if (p.status === 401 || p.status === 403) return fail(`Comfy Cloud refused your key while checking the task (HTTP ${p.status}).`)
    const s = statusOf(j)
    if (DONE.has(s)) return { ok: true, message: 'LoRA ready' }
    if (BAD.has(s)) return fail(GATED.test(text(j)) ? GATED_HELP : `The import failed: ${text(j).slice(0, 400)}. Run this again; if it repeats, import the file by hand in Comfy Cloud.`)
    if (Date.now() - t0 > maxMs) return fail(`The import is still running after ${Math.round(maxMs / 60000)} minutes (status "${s || 'unknown'}"). Run this again later; it is safe to repeat.`)
    log(`  still ${s || 'working'}...`)
  }
}
