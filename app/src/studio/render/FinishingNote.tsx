import { Progress } from '../ui'

/** when each render's finish was first seen running (one clock per render, shared by the player in Render's panel and the viewer) */
const seen = new Map<string, number>()

/** "finishing (sharpen, grain)…" naming what this finish applies (finishChoice.ts finishWords), with a clock, while the free finish pass runs on the render on show. */
export function FinishingNote({ renderId, on, words = 'sharpen, grain' }: { renderId: string | null | undefined; on: boolean; words?: string }) {
  if (!on || !renderId) { if (renderId) seen.delete(renderId); return null }
  if (!seen.has(renderId)) seen.set(renderId, Date.now())
  return <div data-testid="l2r-finishing"><Progress label={`finishing (${words})…`} startedAt={seen.get(renderId)} /></div>
}
