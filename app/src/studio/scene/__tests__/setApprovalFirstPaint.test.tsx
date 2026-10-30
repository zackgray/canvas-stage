// @vitest-environment jsdom
// The set's approval line on its first paint: the Set panel remounts every time a pick is cleared, and its first render used to
// say "Happy with the set as it stands? Approve the set" before the read landed, then flip to "The set is approved." Now a fresh
// world says nothing until it is read, and a remount shows the approval this page last read at once.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BibleResponse } from '../../../shared/bibleContract'
import { ApproveSet } from '../SetApprove'
import { useScene } from '../useScene'
import { fakeApi } from './fakes'

afterEach(cleanup)

function Panel({ worldId, api }: { worldId: string; api: ReturnType<typeof fakeApi>['api'] }) {
  return <ApproveSet s={useScene(worldId, api)} />
}

/** the fake api with its read held until `release` */
function held(approved: boolean) {
  const f = fakeApi(null, null, { approved })
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const get = f.api.get
  f.api.get = Object.assign(async (id?: string): Promise<BibleResponse> => { await gate; return get(id) }, { mock: get.mock }) as typeof get
  return { api: f.api, release }
}

describe('the set approval on first paint', () => {
  it('a world not read yet says nothing about approving; the read then shows the true state', async () => {
    const { api, release } = held(true)
    render(<Panel worldId="loc-first" api={api} />)
    expect(screen.queryByTestId('set-approval-none')).toBeNull()
    expect(screen.queryByTestId('set-approved')).toBeNull()
    await act(async () => { release() })
    expect((await screen.findByTestId('set-approved')).textContent).toBe('The set is approved.')
  })

  it('a remount (the pick cleared) shows the approval at once, never the old Approve the set line', async () => {
    const first = held(true)
    first.release()
    render(<Panel worldId="loc-again" api={first.api} />)
    await screen.findByTestId('set-approved')
    cleanup()
    const again = held(true) // the re-read is slow: the remembered answer shows meanwhile
    render(<Panel worldId="loc-again" api={again.api} />)
    expect(screen.getByTestId('set-approved')).toBeTruthy()
    expect(screen.queryByTestId('set-approval-none')).toBeNull()
    await act(async () => { again.release() })
    expect(screen.getByTestId('set-approved')).toBeTruthy()
  })

  it('a set never approved still offers Approve the set once it is read', async () => {
    const { api, release } = held(false)
    render(<Panel worldId="loc-none" api={api} />)
    expect(screen.queryByTestId('set-approval-none')).toBeNull()
    await act(async () => { release() })
    expect(await screen.findByTestId('set-approval-none')).toBeTruthy()
  })
})
