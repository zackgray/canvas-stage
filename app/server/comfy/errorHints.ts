/**
 * Plain sentences for the three failures a first-time paid run most often hits (judge-path review 2026-10-29):
 * a refused key, a missing Layout-To-Render LoRA import, and the startup line that says what the server has to work with.
 */
import { parseCap } from '../jobs/budget.ts'

export const KEY_REFUSED = 'Comfy Cloud refused your key or your plan has no API access. Check COMFY_API_KEY in app/.env (a paid plan is needed for API access), then restart the dev server. `npm run preflight` tests the key for free.'
export const LORA_IMPORT = 'Render needs the one-time LoRA import: run node scripts/import-lora.mjs (SETUP step 5), then press Render again.'

/** "GET /api/object_info -> HTTP 401" and similar -> the key sentence; null for anything else. */
export function mapCloudAuth(message: string): string | null {
  return /\bHTTP (401|403)\b|\b(401|403)\b.*(unauthori[sz]ed|forbidden)|unauthori[sz]ed|invalid api key/i.test(message) ? KEY_REFUSED : null
}

/** A Render failure that names the LoRA file or its input -> the import sentence; null otherwise. */
export function mapMissingLora(message: string): string | null {
  return /lora_name|layout-to-render/i.test(message) && /not in|missing|invalid|not found|does not exist|value|required|list/i.test(message) ? LORA_IMPORT : null
}

/** `why` with the plain sentence in front when one applies; the raw Cloud text is kept after it. */
export function withHint(message: string): string {
  const hint = mapMissingLora(message) ?? mapCloudAuth(message)
  return hint ? `${hint} (${message})` : message
}

export interface StartupFacts { key: string | undefined; baseUrl?: string | undefined; budget: string | undefined; ffmpeg: boolean; node: string }

/** One line for the dev server's log at start. No network: the key is only checked for presence and shape. */
export function startupLine(f: StartupFacts): string {
  const key = f.baseUrl ? 'self-hosted target set (untested mode)'
    : !f.key?.trim() ? 'no key, paid steps off'
    : /^comfyui-/.test(f.key.trim()) ? 'key present'
    : 'key present but not shaped like comfyui-... (check it)'
  const cap = parseCap(f.budget)
  const budget = cap === null ? 'day budget NOT set, every paid press is refused' : `day budget ${cap} cr`
  return `[comfy] ${key}; ${budget}; ffmpeg ${f.ffmpeg ? 'ok' : 'MISSING'}; node ${f.node}. \`npm run preflight\` tests the key for free.`
}
