// The cast endpoint over a temp public dir and the job runner's fake Cloud (server/jobs/__tests__/rig.ts).
// `restarted()` builds the endpoint again over the same disk with a runtime of its own (fresh lock): a dev-server restart.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import type { ObjectInfo } from '../../comfy/index.ts'
import { rig } from '../../jobs/__tests__/rig.ts'
import { SNAPSHOT_FRONT } from '../graphs.ts'
import { createCast } from '../routes.ts'

export const DESC = 'a stocky woman in her forties with a grey crop, a broken nose and a quilted waxed-cotton work jacket'

/** object_info that accepts exactly the node classes of the cast graphs (any inputs, any link types) */
export function info(): ObjectInfo {
  const out: Record<string, unknown> = {}
  for (const g of [SNAPSHOT_FRONT()]) {
    for (const n of Object.values(g)) {
      out[n.class_type] = { input: { required: Object.fromEntries(Object.keys(n.inputs).map((k) => [k, ['*']])) }, output: ['*', '*', '*'] }
    }
  }
  return out as unknown as ObjectInfo
}

export function setup(cap: number | null = 100, o: { submit?: () => Job } = {}) {
  const t = rig({ cap })
  const make = () => t.restart({ fetchInfo: async () => info(), ...(o.submit ? { submit: async () => { t.submits++; return o.submit!() } } : {}) }, cap)
  const rt = make()
  const pub = mkdtempSync(path.join(tmpdir(), 'cast-'))
  let n = 1000
  const cast = createCast({ publicDir: pub, rt: () => rt, seed: () => (n += 10) })
  return {
    t, cast, pub, post, store: () => rt.store,
    dir: (card: string, d: string) => path.join(pub, 'lab-assets', 'cast', card, d),
    restarted: () => { const rt2 = make(); return createCast({ publicDir: pub, rt: () => rt2, seed: () => (n += 10) }) },
  }
}

export const post = (c: ReturnType<typeof createCast>, route: string, body: Record<string, unknown>) => c('POST', route, body)
