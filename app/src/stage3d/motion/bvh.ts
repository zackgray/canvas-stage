/**
 * Minimal BVH reader for the CMU library: the joint tree (names, parents, offsets in metres) and every frame pre-converted to one
 * local quaternion per joint plus the root position (metres). Pure data, no three.js scene objects, so it runs in tests and is
 * deterministic: sampling is a slerp between the two neighbouring frames.
 */
import * as THREE from 'three'

export type BvhJoint = { name: string; parent: number; offset: THREE.Vector3; channels: string[] }
export type Bvh = {
  joints: BvhJoint[]
  frameTime: number
  frames: number
  /** frames × joints quaternions, packed xyzw */
  quats: Float32Array
  /** frames root positions, packed xyz (metres) */
  roots: Float32Array
}

const AXIS: Record<string, THREE.Vector3> = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) }

/** parse BVH text; `scale` = metres per BVH unit (CMU about 0.0564) */
export function parseBvh(text: string, scale = 0.0564): Bvh {
  const tok = text.split(/\s+/).filter(Boolean)
  let i = 0
  const joints: BvhJoint[] = []
  const next = () => tok[i++]
  const expect = (w: string) => { const t = next(); if (t !== w) throw new Error(`bvh: expected ${w}, got ${t}`) }
  expect('HIERARCHY')
  function readJoint(parent: number): void {
    const name = next(), idx = joints.length
    expect('{')
    const j: BvhJoint = { name, parent, offset: new THREE.Vector3(), channels: [] }
    joints.push(j)
    for (;;) {
      const t = next()
      if (t === 'OFFSET') j.offset.set(+next() * scale, +next() * scale, +next() * scale)
      else if (t === 'CHANNELS') { const n = +next(); for (let k = 0; k < n; k++) j.channels.push(next()) }
      else if (t === 'JOINT') readJoint(idx)
      else if (t === 'End') { next(); expect('{'); while (next() !== '}'); } // End Site: skipped, the figure has no use for it
      else if (t === '}') return
      else throw new Error(`bvh: unexpected ${t}`)
    }
  }
  const r = next(); if (r !== 'ROOT') throw new Error('bvh: no ROOT')
  readJoint(-1)
  expect('MOTION'); expect('Frames:')
  const frames = +next(); expect('Frame'); expect('Time:')
  const frameTime = +next()
  const J = joints.length, quats = new Float32Array(frames * J * 4), roots = new Float32Array(frames * 3)
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion()
  for (let f = 0; f < frames; f++) {
    for (let j = 0; j < J; j++) {
      q.identity()
      for (const ch of joints[j].channels) {
        const v = +next()
        if (ch.endsWith('position')) roots[f * 3 + 'XYZ'.indexOf(ch[0])] = v * scale
        else q.multiply(qa.setFromAxisAngle(AXIS[ch[0]], THREE.MathUtils.degToRad(v)))
      }
      q.toArray(quats, (f * J + j) * 4)
    }
  }
  if (!(frames > 0) || Number.isNaN(quats[quats.length - 1])) throw new Error('bvh: truncated motion data')
  return { joints, frameTime, frames, quats, roots }
}

/** frame index (fractional, clamped) for a time in seconds */
export function frameAt(b: Bvh, t: number): number { return Math.min(Math.max(t / b.frameTime, 0), b.frames - 1) }

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion()
/** joint j's local rotation at fractional frame f */
export function sampleQuat(b: Bvh, j: number, f: number, out: THREE.Quaternion): THREE.Quaternion {
  const J = b.joints.length, f0 = Math.floor(f), f1 = Math.min(f0 + 1, b.frames - 1), k = f - f0
  qa.fromArray(b.quats, (f0 * J + j) * 4); qb.fromArray(b.quats, (f1 * J + j) * 4)
  return out.slerpQuaternions(qa, qb, k)
}

/** root position at fractional frame f (metres) */
export function sampleRoot(b: Bvh, f: number, out: THREE.Vector3): THREE.Vector3 {
  const f0 = Math.floor(f), f1 = Math.min(f0 + 1, b.frames - 1), k = f - f0, R = b.roots
  return out.set(R[f0 * 3] + (R[f1 * 3] - R[f0 * 3]) * k, R[f0 * 3 + 1] + (R[f1 * 3 + 1] - R[f0 * 3 + 1]) * k, R[f0 * 3 + 2] + (R[f1 * 3 + 2] - R[f0 * 3 + 2]) * k)
}
