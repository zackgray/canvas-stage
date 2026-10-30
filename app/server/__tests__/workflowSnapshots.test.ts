// The submission's workflow files are the graphs the server sends (Cast keeps its own the same way): rewrite them with
// `npx tsx server/workflowSnapshots.ts` after a graph change.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { snapshotFile, WORKFLOW_SNAPSHOTS } from '../workflowSnapshots.ts'

describe('workflows/*.api.json for the preproduction chain', () => {
  for (const [name, build] of Object.entries(WORKFLOW_SNAPSHOTS)) {
    it(`${name}.api.json is what the builder makes`, () => {
      expect(JSON.parse(readFileSync(snapshotFile(name), 'utf8'))).toEqual(build())
    })
  }
  it('the keyframe graph has the mid and end guides the plain one lacks', () => {
    const plain = Object.keys(WORKFLOW_SNAPSHOTS['l2r_layout-to-render']()), keyed = Object.keys(WORKFLOW_SNAPSHOTS['l2r_layout-to-render-keyframes']())
    expect(keyed.filter((k) => !plain.includes(k)).length).toBeGreaterThan(0)
  })
})
