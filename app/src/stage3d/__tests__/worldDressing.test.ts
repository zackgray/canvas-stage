// A plan that sets no puddles or tufts gets plain flat ground (the starting world is empty): the world's ground
// dressing appears only when the plan asks for it.
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../contract.ts'
import { buildWorld } from '../world.ts'

const plan = (over: Partial<ScenePlan> = {}): ScenePlan => ({ seed: 1, sky: { url: '/lab-assets/sky/procedural' }, kit: [], ...over })

function dressing(p: ScenePlan): { puddles: number; tufts: number } {
  const w = buildWorld(p)
  try {
    let puddles = 0, tufts = 0
    w.scene.traverse((o) => {
      if ((o as { geometry?: { type?: string } }).geometry?.type === 'CircleGeometry') puddles++
      if ((o as { isInstancedMesh?: boolean }).isInstancedMesh) tufts += (o as unknown as { count: number }).count
    })
    return { puddles, tufts }
  } finally { w.dispose() }
}

describe('ground dressing', () => {
  it('a plan without puddles or tufts gets plain flat ground', () => {
    expect(dressing(plan())).toEqual({ puddles: 0, tufts: 0 })
  })

  it('a plan that sets them gets exactly what it set', () => {
    expect(dressing(plan({ puddles: 3, tufts: 5 }))).toEqual({ puddles: 3, tufts: 5 })
  })
})
