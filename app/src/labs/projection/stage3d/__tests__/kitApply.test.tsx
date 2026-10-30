// @vitest-environment jsdom
// The blink fix: every set edit re-reads the world (KIT_CHANGED). A plan that differs only in where a piece stands, turns, sizes or
// lifts (or the mark) keeps the same kit layer and moves the piece in place, so no pane loses its pieces while a rebuild loads them
// again; a structural change (a piece added or swapped) still rebuilds. The pick's roots follow the applied plan.
import { act, renderHook, waitFor } from '@testing-library/react'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../stage3d/contract'
import { BATTLEFIELD } from '../../../../stage3d/presets'
import { buildWorld, KIT_INDEX } from '../../../../stage3d/world'
import type { Stage } from '../../engine/Stage'
import { KIT_CHANGED } from '../kitApi'
import { KitLayer, structuralKey } from '../KitLayer'
import { KitPick } from '../kitPick'
import { useKit } from '../useKit'

const ID = 'loc-2026-10-23T03-00-01-000'
const BASE: ScenePlan = { ...BATTLEFIELD, tufts: 10, puddles: 2 }
const turned = (deg: number): ScenePlan => ({ ...BASE, kit: BASE.kit.map((k, i) => (i === 0 ? { ...k, yawDeg: (k.yawDeg ?? 0) + deg } : k)) })
const rootOf = (layer: KitLayer, i: number) => layer.group.children.find((o) => o.userData[KIT_INDEX] === i)!

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('structuralKey', () => {
  it('ignores place, turn, size, lift, words and the mark; a kind change is structural', () => {
    const moved: ScenePlan = { ...BASE, mark: { at: [1, -9], yawDeg: 40 }, kit: BASE.kit.map((k, i) => (i === 0 ? { ...k, at: [k.at[0] + 1, k.at[1]], yawDeg: 33, scale: 1.2, lift: 0.3, label: 'x' } : k)) }
    expect(structuralKey(moved)).toBe(structuralKey(BASE))
    expect(structuralKey({ ...BASE, kit: BASE.kit.map((k, i) => (i === 0 ? { ...k, kind: 'crate' } : k)) })).not.toBe(structuralKey(BASE))
    expect(structuralKey({ ...BASE, kit: BASE.kit.slice(1) })).not.toBe(structuralKey(BASE))
  })
})

describe('useKit applies a turn in place', () => {
  it('two plans differing only in one piece\'s yawDeg keep the same layer, and the root turns', async () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (_u, onLoad) { const t = new THREE.Texture() as THREE.Texture<HTMLImageElement>; onLoad?.(t); return t })
    let plan = BASE
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: ID, plan, perf: { path: [[0, 0], [0, 0.2]], stand: true }, description: '', still: null, masterDepth: null, createdAt: '' }))))
    const stage = { kit: null as unknown, setKit(k: unknown) { this.kit = k },
      world: { addClockHook: () => () => {}, syncClock() {} } }
    const setKit = vi.spyOn(stage, 'setKit')
    const shot = { id: ID, kind: 'kit' } as never
    const { result } = renderHook(() => useKit(stage as unknown as Stage, shot))
    await waitFor(() => expect(result.current.layer).not.toBeNull())
    const layer = result.current.layer!
    const before = rootOf(layer, 0).rotation.y
    plan = turned(90)
    act(() => { window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: ID } })) })
    await waitFor(() => expect(result.current.world?.plan).toEqual(plan))
    expect(result.current.layer).toBe(layer)
    expect(setKit).toHaveBeenCalledTimes(1)
    expect(layer.plan).toEqual(plan)
    expect(rootOf(layer, 0).rotation.y - before).toBeCloseTo(Math.PI / 2, 6)
    plan = { ...BASE, kit: BASE.kit.slice(1) } // a removed piece is structural: a new layer
    act(() => { window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: ID } })) })
    await waitFor(() => expect(result.current.layer).not.toBe(layer))
  })
})

describe('the pick follows an applied plan', () => {
  it('the turned piece\'s pose reads the new yaw, and the mark stand-in moves with the mark', () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (_u, onLoad) { const t = new THREE.Texture() as THREE.Texture<HTMLImageElement>; onLoad?.(t); return t })
    const layer = new KitLayer(buildWorld(BASE), ID, BASE, { path: [[0, 0], [0, 0.2]] })
    const pick = new KitPick(layer)
    const yaw0 = pick.poseOf({ t: 'piece', index: 0 })!.yaw
    layer.applyPlan({ ...turned(30), mark: { at: [2, -9], yawDeg: 45 } })
    expect(pick.poseOf({ t: 'piece', index: 0 })!.yaw).toBeCloseTo(yaw0 + 30, 6)
    expect(pick.poseOf({ t: 'mark' })).toEqual({ at: [2, -9], yaw: 45 })
    expect(pick.figure.position.x).toBe(2)
    pick.dispose()
    layer.dispose()
  })
})
