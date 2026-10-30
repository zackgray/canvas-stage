// The browser's piece loader, when the server answers without the mesh: a dev server's index.html fallback (200, text/html) or a
// 404 must come back as plain words naming the piece, never GLTFLoader's `Unexpected token '<' ... is not valid JSON` (2026-10-25).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGlb, GLB_NOT_SERVED, isGlb, loadGlbPieces } from '../glbPiece.ts'

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'piece-box.glb')
const glbBytes = () => { const b = readFileSync(FIXTURE); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const HTML = '<!doctype html>\n<html lang="en"><head></head></html>'
const reply = (body: BodyInit, status = 200, type = 'text/html') => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } }))
afterEach(() => vi.restoreAllMocks())

describe('fetching a piece mesh', () => {
  it('parses a real glb', async () => {
    reply(glbBytes(), 200, 'model/gltf-binary')
    const o = await fetchGlb('/lab-assets/locations/loc-x/pieces/engine/p-1/mesh.glb')
    expect(o).toBeInstanceOf(THREE.Object3D)
  })

  it('a 200 with the HTML fallback is named plainly, not parsed as JSON', async () => {
    reply(HTML)
    await expect(fetchGlb('/m.glb')).rejects.toThrow(GLB_NOT_SERVED)
    reply(HTML)
    await expect(fetchGlb('/m.glb')).rejects.not.toThrow(/Unexpected token|JSON/)
  })

  it('a 404 says the file is not on the server', async () => {
    reply('missing', 404, 'text/plain')
    await expect(fetchGlb('/m.glb')).rejects.toThrow('the 3D file is not on the server')
  })

  it('the piece error names the piece and the plain reason', async () => {
    reply(HTML)
    const it0 = { kind: 'beehive', at: [0, 0] as [number, number], glb: { url: '/lab-assets/locations/loc-x/pieces/beehive/p-1/mesh.glb' } }
    await expect(loadGlbPieces([it0], new THREE.Group(), () => 0, () => false, fetchGlb)).rejects.toThrow(/the 3D piece "beehive" did not load: the server sent a web page instead of the 3D file/)
  })

  it('knows the glTF magic', () => {
    expect(isGlb(glbBytes())).toBe(true)
    expect(isGlb(new TextEncoder().encode(HTML).buffer as ArrayBuffer)).toBe(false)
    expect(isGlb(new ArrayBuffer(2))).toBe(false)
  })
})
