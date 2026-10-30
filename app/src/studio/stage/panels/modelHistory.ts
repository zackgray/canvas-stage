// The prop's model history (object card wave): one record per 3D build that PLACED, kept per set in this browser (like the paid
// draws' NEW cards, freshLooks.ts). Each record names the run the pieces route wrote, the picture the model was built from and the
// words at that moment, so the card can say 'the model no longer matches these words', offer 'Rebuild from this picture' at its
// price, and 'Go back to this model' — a free re-place of that run's mesh through the existing complete route, never a new build.
export interface BuiltModel {
  /** the pieces route's run id (p-…); the tile's placed piece names the run that is in the set now */
  run: string
  /** the picture the model was built from */
  from: string
  /** the words at the build, for the mismatch note */
  text: string
  /** the run's mesh file, for the card's grey 3D preview */
  url: string
  at: string
}

export type ModelHistory = Record<string, BuiltModel[]>

const KEY = (worldId: string) => `canvas-stage.stage-models.${worldId}`

/** the set's kept build records by prop tag ({} when none, unreadable, or no world) */
export function readModels(worldId: string | null): ModelHistory {
  if (!worldId) return {}
  try {
    const v = JSON.parse(localStorage.getItem(KEY(worldId)) ?? 'null') as ModelHistory | null
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

export function writeModels(worldId: string | null, models: ModelHistory): void {
  if (!worldId) return
  try { localStorage.setItem(KEY(worldId), JSON.stringify(models)) } catch { /* storage off: this page only */ }
}

/** one record per run, newest first; a run is written once (changing the picture after a build never rewrites history) */
export function withModel(worldId: string | null, tag: string, m: BuiltModel): ModelHistory {
  const all = readModels(worldId)
  const list = all[tag] ?? []
  if (list.some((x) => x.run === m.run)) return all
  const next = { ...all, [tag]: [m, ...list] }
  writeModels(worldId, next)
  return next
}

/** the record of the model that is in the set now (the placed run), when history knows it */
export const currentModel = (list: readonly BuiltModel[] | undefined, placedRun: string | null | undefined): BuiltModel | null =>
  (placedRun && list?.find((m) => m.run === placedRun)) || null
