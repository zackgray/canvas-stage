/** The export request body: {packId, segments:[{takeId, in, out}], audio?: 'take'|'performance'}. Shape only; contiguity and coverage are validateCut's. */
import type { CutSegment } from '../../src/labs/projection/cut/model.ts'
import { CutError } from './job.ts'
import { TAKE_ID } from './takes.ts'

export interface CutRequest { packId: string; segments: CutSegment[]; audio?: 'take' | 'performance' }

export function parseCutRequest(v: unknown): CutRequest {
  const o = (v ?? {}) as { packId?: unknown; segments?: unknown; audio?: unknown }
  if (typeof o.packId !== 'string' || !/^[\w-]+$/.test(o.packId)) throw new CutError(400, 'packId must be a performance id')
  if (!Array.isArray(o.segments) || o.segments.length < 1 || o.segments.length > 64) throw new CutError(400, 'segments must be a list of 1 to 64')
  const segments = o.segments.map((s: { takeId?: unknown; in?: unknown; out?: unknown }, i: number): CutSegment => {
    if (typeof s?.takeId !== 'string' || !TAKE_ID.test(s.takeId)) throw new CutError(400, `segment ${i + 1}: bad take id`)
    if (typeof s.in !== 'number' || typeof s.out !== 'number') throw new CutError(400, `segment ${i + 1}: in and out must be frame numbers`)
    return { takeId: s.takeId, in: s.in, out: s.out }
  })
  if (o.audio !== undefined && o.audio !== 'take' && o.audio !== 'performance') throw new CutError(400, "audio must be 'take' or 'performance'")
  return { packId: o.packId, segments, ...(o.audio ? { audio: o.audio } : {}) }
}
