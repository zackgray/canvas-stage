/**
 * What GET /__lab/l2r?take= adds for the Render screen beyond the take's inputs: the approved mid / end keyframes (with why a
 * stale one would be refused), the chip strip (every bind, then the Bible's references) and the Bible's grade target. Free, read-only.
 */
import { bibleMovedWhy } from '../../src/shared/bibleContract.ts'
import type { L2RStatusExtra } from '../../src/studio/render/l2rExtra.ts'
import { bibleChips, sentChips } from './chips.ts'
import { gradeTarget } from './grade.ts'
import type { Readiness } from './inputs.ts'
import { keyframeChoices } from './keyframes.ts'
import { takeBible as bibleOfTake } from '../takes/words.ts'
import { publicUrl } from './spec.ts'
import { modelClayVideo } from '../pieces/modelClay.ts'

export function sentChipsFor(publicDir: string, r: Readiness): L2RStatusExtra {
  const take = r.take!
  const bible = bibleOfTake(publicDir, take) // the take's own words stand as the prompt (takes/words.ts)
  const keyframes = keyframeChoices(publicDir, take, bible)
  // the strip shows what a render sends now: the clay, the opening still, and each fresh keyframe (a stale one is shown, flagged, in `keyframes`)
  const fresh = (n: 'mid' | 'end') => (keyframes[n] && !keyframes[n]!.stale ? keyframes[n]! : null)
  const mid = fresh('mid'), end = fresh('end')
  const chips = [
    // the layout chip is the clay a render sends (the massing clay when current, run.ts), never the other one
    ...sentChips({ clay: modelClayVideo(publicDir, take, '').url ?? publicUrl(take.id, 'clay', 'clay.mp4'), opening: r.still?.png ?? '', mid: mid?.still.png, end: end?.still.png }, { mid: mid?.frame, end: end?.frame }),
    ...bibleChips(bible),
  ]
  // M3: the take records the Bible it was locked against; a newer one is worth saying, never a reason to refuse (the take is geometry)
  const why = bibleMovedWhy(take.bibleVersion, bible)
  const takeBible = why ? `This take was locked ${why}. The render uses the current scene sheet's words and grade.` : null
  return { keyframes, chips, gradeTarget: gradeTarget(bible), takeBible }
}

