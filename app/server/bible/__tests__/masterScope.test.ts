// Join (T3a x Set step): a master draw in flight belongs to its own world. The Bible GET for another scene's set must not say a
// master is running (it used to: the running state was process-wide, so scene B's Set step showed scene A's draw and waited on it).
// The claim and the job record are the real ones; nothing is submitted, no network.
import { afterEach, describe, expect, it } from 'vitest'
import { exclusive, resetClaims } from '../../jobs/inflight.ts'
import { rig } from '../../jobs/__tests__/rig.ts'
import { isMasterLabel, MASTER_KEY, masterRunning } from '../masterDraw.ts'
import { handleBible } from '../routes.ts'
import { BibleStore } from '../store.ts'

afterEach(() => resetClaims())
const A = 'loc-2026-10-24T10-00-00-001', B = 'loc-2026-10-24T11-00-00-002'

describe('the master running state is per world', () => {
  it('a claimed draw for world A shows on A only', async () => {
    const { rt, dir } = rig()
    let open!: () => void
    const held = exclusive(MASTER_KEY, `master candidates for ${A}`, rt.store, isMasterLabel, () => new Promise<void>((r) => { open = r }))
    expect(masterRunning(rt, A)?.what).toBe(`master candidates for ${A}`)
    expect(masterRunning(rt, B)).toBeNull()
    expect(masterRunning(rt)).not.toBeNull() // unscoped: any world's (the one-at-a-time refusal still sees it)
    const ctx = { store: new BibleStore(dir), running: (w: string) => masterRunning(rt, w) }
    const get = async (world: string) => (await handleBible(ctx, 'GET', '', new URLSearchParams({ world }), null)).body as { running?: unknown }
    expect((await get(A)).running).toMatchObject({ what: `master candidates for ${A}` })
    expect((await get(B)).running).toBeNull()
    open(); await held
    expect(masterRunning(rt, A)).toBeNull()
  })

  it('a live job record for A (after a restart, no claim) shows on A only', () => {
    const { rt } = rig()
    const now = new Date().toISOString()
    rt.store.save({ id: 'job-rec-1', label: `bible-master ${A} m-20261024-1 m-20261024-2`, status: 'waiting', attempts: [], estimateCredits: 31, createdAt: now, updatedAt: now } as never)
    expect(masterRunning(rt, A)).not.toBeNull()
    expect(masterRunning(rt, B)).toBeNull()
    expect(masterRunning(rt, `${A}2`)).toBeNull() // a world id that only starts with A's is another world
  })
})
