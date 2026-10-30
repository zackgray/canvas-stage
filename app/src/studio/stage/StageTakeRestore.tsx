// The Stage finds its locked take again after a reload in every view (pass 3): the Camera panel's lock block did this alone, so
// a Stage opened in Free view showed "record the shot" and a grey Render while a take was locked on disk. No UI; the same rule
// as the lock block's (useRestoreTake): only while nothing new is recorded, and an unlocked recording clears it again.
// Also (per-take performance) the scene's walk as read: the first change to it while a locked take is on show sets that take
// aside (takeShow.ts noteScenePerf); a recast is no change to the walk.
import { useEffect } from 'react'
import { useTicker } from '../../labs/controller/ui/useTicker'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { useCurrentTakeId, useMemoryTakeLocked } from '../shoot/currentTake'
import { noteScenePerf } from '../shoot/takeShow'
import { useLockedTakes, useRestoreTake } from '../shoot/worldTakes'

export function StageTakeRestore({ lab }: { lab: ProjectionLabState }) {
  useTicker(2) // the recorded take lives in the mutable engine: sample it
  const takes = useLockedTakes(lab.s.source ?? null)
  const cur = useCurrentTakeId()
  const memoryLocked = useMemoryTakeLocked()
  useRestoreTake(lab.op.engine.deck.take, memoryLocked ? cur : null, takes)
  const world = lab.kit?.world ?? null
  useEffect(() => { if (world) noteScenePerf(world.id, world.perf) }, [world?.id, world?.perf]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
