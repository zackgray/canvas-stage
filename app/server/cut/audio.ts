/**
 * Where a performance's sound is. Renders are video-only (CrossView, Realism and Reskin all drop it), and the pack's
 * `source.mp4` is re-encoded from the stabilised frames, so the dialogue lives in the approved Perform take the pack was
 * lifted from: `perform/<sid>/takes/<lift.json clip>`. Pack frame i = take frame i (the lift reads the take from its
 * first frame), so the take's audio is on the performance clock. Checked in order, first one with an audio stream wins:
 *   1. the pack's own source clip (manifest `sourceClip`), should a later lift keep the sound there;
 *   2. the approved take: the session folder whose lower-cased name starts the pack id (server/lift/request.ts packIdFor).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Prober } from './takes.ts'

const SAFE_REL = /^[\w.-]+(?:\/[\w.-]+)*$/
const readJson = (f: string): Record<string, unknown> | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { return null } }
const safe = (v: unknown): v is string => typeof v === 'string' && SAFE_REL.test(v) && !v.split('/').includes('..')

export function performanceAudioCandidates(publicDir: string, packId: string): string[] {
  if (!/^[\w-]+$/.test(packId)) return []
  const assets = path.join(publicDir, 'lab-assets')
  const pack = path.join(assets, 'performances', packId)
  const out: string[] = []
  const clip = readJson(path.join(pack, 'manifest.json'))?.sourceClip
  if (safe(clip)) out.push(path.join(pack, clip))
  const take = readJson(path.join(pack, 'lift.json'))?.clip
  if (safe(take) && !take.includes('/')) {
    let sessions: string[] = []
    try { sessions = readdirSync(path.join(assets, 'perform')).filter((d) => /^perf-[\w-]+$/.test(d)) } catch { /* no Perform sessions */ }
    for (const sid of sessions) if (packId.startsWith(`${sid.toLowerCase()}-`)) out.push(path.join(assets, 'perform', sid, 'takes', take))
  }
  return out
}

/** The first candidate that exists and carries an audio stream, or null (the cut then uses each take's own sound). */
export async function performanceAudio(publicDir: string, packId: string, probe: Prober): Promise<string | null> {
  for (const f of performanceAudioCandidates(publicDir, packId)) if (existsSync(f) && (await probe(f))?.hasAudio) return f
  return null
}
