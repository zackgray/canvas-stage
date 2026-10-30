import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { serveShot } from '../serveShots.ts'

function fakeRes() {
  const headers: Record<string, string> = {}
  const r = { statusCode: 200, headers, body: undefined as unknown, setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v }, end: (b?: unknown) => { r.body = b } }
  return r
}
const req = (method = 'GET') => ({ method, headers: {} }) as unknown as IncomingMessage

describe('serveShot', () => {
  const pub = mkdtempSync(path.join(tmpdir(), 'shots-'))
  const dir = path.join(pub, 'lab-assets', 'shots', 'take-1', 'hero')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'still.png'), Buffer.from([137, 80, 78, 71]))
  writeFileSync(path.join(dir, 'still.json'), '{"ok":true}')
  writeFileSync(path.join(pub, 'lab-assets', 'secret.png'), 'x')

  it('serves a png written after start from disk', () => {
    const res = fakeRes()
    expect(serveShot(req(), res as unknown as ServerResponse, pub, '/take-1/hero/still.png')).toBe(true)
    expect(res.headers['content-type']).toBe('image/png')
    expect((res.body as Buffer).length).toBe(4)
  })

  it('serves json', () => {
    const res = fakeRes()
    expect(serveShot(req(), res as unknown as ServerResponse, pub, '/take-1/hero/still.json?x=1')).toBe(true)
    expect(res.body).toBe('{"ok":true}')
  })

  it('falls through for traversal, unknown types, missing files and POSTs', () => {
    const res = fakeRes() as unknown as ServerResponse
    expect(serveShot(req(), res, pub, '/../secret.png')).toBe(false)
    expect(serveShot(req(), res, pub, '/take-1/..%2F..%2Fsecret.png')).toBe(false)
    expect(serveShot(req(), res, pub, '/take-1/hero/still.exe')).toBe(false)
    expect(serveShot(req(), res, pub, '/take-1/hero/missing.png')).toBe(false)
    expect(serveShot(req('POST'), res, pub, '/take-1/hero/still.png')).toBe(false)
  })
})
