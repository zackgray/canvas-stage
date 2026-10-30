// Join (T4): Comfy Cloud and a local ComfyUI have different node lists, so the object_info cache a graph is checked against is
// kept per target: switching .env from one to the other never validates a graph against the other's cached copy.
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { objectInfoFile } from '../runtime.ts'

const KEYS = ['COMFY_BASE_URL', 'COMFYUI_URL'] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
const set = (o: Partial<Record<(typeof KEYS)[number], string>>) => { for (const k of KEYS) { if (o[k] === undefined) delete process.env[k]; else process.env[k] = o[k] } }

describe('the object_info cache file is per Comfy target', () => {
  it('Cloud keeps its file; each self-hosted ComfyUI has its own', () => {
    set({})
    const cloud = objectInfoFile('/x')
    expect(cloud).toBe(path.join('/x', 'object_info.json'))
    set({ COMFY_BASE_URL: 'http://127.0.0.1:8189', COMFYUI_URL: 'http://127.0.0.1:8188' })
    const local = objectInfoFile('/x')
    set({ COMFY_BASE_URL: 'http://127.0.0.1:8189', COMFYUI_URL: 'http://gpu-box:8188' })
    const other = objectInfoFile('/x')
    expect(new Set([cloud, local, other]).size).toBe(3)
    expect(path.basename(local)).toBe('object_info-127.0.0.1_8188.json')
  })
})
