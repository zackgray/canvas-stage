import { describe, expect, it } from 'vitest'
import { KEY_REFUSED, LORA_IMPORT, mapCloudAuth, mapMissingLora, startupLine, withHint } from '../comfy/errorHints.ts'
import { ObjectInfoCache, assertValid } from '../jobs/objinfo.ts'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('error mapping', () => {
  it('turns a Cloud 401 into the key sentence', () => {
    expect(mapCloudAuth('GET /api/object_info -> HTTP 401')).toBe(KEY_REFUSED)
    expect(mapCloudAuth('HTTP 403 forbidden')).toBe(KEY_REFUSED)
    expect(mapCloudAuth('GET /api/object_info -> HTTP 500')).toBeNull()
  })
  it('names the LoRA import when Render fails on lora_name', () => {
    const raw = 'job j-1 failed - look it up by id. ERROR: {"lora_name":"Value not in list: Lightricks__LTX-25-22b-IC-LoRA-Layout-To-Render__x.safetensors"}'
    expect(mapMissingLora(raw)).toBe(LORA_IMPORT)
    expect(withHint(raw)).toContain('node scripts/import-lora.mjs')
    expect(withHint(raw)).toContain('Value not in list') // the raw text is kept
    expect(mapMissingLora('job j-2 failed: out of memory')).toBeNull()
    expect(withHint('plain failure')).toBe('plain failure')
  })
  it('the graph check reports a refused key, not an internal sentence', async () => {
    const cache = new ObjectInfoCache(async () => { throw new Error('GET /api/object_info -> HTTP 401') }, path.join(mkdtempSync(path.join(tmpdir(), 'oi-')), 'oi.json'))
    await expect(assertValid({}, cache)).rejects.toMatchObject({ message: KEY_REFUSED, status: 401 })
  })
})

describe('startupLine', () => {
  const base = { ffmpeg: true, node: '22.12.0' }
  it('reports a key, the budget and ffmpeg without any network', () => {
    const l = startupLine({ ...base, key: 'comfyui-abc', budget: '300' })
    expect(l).toContain('key present; day budget 300 cr; ffmpeg ok; node 22.12.0')
    expect(l).not.toContain('comfyui-abc')
  })
  it('says what is off', () => {
    const l = startupLine({ ffmpeg: false, node: '22.12.0', key: '', budget: '' })
    expect(l).toContain('no key, paid steps off')
    expect(l).toContain('NOT set')
    expect(l).toContain('ffmpeg MISSING')
    expect(startupLine({ ...base, key: 'abc', budget: '5' })).toContain('not shaped like')
  })
})
