// The project's saved cast cards, which Scene offers as people in its library. Read-only: Scene's own pieces make new
// characters through the cast routes (briefApi.ts); nothing here starts a job.
import { useMemo } from 'react'
import type { CardPayload, Ingredient } from '../../project/model.ts'
import { useProject } from '../../project/useProject.ts'

export interface Cast { cards: Ingredient<CardPayload>[] }

export function useCastCards(): Cast {
  const { project } = useProject()
  const cards = useMemo(() => project?.ingredients.cast ?? [], [project])
  return useMemo(() => ({ cards }), [cards])
}
