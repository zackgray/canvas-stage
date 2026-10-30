import { describe, expect, it } from 'vitest'
import { HOME_HASH, landingRoute, parseStudioRoute, sceneHash, stageStep, STAGES, studioHash } from './route'

const SC = 'sc-20261024101500-ab12'

describe('studio routes', () => {
  it('reads #/studio/<stage> with no scene named, which is Home', () => {
    expect(parseStudioRoute('studio')).toEqual({ stage: 'stage', scene: null })
    expect(parseStudioRoute('studio/')).toEqual({ stage: 'stage', scene: null })
    expect(parseStudioRoute('studio/render')).toEqual({ stage: 'render', scene: null })
    expect(parseStudioRoute('studio/export?x=1')).toEqual({ stage: 'export', scene: null })
  })

  it('reads #/studio/<scene>/<stage>: the scene the stages show, the Stage by default', () => {
    expect(parseStudioRoute(`studio/${SC}`)).toEqual({ stage: 'stage', scene: SC })
    expect(parseStudioRoute(`studio/${SC}/stage`)).toEqual({ stage: 'stage', scene: SC })
    expect(parseStudioRoute(`studio/${SC}/render?x=1`)).toEqual({ stage: 'render', scene: SC })
    for (const s of STAGES) expect(parseStudioRoute(sceneHash(SC, s).replace(/^#\/?/, ''))).toEqual({ stage: s, scene: SC })
    expect(sceneHash(SC)).toBe(`#/studio/${SC}/stage`)
    expect(HOME_HASH).toBe('#/studio')
  })

  it('every old screen hash (bare scene, scene, brief, board, set, shoot) opens the Stage of that scene, address kept (no redirect)', () => {
    for (const tail of ['', '/scene', '/brief', '/board', '/set', '/shoot', '/board?x=1']) {
      expect(parseStudioRoute(`studio/${SC}${tail}`), tail).toEqual({ stage: 'stage', scene: SC })
      expect(landingRoute(`studio/${SC}${tail}`), tail).toEqual({ route: { stage: 'stage', scene: SC }, redirect: null })
    }
  })

  it('claims no other path', () => {
    for (const p of ['', 'app', 'app/shoot', 'projection', 'studio/develop', 'studio/cut', 'studio/shoot/x', 'studio/blocking', 'studio/world',
      `studio/${SC}/world`, `studio/${SC}/shoot/x`, 'studio/sc-bad/shoot', 'studio/../shoot']) expect(parseStudioRoute(p), p).toBeNull()
  })

  it('a stale or retired hash lands on Home and rewrites the address; a live one is left alone', () => {
    for (const p of ['studio/world', 'studio/cast', 'studio/perform', 'studio/brief', 'studio/scene', 'app/develop', 'app/shoot?dev=1', 'projection', '', 'nonsense/x']) {
      expect(landingRoute(p), p).toEqual({ route: { stage: 'stage', scene: null }, redirect: HOME_HASH })
    }
    for (const s of STAGES) expect(landingRoute(`studio/${s}`)).toEqual({ route: { stage: s, scene: null }, redirect: null })
    expect(landingRoute(`studio/${SC}/stage`)).toEqual({ route: { stage: 'stage', scene: SC }, redirect: null })
  })

  it('the strip is Stage, Render, Export, round-tripped in order and stepped between', () => {
    expect(STAGES).toEqual(['stage', 'render', 'export'])
    for (const s of STAGES) expect(parseStudioRoute(studioHash(s).replace(/^#\/?/, ''))).toEqual({ stage: s, scene: null })
    expect(studioHash('stage', SC)).toBe(`#/studio/${SC}/stage`)
    expect(stageStep('stage', -1)).toBeNull()
    expect(stageStep('stage', 1)).toBe('render')
    expect(stageStep('render', -1)).toBe('stage')
    expect(stageStep('export', 1)).toBeNull()
  })
})
