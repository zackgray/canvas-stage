/**
 * What the hero is doing at the still's own frame (tidy wave, 2026-10-25): a mid or end still used to say no action at all (only
 * frame 0 was read), so a man kneeling at the end was drawn standing about. The performance is compiled here exactly as the 3D set
 * plays it (src/stage3d/motion/heroPlan.ts heroTimeline, the clip library read from disk), and the segment active at that frame's performance time
 * names the action: walking or running (with the way he is heading, as the camera sees it), standing, looking round, turning,
 * kneeling. With no library on disk (a test's temp folder) the opening falls back to its plan reading (kitWords actionWord) and a
 * later frame says nothing, as before. Server-side (reads the clips); actionAt itself is pure given the library.
 * (Prompt wave, 2026-10-25) a FALLBACK only: the still says the hero's beat from the v2 brief first, then the take's written action
 * (kitStillPrompt.ts via stillBrief.ts heroAction); these motion words go only when neither is written.
 * (Lift wave, 2026-10-25) EXCEPT when the take plays an action whose clip names its own pose by phase (kneel, lift: clips.ts
 * ClipDef.phases): then the motion is the beat, and the still says the pose at its own frame ("bending over the piece in front of
 * them"), never the whole beat (E146: the whole lift beat drew the lifted thing in her hands on frame 0). `pose` says so.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PerformancePlan } from '../../src/stage3d/contract.ts'
import { heroTimeline } from '../../src/stage3d/motion/heroPlan.ts'
import { loadLibrary, type Library } from '../../src/stage3d/motion/library.ts'
import { hasPhases, phased, phaseWords } from '../../src/stage3d/motion/phase.ts'
import { segIndex } from '../../src/stage3d/motion/timeline.ts'
import { directionWords, headingWords, type OpeningCamera } from './kitView.ts'
import { actionWord } from './kitWords.ts'

/** segment kinds the body travels in (compile.ts leg): the gait word and a heading */
const MOVING = new Set(['start', 'travel', 'stop'])

/** one segment kind as the still's words (a clip with phases says its own; motion/phase.ts) */
function wordOf(kind: string, gait: PerformancePlan['gait']): string {
  if (MOVING.has(kind)) return gait === 'run' ? 'running' : 'walking'
  if (kind.startsWith('kneel')) return 'kneeling'
  // (stage-only) a lift segment names no piece (PathAction carries none), so the fallback names none either
  if (kind.startsWith('lift')) return 'standing'
  if (kind === 'look') return 'standing, looking round'
  if (kind === 'turn') return 'turning on the spot'
  return 'standing'
}

/** the still's motion words, and whether they are the pose at the frame of a take whose action names its own pose (they then win) */
export type StillMotion = { words: string; pose: boolean }

/** The hero's motion at performance time `t` (seconds): the phase's pose words, else the segment's word with the heading when moving. */
export function motionAt(perf: PerformancePlan, t: number, cam: OpeningCamera | null, lib: Library): StillMotion {
  const tl = heroTimeline(perf, lib), pose = hasPhases(tl)
  const at = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), tl.duration)
  const seg = tl.segs[segIndex(tl, at)]
  const own = phased(seg) ? phaseWords(seg.clip!.def, seg.tau!(at)) : ''
  if (own) return { words: own, pose }
  const word = wordOf(seg.kind, perf.gait)
  if (!MOVING.has(seg.kind) || !cam) return { words: word, pose }
  const yaw = seg.anchor(at).yaw // intent yaw: yawOf(dx, dz) = atan2(dx, dz)
  return { words: [word, directionWords(Math.sin(yaw), Math.cos(yaw), cam)].filter(Boolean).join(' '), pose }
}

/** The hero's action words at performance time `t` (motionAt's words). */
export const actionAt = (perf: PerformancePlan, t: number, cam: OpeningCamera | null, lib: Library): string => motionAt(perf, t, cam, lib).words

const libs = new Map<string, Promise<Library>>()
/** the clip library from `publicDir` (the same files the browser fetches), loaded once; null when they are not there */
export async function libraryOf(publicDir: string): Promise<Library | null> {
  let p = libs.get(publicDir)
  if (!p) {
    p = loadLibrary((u) => readFile(path.join(publicDir, ...u.split('/').filter(Boolean)), 'utf8'))
    libs.set(publicDir, p)
    p.catch(() => libs.delete(publicDir)) // a missing file is retried on the next press, never cached as an answer
  }
  return p.catch(() => null)
}

/**
 * The still's action words: from the compiled performance at `t` when the library loads, else (no library, a plan that does not
 * compile) the opening's plan reading at frame 0 and nothing later.
 */
export async function stillMotion(publicDir: string, perf: PerformancePlan, frame: number, t: number, cam: OpeningCamera | null): Promise<StillMotion> {
  const lib = await libraryOf(publicDir)
  if (lib) { try { return motionAt(perf, t, cam, lib) } catch { /* a path the motion cannot compile: the plan reading below */ } }
  return { words: frame === 0 ? [actionWord(perf), cam ? headingWords(perf.path, cam) : ''].filter(Boolean).join(' ') : '', pose: false }
}

/** stillMotion's words only */
export const stillAction = async (publicDir: string, perf: PerformancePlan, frame: number, t: number, cam: OpeningCamera | null): Promise<string> =>
  (await stillMotion(publicDir, perf, frame, t, cam)).words
