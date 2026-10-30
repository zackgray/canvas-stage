// The set on the stage, for the presses that must wait for a take's set (PLAN-PER-TAKE-SET.md S3): Draw / Prepare wait for the
// take's own set to be built before preparing its frames, Record waits for the scene's set once the take is set aside. The key is
// the set key (setKey.ts) of the plan the stage's kit layer shows now; tolerant of a stub stage with no kit.
import type { Stage } from '../../labs/projection/engine/Stage'
import { setKeyOf } from './setKey'

type KitLike = { plan?: unknown; ready?: Promise<unknown> } | null | undefined

/** the set key of the plan on the stage now (null = no kit set on the stage) */
export const stageSetKey = (stage: Stage | null | undefined): string | null =>
  setKeyOf(((stage as { kit?: KitLike } | null | undefined)?.kit)?.plan ?? null)

/** Resolve true once the stage shows the set `setKey` and its pieces have loaded (polled; a rebuild takes up to a couple of
 *  seconds), false after `timeoutMs`. A null key has nothing to wait for. */
export async function waitForSet(stage: Stage | null, setKey: string | null, timeoutMs = 20000, stepMs = 50): Promise<boolean> {
  if (!setKey) return true
  const end = Date.now() + timeoutMs
  for (;;) {
    if (stage && stageSetKey(stage) === setKey) {
      const kit = (stage as { kit?: KitLike }).kit
      await kit?.ready?.catch(() => {})
      if (stageSetKey(stage) === setKey) return true // still the same set once its pieces are in
    }
    if (Date.now() >= end) return false
    await new Promise((r) => setTimeout(r, stepMs))
  }
}
