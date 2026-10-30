// M-2 (scene library review): the job record's `done` write on Windows, where a rename onto a file a reader holds open is refused
// (EPERM / EBUSY; seen live on manifest.json). A real HTTP server with captureJobs in front of a stand-in paid route; the record's
// rename is injected to be refused the way Windows refuses it. A refusal that passes is retried and the paid reply lands on disk;
// one that never passes is logged and the reply is still handed out by id from this server. Nothing billed, no Comfy.
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { JOB_HEADERS } from '../../../src/shared/libraryContract.ts'
import { replaceFileSync } from '../../replace.ts'
import { writeJson } from '../../takes/store.ts'
import { captureJobs, JobRecords, type JobRecordsOptions } from '../jobRecords.ts'
import { SceneLibrary } from '../library.ts'
import { handleLibrary } from '../libraryPlugin.ts'

const locked = (code: string) => Object.assign(new Error(`${code}: operation not permitted, rename`), { code })
/** only the `done` write is refused: the reader holds the record when the route answers, not when it starts */
const isDone = (tmp: string) => readFileSync(tmp, 'utf8').includes('"status": "done"')
const cleanups: (() => void)[] = []
afterEach(() => { while (cleanups.length) cleanups.pop()!() })

/** a scene, and a paid route behind captureJobs whose record store refuses renames while `refusing` says so */
async function rig(o: JobRecordsOptions) {
  const pub = path.join(mkdtempSync(path.join(tmpdir(), 'joblock-')), 'public')
  const library = new SceneLibrary(pub)
  const scene = (await library.create('Locked')).id
  const capture = captureJobs(new JobRecords(pub, undefined, o))
  const route = (req: IncomingMessage, res: ServerResponse) => {
    req.resume()
    res.statusCode = 200; res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ kind: 'develop', brief: { brief: 'A paid chase.' } }))
  }
  const server = createServer((req, res) => capture(req, res, () => route(req, res)))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(() => { server.close(); rmSync(path.dirname(pub), { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const send = (job: string) => fetch(`${base}/__lab/planner/develop`, { method: 'POST', body: '{}',
    headers: { 'content-type': 'application/json', [JOB_HEADERS.scene]: scene, [JOB_HEADERS.job]: job, [JOB_HEADERS.target]: 'develop', [JOB_HEADERS.price]: '3' } })
  // the page's read of the job by id, through the library's own route over a store with no injection
  const byId = (job: string) => handleLibrary({ publicDir: pub, library, jobs: new JobRecords(pub) }, 'GET', [scene, 'jobs', job], new URLSearchParams(), null)
  const list = () => handleLibrary({ publicDir: pub, library, jobs: new JobRecords(pub) }, 'GET', [scene, 'jobs'], new URLSearchParams(), null)
  const clear = (job: string) => handleLibrary({ publicDir: pub, library, jobs: new JobRecords(pub) }, 'POST', [scene, 'jobs', job, 'clear'], new URLSearchParams(), {})
  const file = (job: string) => path.join(pub, 'lab-assets', 'scene', scene, 'jobs', `${job}.json`)
  return { send, byId, list, clear, file, scene }
}

describe('the paid reply survives a refused rename of its record (M-2)', () => {
  it('a transient EBUSY/EPERM on the done write is retried: the reply is on disk, fetchable by id, nothing left running', async () => {
    let refusals = 0
    const logs: string[] = []
    const r = await rig({
      log: (l) => logs.push(l),
      replace: (tmp, dest) => replaceFileSync(tmp, dest, {
        rename: (a, b) => { if (isDone(a) && refusals < 3) { refusals++; throw locked(refusals % 2 ? 'EBUSY' : 'EPERM') } renameSync(a, b) },
        copy: copyFileSync, unlink: unlinkSync,
      }),
    })
    const id = 'j-mh1abcde-bbbbbb'
    const res = await r.send(id)
    expect(res.status).toBe(200)
    expect(refusals).toBe(3)
    const got = await r.byId(id)
    expect(got).toMatchObject({ status: 200, body: { status: 'done', reply: { status: 200, body: { brief: { brief: 'A paid chase.' } } } } })
    expect(JSON.parse(readFileSync(r.file(id), 'utf8')).status).toBe('done') // on disk, so a restart keeps it too
    expect(logs).toEqual([])
    const dir = path.dirname(r.file(id))
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]) // no temp left
  })

  it('a rename that never passes (and no copy-over either) is logged, not silent; this server still hands the reply out by id once', async () => {
    const logs: string[] = []
    const refuse = (a: string, b: string, real: (a: string, b: string) => void) => { if (isDone(a)) throw locked('EPERM'); real(a, b) }
    const r = await rig({
      log: (l) => logs.push(l),
      replace: (tmp, dest) => replaceFileSync(tmp, dest, { rename: (a, b) => refuse(a, b, renameSync), copy: (a, b) => refuse(a, b, copyFileSync), unlink: unlinkSync }),
    })
    const id = 'j-mh1abcde-cccccc'
    expect((await r.send(id)).status).toBe(200) // the pressing page still gets its answer
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatch(new RegExp(`paid job ${id}.*could not be saved to disk.*EPERM`))
    expect(JSON.parse(readFileSync(r.file(id), 'utf8')).status).toBe('running') // the disk still says running...
    expect(await r.byId(id)).toMatchObject({ status: 200, body: { status: 'done', reply: { status: 200 } } }) // ...but a reloaded page gets the result
    expect(((await r.list()).body as { jobs: { id: string; status: string }[] }).jobs).toEqual([expect.objectContaining({ id, status: 'done' })])
    expect((await r.send(id)).status).toBe(409) // never sent twice
    expect((await r.clear(id)).body).toEqual({ cleared: true }) // claimed once
    expect((await r.clear(id)).body).toEqual({ cleared: false })
    expect(await r.byId(id)).toMatchObject({ status: 404 })
  })
})

describe('a take\'s JSON write under the same lock', () => {
  it('a refused rename is retried and the file lands, with no temp left', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'takejson-'))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    const f = path.join(dir, 'take.json')
    writeJson(f, { v: 1 })
    let refusals = 0
    writeJson(f, { v: 2 }, { rename: (a, b) => { if (refusals++ < 2) throw locked('EBUSY'); renameSync(a, b) }, copy: copyFileSync, unlink: unlinkSync })
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ v: 2 })
    expect(refusals).toBe(3)
  })
})
