// "Draw from your approved frame": the edit graph is the validated QA graph (round2-qwen-edit/out/edit-B-1mp.graph.json, copied to
// fixtures/), node for node; the price per case; the mode field; the prompts. No Cloud call.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildEditGraph, EDIT_NODES } from '../editGraph.ts'
import { buildEditPrompt, garmentsOf } from '../editPrompt.ts'
import { editPressCredits, parseDrawMode } from '../editSpec.ts'
import { parseKitFields } from '../kitInputs.ts'
import { buildPlatePrompt } from '../platePrompt.ts'

type Node = { class_type: string; inputs: Record<string, unknown> }
const qa = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'edit-B-1mp.graph.json'), 'utf8')) as Record<string, Node>

describe('the edit graph', () => {
  const g = buildEditGraph({ prompt: qa.pos.inputs.prompt as string, seeds: [1082798150], prefix: 'canvas-stage/r2edit-edit-B-1mp' }) as Record<string, Node>
  const renamed: Record<string, string> = { k: 'k1082798150', v: 'v1082798150', u: 'u1082798150', o: 's1082798150' }

  it('equals the validated graph node for node: same classes, same inputs, same links (the seed nodes renamed as the Qwen draw names them)', () => {
    const fix = (v: unknown): unknown => (Array.isArray(v) && typeof v[0] === 'string' ? [renamed[v[0]] ?? v[0], v[1]] : v)
    const want = Object.fromEntries(Object.entries(qa).map(([id, n]) => [renamed[id] ?? id, { class_type: n.class_type, inputs: Object.fromEntries(Object.entries(n.inputs).map(([k, v]) => [k, fix(v)])) }]))
    ;(want.s1082798150.inputs as Record<string, unknown>).filename_prefix += '-1082798150' // a save per seed, as the Qwen draw names them
    expect(g).toEqual(want)
  })

  it('the numbers that matter: 1344x768, depth 0.35 from 0 to 40 %, 8 steps, CFG 1, shift 3.1, index_timestep_zero, Lightning LoRA, 1920x1088 out', () => {
    expect(g.lat.inputs).toMatchObject({ width: 1344, height: 768 })
    expect(g.cn.inputs).toMatchObject({ strength: 0.35, start_percent: 0, end_percent: 0.4 })
    expect(g.k1082798150.inputs).toMatchObject({ steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 })
    expect(g.m2.inputs.shift).toBe(3.1)
    expect(g.mp.inputs.reference_latents_method).toBe('index_timestep_zero')
    expect(g.m1.inputs.unet_name).toBe('qwen_image_edit_2511_bf16.safetensors')
    expect(g.m1l.inputs.lora_name).toBe('Qwen-Image-Edit-2511-Lightning-8steps-V1.0-fp32.safetensors')
    expect(g.ucn.inputs.control_net_name).toBe('Qwen-Image-2512-Fun-Controlnet-Union-2602.safetensors')
    expect(g.u1082798150.inputs).toMatchObject({ width: 1920, height: 1088 })
    expect(g.neg.inputs.prompt).toBe('') // no text negative: the empty-prompt encode of the same three pictures
  })

  it('one KSampler, decode, scale and save per seed, sharing the encoders; the four loaders are the bind points', () => {
    const two = buildEditGraph({ prompt: 'p', seeds: [1, 2], prefix: 'x' }) as Record<string, Node>
    expect(Object.keys(two).filter((k) => two[k].class_type === 'KSampler').sort()).toEqual(['k1', 'k2'])
    expect(Object.keys(two).filter((k) => two[k].class_type === 'SaveImage').sort()).toEqual(['s1', 's2'])
    expect(Object.keys(two).filter((k) => two[k].class_type === 'TextEncodeQwenImageEditPlus')).toEqual(['pos', 'neg'])
    expect(Object.values(EDIT_NODES).every((id) => two[id].class_type === 'LoadImage')).toBe(true)
  })
})

describe('price and mode', () => {
  it('a first press of one seed 28, a redraw 11, two seeds on a fresh take 39, two on a take with a plate 22', () => {
    expect([editPressCredits(1, false), editPressCredits(1, true), editPressCredits(2, false), editPressCredits(2, true)]).toEqual([28, 11, 39, 22])
  })
  it('the mode defaults to depth (absent from the fields), edit parses, an unknown mode is a 400', () => {
    expect(parseKitFields({})).not.toHaveProperty('mode')
    expect(parseKitFields({ mode: 'edit' }).mode).toBe('edit')
    expect(parseKitFields({ mode: 'depth' }).mode).toBe('depth')
    expect(() => parseKitFields({ mode: 'inpaint' })).toThrow(/mode must be depth or edit/)
    expect(parseDrawMode(undefined)).toBeUndefined()
  })
})

describe('the prompts', () => {
  const parts = { place: 'an old apple orchard, autumn, late afternoon', pieces: ['the white wooden beehive', 'apple trees'], prop: 'beehive',
    figure: 'In the middle of the frame, one figure seen whole, about a third of the frame tall.', doing: 'Standing at the hive',
    description: 'A woman in her fifties, a working beekeeper, a white cotton coverall, a straw hat, tan gloves' }
  it('the edit prompt keeps the validated shape and carries the new "add nothing" clause', () => {
    const p = buildEditPrompt(parts)
    expect(p).toMatch(/^Picture 1 is a real photograph of an old apple orchard, autumn, late afternoon\./)
    expect(p).toContain('Keep picture 1 exactly as it is: the same location, camera, framing and light, the white wooden beehive, apple trees.')
    expect(p).toContain('In the middle of the frame, one figure seen whole, about a third of the frame tall.')
    expect(p).toContain('She wears exactly the clothes of the woman in picture 2: ')
    expect(p).toContain('She has the face of the woman in picture 3.')
    expect(p).toContain('She is alone in the picture, the only person in it.')
    expect(p).toContain('Take nothing else from pictures 2 and 3: not their camera, framing or background.')
    // stage-only: only the scene's own main piece noun; the fixed "trees, gates or walls" came from one test scene
    expect(p).toContain('Add nothing else to the place: no extra beehives.')
    expect(p).not.toMatch(/trees, gates or walls/)
    expect(buildEditPrompt({ ...parts, prop: '' })).toContain('Add nothing else to the place.')
  })
  it('the garment list is the card after its subject', () => {
    expect(garmentsOf('A woman in her fifties, with a white coverall, a straw hat and gloves.')).toBe('a white coverall, a straw hat and gloves')
    expect(garmentsOf('A tall knight')).toBe('a tall knight')
  })
  it('the plate prompt names the place and its pieces and nobody: no card, no clothes, no action, no figure line', () => {
    const p = buildPlatePrompt({ bible: null, plan: { sentence: 'An orchard at dusk.', kit: [{ kind: 'tree' }, { kind: 'tree' }] } as never, cast: { cardId: 'ana', name: 'Ana', description: 'A woman in her fifties, a beekeeper in a white coverall' },
      figures: [{ tag: 'hero', cx: 0.5, top: 0.3, bottom: 0.9, x0: 0.4, x1: 0.6 }], action: 'walking towards us', takeAction: 'She lifts a frame' })
    expect(p).toMatch(/orchard/i)
    expect(p).not.toMatch(/woman|beekeeper|coverall|walking|lifts|figure|alone|only person/i)
  })
})
