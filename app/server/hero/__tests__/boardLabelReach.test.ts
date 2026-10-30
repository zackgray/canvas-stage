// Layout wave L5: a board prop's words reach the hero still after planning. The Board edit writes the kit item's label through
// the piece route (free; the client side is pieceKitLabel.test.tsx); the still's free press preview reads the kit label, so the
// new words are what "Draw this frame" would send. Fake Cloud, temp files: nothing paid, nothing drawn.
import { describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { SET_CHANGED } from '../../../src/shared/setApproval.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { approveSetOnDisk } from '../../bible/__tests__/approveFixture.ts'
import { setRefusalFor } from '../../bible/setGate.ts'
import { KitStore } from '../../stage3d/store.ts'
import { kitInfo, kitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

/** the spike's master view on BATTLEFIELD (chest height, 24 mm, down -z): it sees the palisade (promptChain.test.ts's LOOK) */
const LOOK = { position: [0.6, 1.5, -7.7] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24 }

describe("a board prop's new words reach the hero still after planning (L5)", () => {
  it('the label the Board edit saves is what the free press preview names; the edit re-asks the free set approval', async () => {
    const t = kitTake({ bible: {}, take: { samples: [{ t: 0, ...LOOK, focus: 6 }, { t: 0.5, ...LOOK }, { t: 1, ...LOOK }], focal: 24, action: '' } })
    const hero = mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
    const preview = () => hero.raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE }) })
    const promptOf = (r: { body: unknown }) => (r.body as unknown as StillPreviewResponse).prompt
    const before = await preview()
    expect(before.status).toBe(200)
    expect(promptOf(before)).not.toMatch(/hawthorn/)
    // the Board edit's save: the piece route's label call with the piece's index and kind (what the edit's debounced save sends)
    const store = new KitStore(t.pub)
    const plan = store.read(t.kit.id).plan
    const index = plan.kit.findIndex((k) => k.kind === 'palisade')
    store.movePiece(t.kit.id, { index, kind: 'palisade', label: 'a tall hawthorn hedge' })
    expect(setRefusalFor(t.pub, t.kit.id)).toBe(SET_CHANGED) // the label re-hashes the plan: the set approval is asked again
    approveSetOnDisk(t.pub, t.kit.id) // free: approve the set as it now stands
    const after = await preview()
    expect(after.status).toBe(200)
    expect(promptOf(after)).toMatch(/a tall hawthorn hedge/) // the new words, not the stale board line
    expect(t.jobs.submits).toBe(0) // the preview is free: no job, no credits
  })
})
