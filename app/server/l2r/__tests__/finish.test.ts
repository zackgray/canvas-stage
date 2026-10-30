// The free finish via a stubbed child process: sharpen then grain 2.4, raw kept, failures recorded, one per render.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing, whyPython } from '../finish.ts'
import { mount, TAKE, until, world } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing() })

async function rendered() {
  const w = world(); const m = mount(w, w.runtime())
  w.py.fail = 'boom' // the automatic finish fails first
  const r = await m.render()
  const id = r.body.render.id as string
  const json = () => JSON.parse(readFileSync(path.join(w.dirs.l2r, `${id}.json`), 'utf8'))
  await until(() => !!json().finishError)
  w.py.calls.length = 0; delete w.py.fail
  return { w, m, id, json }
}

describe('finish', () => {
  it('a failed automatic finish keeps the raw and records why; Finish again runs sharpen -> grain and files the result', async () => {
    const { w, m, id, json } = await rendered()
    expect(json()).toMatchObject({ status: 'done', finished: null, finishError: expect.stringContaining('boom') })
    expect(existsSync(path.join(w.dirs.l2r, `${id}-raw.mp4`))).toBe(true)
    const r = await m.finish(id)
    expect(r.status).toBe(200)
    expect(r.body.render).toMatchObject({ finished: `/lab-assets/shots/${TAKE}/l2r/${id}-finished.mp4` })
    expect(r.body.render.finishError).toBeUndefined()
    const [sharpen, grain] = w.py.calls
    expect(sharpen[0]).toBe('/venv/python')
    expect(sharpen.slice(1).map((a) => path.basename(a))).toEqual(['sharpen.py', `${id}-raw.mp4`, `${id}-sharp.mp4`, '24'])
    expect(grain.slice(1).map((a) => path.basename(a))).toEqual(['grain.py', `${id}-sharp.mp4`, `${id}-finishing.mp4`, '2.4', '24'])
    expect(existsSync(path.join(w.dirs.l2r, `${id}-sharp.mp4`))).toBe(false) // the intermediate is removed
    expect(existsSync(path.join(w.dirs.l2r, `${id}-finished.mp4`))).toBe(true) // written beside, then put in place
    expect(existsSync(path.join(w.dirs.l2r, `${id}-finishing.mp4`))).toBe(false)
  })
  it('the copied scripts exist where the server runs them', () => {
    for (const s of ['sharpen.py', 'grain.py']) expect(existsSync(path.resolve(import.meta.dirname, '..', '..', '..', 'scripts', 'l2r', s))).toBe(true)
  })
  it('an unknown render 404, a render with no raw 409', async () => {
    const w = world(); const m = mount(w, w.runtime())
    expect((await m.finish('l2r-2026-01-01T00-00-00-000')).status).toBe(404)
  })
  it('names a Python without cv2 and a missing Python', () => {
    expect(whyPython('/p', new Error("ModuleNotFoundError: No module named 'cv2'"))).toMatch(/has no cv2/)
    expect(whyPython('/p', Object.assign(new Error('spawn'), { enoent: true }))).toMatch(/was not found/)
  })
})
