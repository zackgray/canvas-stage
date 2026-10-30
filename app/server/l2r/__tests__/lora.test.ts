// The Layout-To-Render LoRA name: default, CANVAS_L2R_LORA override in the graph, and the free refusal on a ComfyUI that does not list it.
import { afterEach, describe, expect, it } from 'vitest'
import type { ObjectInfo } from '../../comfy/index.ts'
import { l2rGraph } from '../graph.ts'
import { l2rLora, loraRefusal, L2R_LORA_DEFAULT } from '../graphLora.ts'

const saved = process.env.CANVAS_L2R_LORA
afterEach(() => { if (saved === undefined) delete process.env.CANVAS_L2R_LORA; else process.env.CANVAS_L2R_LORA = saved })
const infoWith = (names: string[]) => ({ LTXICLoRALoaderModelOnly: { input: { required: { lora_name: [names] } } } }) as unknown as ObjectInfo
const g = () => l2rGraph({ prompt: 'p', seed: 1, frames: 9, prefix: 'x', layoutSize: { w: 1280, h: 720 } })

describe('Layout-To-Render LoRA name', () => {
  it('defaults to the Lightricks release name and follows CANVAS_L2R_LORA into the graph', () => {
    delete process.env.CANVAS_L2R_LORA
    expect(l2rLora()).toBe(L2R_LORA_DEFAULT)
    expect(g().ic.inputs.lora_name).toBe(L2R_LORA_DEFAULT)
    process.env.CANVAS_L2R_LORA = ' my-import.safetensors '
    expect(g().ic.inputs.lora_name).toBe('my-import.safetensors')
  })

  it('refuses plainly when a self-hosted loader does not list it, passes when listed', () => {
    const why = loraRefusal(infoWith(['other.safetensors']), 'mine.safetensors', false)
    expect(why).toMatch(/does not list "mine\.safetensors"/)
    expect(why).toMatch(/CANVAS_L2R_LORA/)
    expect(loraRefusal(infoWith(['mine.safetensors']), 'mine.safetensors', false)).toBeNull()
  })

  it('cannot check on Cloud (its shared list omits imports) or when the ComfyUI lists no models', () => {
    expect(loraRefusal(infoWith(['other']), 'mine', true)).toBeNull()
    expect(loraRefusal({} as ObjectInfo, 'mine', false)).toBeNull()
  })
})
