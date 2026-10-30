/**
 * API-format graphs for the Location flow, built in code (workflows/location_*.api.json are snapshots, kept in sync
 * by a unit test). Both are cut from proven graphs, node ids unchanged where they exist there:
 *   candidates: workflows/z-image-turbo-still.api.json's loaders and 1344×768 latent (nodes 1-7 shared) with E18's
 *               sampler (workflows/e18_t2i-zit.api.json: 9 steps, CFG 1, dpmpp_sde / ddim_uniform, which reads more
 *               natural than the template's washed-out res_multistep / simple), and one KSampler -> VAEDecode ->
 *               SaveImage per seed (20+k -> 30+k -> 40+k), so N candidates are one job and each keeps its own seed.
 *   moge:       workflows/e2_still-geometry.api.json's MoGe-2 half (FOV estimated: fov_x_degrees 0), without the
 *               normals: depth EXR (5, normalised inverse), valid mask (9), vertical FOV text (12), point-map GLB (14).
 */

export type ApiNode = { class_type: string; inputs: Record<string, unknown> }
export type ApiGraph = Record<string, ApiNode>

export const CANDIDATES = 4
export const SIZE = { width: 1344, height: 768 } as const

export const ZIMAGE = {
  unet: 'z_image_turbo_bf16.safetensors',
  clip: 'qwen_3_4b.safetensors',
  vae: 'ae.safetensors',
} as const

/** E18's Z-Image Turbo sampler for location candidates (e18_result.md "Recommendation for the next build round"). */
export const SAMPLER = { steps: 9, cfg: 1, sampler_name: 'dpmpp_sde', scheduler: 'ddim_uniform', denoise: 1 } as const

/** Node ids the runner binds (inputs) and downloads (outputs). */
export const NODES = {
  candidate: (k: number) => String(40 + k),
  moge: { image: '1', depth: '5', valid: '9', vfov: '12', points: '14' },
} as const

const link = (id: string, slot = 0): [string, number] => [id, slot]
const node = (class_type: string, inputs: Record<string, unknown>): ApiNode => ({ class_type, inputs })

export function buildCandidatesGraph(o: { prompt: string; seeds: number[]; prefix?: string }): ApiGraph {
  const prefix = o.prefix ?? 'canvas-stage/location'
  const g: ApiGraph = {
    '1': node('UNETLoader', { unet_name: ZIMAGE.unet, weight_dtype: 'default' }),
    '2': node('CLIPLoader', { clip_name: ZIMAGE.clip, type: 'lumina2' }),
    '3': node('VAELoader', { vae_name: ZIMAGE.vae }),
    '4': node('ModelSamplingAuraFlow', { model: link('1'), shift: 3 }),
    '5': node('CLIPTextEncode', { text: o.prompt, clip: link('2') }),
    '6': node('ConditioningZeroOut', { conditioning: link('5') }),
    '7': node('EmptySD3LatentImage', { width: SIZE.width, height: SIZE.height, batch_size: 1 }),
  }
  o.seeds.forEach((seed, k) => {
    g[String(20 + k)] = node('KSampler', {
      model: link('4'), positive: link('5'), negative: link('6'), latent_image: link('7'),
      seed, ...SAMPLER,
    })
    g[String(30 + k)] = node('VAEDecode', { samples: link(String(20 + k)), vae: link('3') })
    g[NODES.candidate(k)] = node('SaveImage', { images: link(String(30 + k)), filename_prefix: `${prefix}-c${k}` })
  })
  return g
}

export function buildMogeGraph(o: { prefix?: string } = {}): ApiGraph {
  const prefix = o.prefix ?? 'canvas-stage/location'
  return {
    '1': node('LoadImage', { image: 'INPUT.png' }),
    '2': node('LoadMoGeModel', { model_name: 'moge_2_vitl_normal_fp16.safetensors' }),
    '3': node('MoGeInference', {
      moge_model: link('2'), image: link('1'), resolution_level: 9, fov_x_degrees: 0,
      batch_size: 1, force_projection: true, apply_mask: true, refine_steps: 0,
    }),
    '4': node('MoGeRender', { moge_geometry: link('3'), output: 'depth' }),
    '5': node('SaveImageAdvanced', {
      images: link('4'), filename_prefix: `${prefix}-moge-depth`, format: 'exr',
      'format.bit_depth': '32-bit float', 'format.input_color_space': 'linear',
    }),
    '8': node('MoGeRender', { moge_geometry: link('3'), output: 'mask' }),
    '9': node('SaveImage', { images: link('8'), filename_prefix: `${prefix}-moge-mask` }),
    '10': node('MoGeGeometryToFOV', { moge_geometry: link('3'), axis: 'vertical', unit: 'degrees' }),
    '11': node('PreviewAny', { source: link('10') }),
    '12': node('SaveText', { text: link('11'), filename_prefix: `${prefix}-moge-vfov`, format: 'txt' }),
    '13': node('MoGePointMapToMesh', { moge_geometry: link('3'), batch_index: 0, decimation: 2, discontinuity_threshold: 0.04, texture: true }),
    '14': node('SaveGLB', { mesh: link('13'), filename_prefix: `${prefix}-moge-points` }),
  }
}
