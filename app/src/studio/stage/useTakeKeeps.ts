// What each take of the world keeps, against the scene as it stands now (takeKeeps.ts): the take card's summary and the "lock again"
// badge on the card and in the take list. Read-only; nothing here writes a take.
import { useMemo } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { TakeRecord } from '../../shared/shotContract'
import { mocapPackId } from '../../stage3d/planHash'
import { setKeyOf } from '../shoot/setKey'
import { takeKeeps, type TakeKeeps } from '../shoot/takeKeeps'
import { useLockedTakes } from '../shoot/worldTakes'

/** the scene's walk and set as they stand (the scene's, never the take on show's); null = not read yet */
export function useSceneNow(lab: ProjectionLabState): { packId: string | null; setKey: string | null } | null {
  const perf = lab.kit?.world?.perf ?? null
  const plan = lab.kit?.scenePlan ?? null
  return useMemo(() => (perf || plan ? { packId: perf ? mocapPackId(perf) : null, setKey: setKeyOf(plan) } : null), [perf, plan])
}

/** one take's keeps (null = no such take among the world's locked takes) */
export function useTakeKeeps(lab: ProjectionLabState, takeId: string | null): { take: TakeRecord; keeps: TakeKeeps } | null {
  const takes = useLockedTakes(lab.kit?.id ?? lab.s.source ?? null)
  const scene = useSceneNow(lab)
  const take = takeId ? takes.find((t) => t.id === takeId) : undefined
  return useMemo(() => (take ? { take, keeps: takeKeeps(take, scene) } : null), [take, scene])
}

/** every locked take's keeps by id (the take list's badges) */
export function useAllKeeps(lab: ProjectionLabState): Map<string, TakeKeeps> {
  const takes = useLockedTakes(lab.kit?.id ?? lab.s.source ?? null)
  const scene = useSceneNow(lab)
  return useMemo(() => new Map(takes.map((t) => [t.id, takeKeeps(t, scene)])), [takes, scene])
}
