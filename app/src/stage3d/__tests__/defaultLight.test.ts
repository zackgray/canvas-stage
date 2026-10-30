// One default 3D light: the viewport key light and the sky's sun disc sit at planRules DEFAULT_KEY_DIR whatever the
// plan's light.keyDir says. The planner's sun control is gone; the field stays readable and only ever gains fields.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../contract.ts'
import { DEFAULT_KEY_DIR } from '../planRules.ts'
import { skyParams } from '../sky.ts'
import { buildWorld } from '../world.ts'

const plan = (keyDir: [number, number]): ScenePlan => ({ seed: 1, sentence: 'noon', sky: { url: '/lab-assets/sky/procedural' }, kit: [], light: { keyDir } })

describe('the one default 3D light', () => {
  it('the key light stands at the default direction whatever the plan says', () => {
    for (const keyDir of [[20, 8], [90, 60]] as [number, number][]) {
      const w = buildWorld(plan(keyDir))
      try {
        const key = w.scene.children.find((c): c is THREE.DirectionalLight => (c as THREE.DirectionalLight).isDirectionalLight)!
        const [ky, ke] = DEFAULT_KEY_DIR
        expect(key.position.x).toBeCloseTo(Math.sin((ky * Math.PI) / 180) * 50, 5)
        expect(key.position.y).toBeCloseTo(Math.tan((ke * Math.PI) / 180) * 50, 5)
        expect(key.position.z).toBeCloseTo(-Math.cos((ky * Math.PI) / 180) * 50, 5)
      } finally { w.dispose() }
    }
  })

  it('the sky\'s sun disc follows the same default light', () => {
    const a = skyParams(plan([20, 8])), b = skyParams(plan([250, 70]))
    expect(a.sunDir).toEqual(b.sunDir)
    expect(Math.atan2(a.sunDir[0], -a.sunDir[2])).toBeCloseTo((DEFAULT_KEY_DIR[0] * Math.PI) / 180, 5)
  })
})
