// Track C: the Set's clay image draws a plain grey stand-in at the subject's mark; the master's depth never does.
import { readFileSync } from 'node:fs'
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { disposeFigure, MARK_FIGURE_NAME, MARK_FRONT_NAME, markFigure } from '../markFigure'

describe('the mark stand-in', () => {
  it('is a grey figure about 1.7 m tall on the mark, turned to its facing, on the ground there', () => {
    const g = markFigure({ flat: [-3, -16, 3, 8], mark: { at: [2, -9], yawDeg: 90 } }, (x, z) => 0.25 + 0 * x * z)
    expect(g.name).toBe(MARK_FIGURE_NAME)
    expect([g.position.x, g.position.y, g.position.z]).toEqual([2, 0.25, -9])
    expect(g.rotation.y).toBeCloseTo(Math.PI / 2)
    g.updateMatrixWorld(true)
    const box = new Box3().setFromObject(g)
    expect(box.max.y - box.min.y).toBeGreaterThan(1.6)
    expect(box.max.y - box.min.y).toBeLessThan(1.9)
    const m = (g.children[0] as Mesh).material as MeshStandardMaterial
    expect([m.color.r, m.color.g, m.color.b].every((v) => Math.abs(v - m.color.r) < 1e-6)).toBe(true) // grey: no colour to read as a person's clothes
    disposeFigure(g)
  })

  it('defaults to the corridor start with no saved mark', () => {
    const g = markFigure({ flat: [-3, -16, 3, 8] })
    expect([g.position.x, g.position.z]).toEqual([0.6, -12.5])
  })

  it('is added by the still and never by the master depth', () => {
    const src = readFileSync(new URL('../kitStill.ts', import.meta.url), 'utf8')
    const still = src.slice(src.indexOf('export async function renderKitStill'), src.indexOf('export async function renderKitMasterDepth'))
    const depth = src.slice(src.indexOf('export async function renderKitMasterDepth'))
    expect(still).toContain('markFigure(plan')
    expect(still).toContain('world.scene.add(figure)')
    expect(depth).not.toMatch(/markFigure|MARK_FIGURE|scene\.add/)
  })

  it('has a visible front only when asked: the still keeps the plain figure, the live views get a nose and a ground wedge ahead', () => {
    const plain = markFigure({ flat: [-3, -16, 3, 8] })
    expect(plain.children.length).toBe(2)
    const g = markFigure({ flat: [-3, -16, 3, 8], mark: { at: [0, 0], yawDeg: 0 } }, undefined, { front: true })
    const front = g.children.filter((c) => c.name === MARK_FRONT_NAME)
    expect(front.length).toBe(2)
    g.updateMatrixWorld(true)
    for (const f of front) expect(new Box3().setFromObject(f).getCenter(new Vector3()).z).toBeGreaterThan(0.15) // ahead of the body (+z = facing)
    const wedge = new Box3().setFromObject(front[1])
    expect(wedge.max.z).toBeGreaterThan(0.7) // the tip reaches out in front
    expect(wedge.min.z).toBeGreaterThan(0.2) // and the wide end is not behind the figure
    disposeFigure(g); disposeFigure(plain)
  })

  it('the live set asks for the front, the still does not', () => {
    const live = readFileSync(new URL('../../../../studio/scene/live/liveSet.ts', import.meta.url), 'utf8')
    expect(live).toContain('{ front: true }')
    expect(readFileSync(new URL('../kitStill.ts', import.meta.url), 'utf8')).not.toContain('front')
  })
})
