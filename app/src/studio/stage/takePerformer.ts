// Play and Record wait for the right walk on the stage (PLAN-PER-TAKE-PERFORMANCE.md §1): Play replays a locked take's camera with
// that take's own performer, so it waits for her to be built (a take just picked loads its walk in a moment); Record films the next
// take, which starts from the scene's walk, so a take on show with another walk is set aside first and Record waits for the
// scene's performer. Nothing here plays or records on its own: each wait ends in the press it stood in for, or in nothing.
import type { Stage } from '../../labs/projection/engine/Stage'
import type { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import { takeOnShow, takeOnShowFor } from '../../labs/projection/stage3d/takeOnShow'
import type { KitPerformance } from '../../../server/stage3d/types'
import type { ScenePlan } from '../../stage3d/contract'
import { mocapPackId } from '../../stage3d/planHash'
import { setKeyOf } from '../shoot/setKey'
import { onShowPack, setTakeAside, stagePackId, waitForPack } from '../shoot/takeShow'
import { stageSetKey, waitForSet } from '../shoot/takeSetShow'
import { playTakeNow } from './takePlay'

/** Play take once the take on show's own performer and set are on the stage (at once when they are, or when the scene's are the ones). */
export async function playTakeWhenReady(engine: StageOperatorEngine, stage: Stage | null, worldId: string | null, timeoutMs?: number): Promise<boolean> {
  const want = onShowPack(worldId)
  if (want && stagePackId(stage) !== want) {
    engine.flash?.('Loading the take\'s walk…')
    if (!(await waitForPack(stage, want, timeoutMs))) return false
  }
  const s = takeOnShowFor(takeOnShow(), worldId) // and the take's own set, once it is built (a picked take's set comes on in a moment)
  if (s?.plan && s.setKey && stageSetKey(stage) !== s.setKey) {
    engine.flash?.('Loading the take\'s set…')
    if (!(await waitForSet(stage, s.setKey, timeoutMs))) return false
  }
  return playTakeNow(engine)
}

export interface RecordSceneDeps { stage: () => Stage | null; worldId: () => string | null; scenePerf: () => KitPerformance | null
  /** the scene's own set (useKit scenePlan): a take on show with another set is set aside too, and Record waits for this one */
  scenePlan?: () => ScenePlan | null; timeoutMs?: number }

/**
 * Record (every press: the button, R, the pad) films against the scene's walk and set: while a locked take with another
 * walk or another set is on show, it is set aside and the recording starts once the scene's performer and the scene's set are on
 * the stage. Returns the unwrap.
 */
export function recordOnSceneWalk(engine: StageOperatorEngine, d: RecordSceneDeps): () => void {
  const toggle = engine.toggleRecording.bind(engine)
  engine.toggleRecording = () => {
    const world = d.worldId(), scene = d.scenePerf(), plan = d.scenePlan?.() ?? null, s = takeOnShow()
    if (engine.deck.recording || engine.move || !world || !s || s.worldId !== world) return toggle()
    const otherWalk = !!scene && !!s.perf && mocapPackId(s.perf) !== mocapPackId(scene)
    const sceneKey = plan ? setKeyOf(plan) : null
    const otherSet = !!sceneKey && !!s.plan && setKeyOf(s.plan) !== sceneKey
    if (!otherWalk && !otherSet) return toggle()
    setTakeAside(world)
    engine.flash?.(otherWalk ? 'Loading the scene\'s walk…' : 'Loading the scene\'s set…')
    const walk = otherWalk && scene ? waitForPack(d.stage(), mocapPackId(scene), d.timeoutMs) : Promise.resolve(true)
    void walk.then((ok) => ok && waitForSet(d.stage(), otherSet ? sceneKey : null, d.timeoutMs))
      .then((ok) => { if (ok && !engine.deck.recording) toggle() })
  }
  return () => { engine.toggleRecording = toggle }
}
