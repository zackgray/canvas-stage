// Browser side of the Cut endpoint (dev-only middleware, server/cut/plugin.ts). Free: local ffmpeg, no keys.
import type { CutSegment, CutTake } from './model'

export interface CutStatus {
  state: 'idle' | 'running' | 'done' | 'error' | 'interrupted'
  packId?: string
  id?: string
  output?: string
  error?: string
}
export interface PriorCut { packId: string; id: string; url: string; frames: number; segments: number; createdAt: string }
export interface CutTakes { ffmpeg: boolean; performances: { packId: string; takes: CutTake[] }[]; cuts: PriorCut[] }

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export async function getCutTakes(f: Fetch = fetch): Promise<CutTakes | null> {
  try {
    const res = await f('/__lab/cut/takes', { cache: 'no-store' })
    const j = res.ok ? ((await res.json()) as CutTakes) : null
    return j && Array.isArray(j.performances) ? j : null
  } catch { return null }
}

export async function getCutStatus(f: Fetch = fetch): Promise<CutStatus | null> {
  try {
    const res = await f('/__lab/cut/status', { cache: 'no-store' })
    return res.ok ? ((await res.json()) as CutStatus) : null
  } catch { return null }
}

/** One POST per press; a 409/503/400 comes back as `error` text, never retried. */
export async function postCut(packId: string, segments: CutSegment[], f: Fetch = fetch): Promise<{ status: CutStatus | null; error: string | null }> {
  try {
    const res = await f('/__lab/cut', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ packId, segments }) })
    const j = (await res.json().catch(() => ({}))) as CutStatus & { error?: string }
    return res.ok ? { status: j, error: null } : { status: null, error: j.error ?? `export refused (${res.status})` }
  } catch (e) {
    return { status: null, error: `Could not reach the dev server: ${String(e)}` }
  }
}
