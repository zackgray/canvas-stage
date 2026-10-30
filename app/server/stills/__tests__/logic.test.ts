import { describe, expect, it } from 'vitest'
import { exportFiles, findSourcePrompt, folderTime, isExportFolder } from '../exports.ts'
import { centsDelta, creditsFor, formatRow, redact } from '../ledger.ts'
import { charactersInstruction, renderInstruction, tidy } from '../prompts.ts'
import { isStillId, newStillId, parseRequest, planJob } from '../request.ts'
import type { StillRecord } from '../types.ts'

const VIEW = 'view-2026-10-17T19-40-10'

describe('prompts', () => {
  it('render names the scene, keeps the camera, fills holes, bans text/badges', () => {
    const p = renderInstruction('a bank at sunset, ')
    expect(p).toMatch(/^Turn this rough 3D render into a real photograph\. Scene: a bank at sunset\. Keep/)
    expect(p).toMatch(/Keep the exact camera angle/)
    expect(p).toMatch(/magenta or empty areas/)
    expect(p).toMatch(/No readable text/)
  })
  it('render without a scene still reads as a sentence', () => {
    expect(renderInstruction('  ')).toMatch(/^Turn this rough 3D render into a real photograph\. Keep/)
  })
  it('characters starts with the preserve clause and wraps the direction', () => {
    const p = charactersInstruction('three masked robbers sprint down the steps.')
    expect(p.startsWith('Keep the building, the street, the camera angle')).toBe(true)
    expect(p).toMatch(/Add: three masked robbers sprint down the steps\. /)
    expect(() => charactersInstruction('  ')).toThrow()
  })
  it('tidy collapses whitespace and trailing punctuation', () => {
    expect(tidy(' a\n b ;. ')).toBe('a b')
  })
})

describe('exports', () => {
  it('accepts only view-/clip- stamp folders (also the path-safety check)', () => {
    expect(isExportFolder(VIEW)).toBe(true)
    expect(isExportFolder('clip-2026-10-17T17-17-49')).toBe(true)
    for (const bad of ['../x', 'view-2026-10-17T19-40-10/..', 'stills', 'view-x', '']) expect(isExportFolder(bad)).toBe(false)
  })
  it('picks the colour view and hole mask per export kind', () => {
    expect(exportFiles(VIEW, ['color.png', 'mask.png', 'depth.png'])).toEqual({ kind: 'view', color: 'color.png', mask: 'mask.png', depth: 'depth.png' })
    expect(exportFiles(VIEW, ['color.png'])).toEqual({ kind: 'view', color: 'color.png', mask: null, depth: null })
    expect(exportFiles('clip-2026-10-17T17-17-49', ['color_000.png', 'mask_000.png', 'mask_072.png', 'depth']))
      .toEqual({ kind: 'clip', color: 'color_000.png', mask: 'mask_000.png', depth: 'depth/depth_000.png' })
    expect(exportFiles(VIEW, ['depth.png'])).toBeNull()
  })
  it('folder stamp -> ISO time', () => {
    expect(folderTime(VIEW)).toBe('2026-10-17T19:40:10Z')
  })
  it('finds the source prompt by exact id, then by the unprefixed shot id', () => {
    const m = [{ shots: [{ id: 'wide', prompt: 'P-wide' }] }, { shots: [{ id: 'e2/odd', prompt: 'P-odd' }] }]
    expect(findSourcePrompt('e2/wide#moge-2-vitl', m)).toBe('P-wide')
    expect(findSourcePrompt('e2/odd#x', m)).toBe('P-odd')
    expect(findSourcePrompt('synthetic', m)).toBeNull()
    expect(findSourcePrompt(null, m)).toBeNull()
  })
})

describe('requests', () => {
  const base = { kind: 'render', folder: VIEW, mode: 'quality', seed: 5 }
  it('normalises a render request', () => {
    expect(parseRequest({ ...base, variant: 'holes', scenePrompt: ' bank ' })).toEqual({ ...base, variant: 'holes', scenePrompt: 'bank' })
    expect(parseRequest({ ...base, mode: 'anything' }).mode).toBe('quality')
    expect(parseRequest(base).variant).toBe('locked') // structure-locked is the default
    expect(parseRequest({ ...base, variant: 'full' }).variant).toBe('full')
  })
  it('rejects unknown folders, bad seeds, empty directions, bad parents', () => {
    expect(() => parseRequest({ ...base, folder: '../../.env' })).toThrow(/folder/)
    expect(() => parseRequest({ ...base, seed: -1 })).toThrow(/seed/)
    expect(() => parseRequest({ ...base, seed: 1.5 })).toThrow(/seed/)
    expect(() => parseRequest({ ...base, kind: 'characters', parentId: 'render-2026-10-17T19-40-10-123', direction: ' ' })).toThrow(/direction/)
    expect(() => parseRequest({ ...base, kind: 'characters', parentId: '../x', direction: 'a' })).toThrow(/parentId/)
    expect(() => parseRequest({ ...base, kind: 'nope' })).toThrow(/kind/)
  })
  it('still ids are filename-safe and round-trip the validator', () => {
    const id = newStillId('render', new Date('2026-10-17T19:40:10.123Z'))
    expect(id).toBe('render-2026-10-17T19-40-10-123')
    expect(isStillId(id)).toBe(true)
  })
  it('plans render, holes and characters jobs', () => {
    const exp = { color: 'color.png', mask: 'mask.png' }
    expect(planJob(parseRequest({ ...base, variant: 'full' }), exp)).toMatchObject({ variant: 'full', input: `${VIEW}/color.png`, mask: null })
    expect(planJob(parseRequest({ ...base, variant: 'holes' }), exp)).toMatchObject({ variant: 'holes', mask: `${VIEW}/mask.png` })
    expect(() => planJob(parseRequest({ ...base, variant: 'holes' }), { color: 'color.png', mask: null })).toThrow(/mask/)
    const parent = { id: 'render-2026-10-17T19-40-10-123', folder: VIEW } as StillRecord
    const req = parseRequest({ ...base, kind: 'characters', parentId: parent.id, direction: 'a car' })
    expect(planJob(req, exp, parent)).toMatchObject({ variant: 'full', input: `${VIEW}/stills/${parent.id}.png` })
    expect(() => planJob(req, exp)).toThrow(/parent/)
  })
})

describe('ledger', () => {
  it('redacts keys', () => {
    expect(redact('bad key comfyui-abc_DEF-123 here')).toBe('bad key comfyui-REDACTED here')
  })
  it('balance delta and credits', () => {
    expect(centsDelta(1000, 996.5)).toBe(3.5)
    expect(centsDelta(null, 3)).toBeNull()
    expect(creditsFor(3.5)).toBe(7)
  })
  it('formats rows in the credit-log table shape, escaping pipes', () => {
    const sub = formatRow({ workflow: 'w', jobId: 'j', status: 'submitted', note: 'a|b' }, 'T')
    expect(sub).toBe('| T | STILLS | w | j | submitted |  |  |  |  | a/b |')
    const done = formatRow({ workflow: 'w', jobId: 'j', status: 'succeeded', wallSeconds: 30, execSeconds: 20, deltaCents: 2, note: '' }, 'T')
    expect(done).toBe('| T | STILLS | w | j | succeeded | 30 | 20 | 2 | 4 |  |')
    expect(done.split('|').length).toBe(12)
  })
})
