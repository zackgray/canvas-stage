// Cast across a restart: busy is read from the runner's records, so a restarted endpoint still refuses a second paid click.
import { afterEach, describe, expect, it } from 'vitest'
import { fakeJob, gate } from '../../jobs/__tests__/rig.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { DESC, setup } from './cast-rig.ts'

afterEach(() => resetClaims())

describe('Cast: busy survives a restart', () => {
  it('a restarted endpoint refuses a second paid click while the first job waits', async () => {
    const g = gate()
    const s = setup(100, { submit: () => fakeJob({ wait: g.wait, outputs: 1 }) })
    const first = s.post(s.cast, 'candidates', { cardId: 'rosa', description: DESC })
    while (!s.store().list().some((r) => r.status === 'waiting')) await new Promise((r) => setTimeout(r, 5))

    const after = s.restarted() // new module state, new runtime and lock, same disk
    expect((await s.post(after, 'candidates', { cardId: 'rosa', description: DESC })).status).toBe(409)
    resetClaims()
    expect((await s.post(after, 'candidates', { cardId: 'dee', description: DESC })).status).toBe(409)
    expect(s.t.submits).toBe(1)
    g.open()
    expect((await first).status).toBe(200)
  })
})
