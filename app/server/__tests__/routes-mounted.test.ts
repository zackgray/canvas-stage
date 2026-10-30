import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Plugin, UserConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import config from '../../vite.config.ts'

/** Every path prefix the config's dev-server plugins mount, found by running their configureServer against a fake server. */
async function mounted(): Promise<string[]> {
  const cfg = await (config as unknown as (env: { mode: string; command: string }) => UserConfig)({ mode: 'test', command: 'serve' })
  const root = mkdtempSync(path.join(tmpdir(), 'routes-'))
  const used: string[] = []
  const server = {
    config: { root, publicDir: path.join(root, 'public') },
    middlewares: { use: (p: unknown) => { if (typeof p === 'string') used.push(p) } },
    watcher: { on() {}, add() {} },
  }
  for (const p of (cfg.plugins ?? []).flat() as Plugin[]) {
    if (p && p.name.startsWith('lab-') || p?.name === 'tracker') (p.configureServer as ((s: unknown) => void) | undefined)?.(server)
  }
  return used
}

// What the live client calls (and Wave 2 is about to call): a removed registration here 404s a screen, so this list is the guard.
const LIVE = [
  '/__lab/bible', '/__lab/planner', '/__lab/scene', '/__lab/scenes', '/__lab/cast', '/__lab/jobs', '/__lab/project', '/__lab/stage3d',
  '/__lab/takes', '/__lab/clay', '/__lab/hero', '/__lab/l2r', '/__lab/cut', '/__lab/save', '/__lab/motion', '/__tracker',
  '/lab-assets/renders', '/lab-assets/locations', '/lab-assets/shots', '/lab-assets/cuts', '/lab-assets/cast',
]
const GONE = ['/__lab/crossview', '/__lab/realism', '/__lab/reskin', '/__lab/finish', '/__lab/clip', '/__lab/place', '/__lab/lift',
  '/__lab/surround', '/__lab/stills', '/__lab/still', '/__lab/look', '/__lab/settle', '/__lab/perform', '/__lab/location', '/lab-assets/perform', '/lab-assets/looks']

describe('vite.config registers the live routes and none of the removed legacy ones', () => {
  it('mounts every live prefix', async () => {
    const used = await mounted()
    for (const p of LIVE) expect(used.some((u) => u === p || u.startsWith(p + '/')), p).toBe(true)
  })
  it('mounts nothing for the deleted legacy chain', async () => {
    const used = await mounted()
    for (const p of GONE) expect(used.filter((u) => u === p || u.startsWith(p + '/')), p).toEqual([])
  })
})
