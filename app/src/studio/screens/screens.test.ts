import { describe, expect, it } from 'vitest'
import type { CutTake } from '../../labs/projection/cut'
import { typingTarget } from '../useStudioKeys'
import { newestPack } from './useExportCut'

const take = (stamp: string): CutTake => ({ id: stamp, warpFolder: 'warp-x', kind: 'final', file: 'f.mp4', url: '/f.mp4', width: 1, height: 1, frames: 97, sourceStart: 0, hasAudio: true, stamp })

describe('export: the newest performance is the default', () => {
  it('picks the pack whose newest render is latest, whatever the listing order', () => {
    expect(newestPack([{ packId: 'old', takes: [take('2026-10-19')] }, { packId: 'new', takes: [take('2026-10-18'), take('2026-10-21')] }, { packId: 'mid', takes: [take('2026-10-20')] }])).toBe('new')
    expect(newestPack([])).toBeNull()
  })
})

describe('arrow keys', () => {
  it('are not ours while typing', () => {
    expect(typingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(typingTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true)
    expect(typingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(typingTarget({ tagName: 'BODY' } as unknown as EventTarget)).toBe(false)
  })
})
