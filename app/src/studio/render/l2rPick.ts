import type { TakeRecord } from '../../shared/shotContract'

/**
 * The take Render opens on: Shoot's current take (the one its lock block just locked or found locked), else the most recently
 * LOCKED take of the world (`takes` is newest lock first). Never "the newest with clay": a just-locked take whose frames are
 * still being prepared must not lose to an older, longer (3x the price) take that already has them (QA 2026-10-25).
 */
export function defaultTake(takes: TakeRecord[], shoot: string | null): string | null {
  const byLock = [...takes].sort((a, b) => b.lockedAt.localeCompare(a.lockedAt))
  return byLock.find((t) => t.id === shoot)?.id ?? byLock[0]?.id ?? null
}

