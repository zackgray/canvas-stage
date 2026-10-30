// A set piece's mesh written after the dev server started must be served from disk as a glb. locations/ is watch-ignored, so Vite's
// public index never learns of new files and answers them with index.html (200, text/html): the "beehive" piece built mid-session
// reached GLTFLoader as `Unexpected token '<'` (2026-10-25). The mount must answer it, with the glb type and the file's bytes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { locationType, mount } from '../plugin.ts'

let dir = ''
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = '' })
const GLB = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(16, 7)])

/** runs the mount against a fake request; resolves with what it answered, or 'next' when it fell through */
function get(handler: ReturnType<typeof mount>, url: string): Promise<'next' | { type: string; body: Buffer }> {
  return new Promise((done) => {
    const out = new PassThrough(), chunks: Buffer[] = [], headers: Record<string, string> = {}
    const res = Object.assign(out, { statusCode: 200, setHeader: (k: string, v: string) => { headers[k] = v } }) as unknown as ServerResponse
    out.on('data', (c: Buffer) => chunks.push(c))
    out.on('end', () => done({ type: headers['content-type'], body: Buffer.concat(chunks) }))
    handler({ method: 'GET', url } as IncomingMessage, res, () => done('next'))
  })
}

describe('the /lab-assets/locations mount', () => {
  it('serves a piece mesh written after start as model/gltf-binary, byte for byte (with a cache-busting query too)', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'locmount-'))
    const run = path.join(dir, 'loc-2026-10-26T03-33-38-249', 'pieces', 'beehive', 'p-20261026033354-xyqs')
    mkdirSync(run, { recursive: true })
    writeFileSync(path.join(run, 'mesh.glb'), GLB)
    writeFileSync(path.join(run, 'massing.glb'), GLB)
    const h = mount(dir, locationType)
    for (const f of ['mesh.glb', 'massing.glb?v=2']) {
      const r = await get(h, `/loc-2026-10-26T03-33-38-249/pieces/beehive/p-20261026033354-xyqs/${f}`)
      expect(r).not.toBe('next')
      if (r === 'next') return
      expect(r.type).toBe('model/gltf-binary')
      expect(r.body.equals(GLB)).toBe(true)
    }
  })

  it('types only glbs inside a piece run; other glbs and unknown types fall through', () => {
    expect(locationType('loc-x/pieces/engine/p-1/mesh.glb')).toBe('model/gltf-binary')
    expect(locationType('loc-x/raw/points.glb')).toBeNull()
    expect(locationType('loc-x/pieces/engine/p-1/mesh.exe')).toBeNull()
    expect(locationType('loc-x/still.png')).toBe('image/png')
  })
})
