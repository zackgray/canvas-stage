// A judge's fresh clone against a local ComfyUI: graph validation reads object_info from the configured address (a fake HTTP
// server here), with no cache file; Cloud is unchanged. No credits, no real ComfyUI.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fetchObjectInfo, resolveDiscoveryTarget } from '../index.ts'
import { assertValid, ObjectInfoCache } from '../../jobs/objinfo.ts'
import { graph, INFO } from '../../jobs/__tests__/rig.ts'

let srv: Server, base: string, hits: Array<{ url: string; key?: string }>
const saved = { ...process.env }

beforeEach(async () => {
  hits = []
  srv = createServer((req, res) => {
    hits.push({ url: req.url ?? '', key: req.headers['x-api-key'] as string | undefined })
    if (req.url === '/mount/api/object_info' || req.url === '/api/object_info') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(INFO)) } else { res.statusCode = 404; res.end() }
  })
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  delete process.env.COMFYUI_URL
  delete process.env.COMFY_BASE_URL
})
afterEach(async () => {
  process.env = { ...saved }
  await new Promise((r) => srv.close(r))
})

const freshCache = () => new ObjectInfoCache(() => fetchObjectInfo(resolveDiscoveryTarget('comfyui')), path.join(mkdtempSync(path.join(os.tmpdir(), 'oi-')), 'none.json'))

describe('self-hosted graph validation', () => {
  it('fetches object_info from COMFY_BASE_URL when there is no cache, and accepts a good graph', async () => {
    process.env.COMFY_BASE_URL = base
    await expect(assertValid(graph() as never, freshCache())).resolves.toBeUndefined()
    expect(hits.map((h) => h.url)).toEqual(['/api/object_info'])
    expect(hits[0].key).toBeUndefined()
  })

  it("refuses a bad graph with the validator's words, not an address error", async () => {
    process.env.COMFY_BASE_URL = base
    const bad = { ...graph(), '1': { class_type: 'Gen', inputs: { x: 99, lora: 'a.safetensors' } } }
    await expect(assertValid(bad as never, freshCache())).rejects.toMatchObject({ status: 400 })
  })

  it('prefers COMFYUI_URL (the raw ComfyUI) over the proxy address, and keeps a path prefix without doubled slashes', async () => {
    process.env.COMFY_BASE_URL = 'http://127.0.0.1:1' // a proxy that does not serve object_info
    process.env.COMFYUI_URL = `${base}/mount/`
    await expect(assertValid(graph() as never, freshCache())).resolves.toBeUndefined()
    expect(hits.map((h) => h.url)).toEqual(['/mount/api/object_info'])
  })

  it('takes an address without a scheme, and says plainly when there is no address at all', () => {
    process.env.COMFY_BASE_URL = '127.0.0.1:8188'
    expect(resolveDiscoveryTarget('comfyui').baseUrl).toBe('http://127.0.0.1:8188')
    delete process.env.COMFY_BASE_URL
    expect(() => resolveDiscoveryTarget('comfyui')).toThrow(/COMFYUI_URL/)
  })

  it('leaves Comfy Cloud alone: its address and key header are unchanged', () => {
    process.env.COMFY_API_KEY = 'k'
    expect(resolveDiscoveryTarget('cloud')).toMatchObject({ kind: 'cloud', baseUrl: 'https://cloud.comfy.org', apiKey: 'k' })
  })
})
