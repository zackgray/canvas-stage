// The Stage bar's own press choices (consistency pass, 2026-10-27): 1 or 2 stills per press, remembered for the scene; "Same look as
// an earlier frame" (an approved first frame of another take of this scene): OFF by default and never remembered (stage-only plan
// section 5: the finish copies whatever is in that frame, so a close-up once got a wide frame's prop); when the owner turns it on the
// press asks the server for that frame's clothes (`sameLook: true`) and sends its seed; and, when a press brought two stills, which
// one the viewport shows for Approve. The still block holds these and publishes them with its press and overlay (heroPublished.ts).
import { useState } from 'react'
import type { DrawMode } from '../../shared/stillPressContract'
import { useSceneStillCount, type StillCount } from './stillCount'

interface Candidate { id: string; createdAt: string; approved?: boolean }

/** the newest press's stills nobody has approved, in draw order (Still 1, Still 2) */
export function newestBatch<T extends Candidate>(opening: T[]): T[] {
  const waiting = opening.filter((s) => !s.approved)
  const newest = waiting.reduce((a, s) => (s.createdAt > a ? s.createdAt : a), '')
  return waiting.filter((s) => s.createdAt === newest).sort((a, b) => a.id.localeCompare(b.id))
}

export function useStageStillPress(scene: string | null, mode: DrawMode = 'depth') {
  // two options each time when drawing from the approved frame (the owner picks the cleanest), one otherwise; a remembered choice wins
  const [count, setCount] = useSceneStillCount(scene, mode === 'edit' ? 2 : 1)
  const [useLook, setUseLook] = useState(false)
  const [shownId, setShownId] = useState<string | null>(null)
  return {
    count, setCount: (n: StillCount) => setCount(n),
    /** the owner turned "Use an earlier frame's look" on (off on every fresh page) */
    lookOn: useLook,
    /** the seed the press sends: the approved frame's while its look is used, else none (a fresh roll) */
    seedOf: (look: { seed: number } | null | undefined) => (look && useLook ? look.seed : undefined),
    /** the press's (and its preview's) request for that frame's clothes: true only while the owner has it on and a frame exists */
    asks: (look: { seed: number } | null | undefined) => !!look && useLook,
    /** the line under the press: shown only when there is an approved frame to match */
    sameLook: (look: { seed: number } | null | undefined) => (look ? { on: useLook, onToggle: () => setUseLook((v) => !v) } : null),
    /** of a press's stills, the one the viewport shows (the first until the owner picks another) */
    shown: <T extends Candidate>(batch: T[]): T | null => batch.find((s) => s.id === shownId) ?? batch[0] ?? null,
    show: setShownId,
  }
}
