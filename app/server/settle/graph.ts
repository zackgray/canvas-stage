/**
 * API-format graph for one settle turn, built in code (workflows/settle_*.api.json are snapshots, kept in sync by a
 * unit test). It is E3's proven graph (workflows/e3_settle-inpaint-depth.api.json) cut to one inpaint model, node
 * ids unchanged:
 *   LoadImage(1) + LoadImageMask(2, white = hole) -> InpaintCropImproved(3) -> GrowMask(4, 8 px)
 *   klein: Flux 2 Klein 4B distilled, 4 steps, CFG 1, ReferenceLatent on the crop -> stitch (26) -> SaveImage (27)
 *   qwen:  Qwen Image Edit 2511 + Lightning 4-step LoRA, CFG 1 -> stitch (42) -> SaveImage (43)
 *   -> MoGe-2 ViT-L at the view's own horizontal FOV -> depth EXR (normalised inverse), valid mask, point-map GLB
 * The stitch keeps pixels outside the mask bit-exact.
 */

export type ApiNode = { class_type: string; inputs: Record<string, unknown> }
export type ApiGraph = Record<string, ApiNode>
export type SettleModel = 'klein' | 'qwen'
export const MODELS: readonly SettleModel[] = ['klein', 'qwen']

export const SEED = 42

/** Node ids the runner binds (inputs) and downloads (outputs), per model. */
export const NODES = {
  image: '1',
  mask: '2',
  klein: { filled: '27', depth: '62', valid: '64', points: '66', moge: '60' },
  qwen: { filled: '43', depth: '72', valid: '74', points: '76', moge: '70' },
} as const

const link = (id: string, slot = 0): [string, number] => [id, slot]
const node = (class_type: string, inputs: Record<string, unknown>): ApiNode => ({ class_type, inputs })

function common(): ApiGraph {
  return {
    '1': node('LoadImage', { image: 'INPUT.png' }),
    '2': node('LoadImageMask', { image: 'MASK.png', channel: 'red' }),
    '3': node('InpaintCropImproved', {
      image: link('1'), mask: link('2'), downscale_algorithm: 'bilinear', upscale_algorithm: 'bicubic',
      preresize: false, preresize_mode: 'ensure minimum resolution', preresize_min_width: 1024, preresize_min_height: 1024,
      preresize_max_width: 16384, preresize_max_height: 16384, mask_fill_holes: false, mask_expand_pixels: 0,
      mask_invert: false, mask_blend_pixels: 0, mask_hipass_filter: 0.1, extend_for_outpainting: false,
      extend_up_factor: 1, extend_down_factor: 1, extend_left_factor: 1, extend_right_factor: 1,
      context_from_mask_extend_factor: 1.2, output_resize_to_target_size: false, output_target_width: 1344,
      output_target_height: 768, output_padding: '32',
    }),
    '4': node('GrowMask', { mask: link('3', 2), expand: 8, tapered_corners: true }),
    '50': node('LoadMoGeModel', { model_name: 'moge_2_vitl_normal_fp16.safetensors' }),
  }
}

function klein(prompt: string, prefix: string): ApiGraph {
  return {
    '10': node('UNETLoader', { unet_name: 'flux-2-klein-4b-fp8.safetensors', weight_dtype: 'default' }),
    '11': node('CLIPLoader', { clip_name: 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' }),
    '12': node('VAELoader', { vae_name: 'flux2-vae.safetensors' }),
    '13': node('CLIPTextEncode', { clip: link('11'), text: prompt }),
    '14': node('ConditioningZeroOut', { conditioning: link('13') }),
    '15': node('VAEEncode', { pixels: link('3', 1), vae: link('12') }),
    '16': node('ReferenceLatent', { conditioning: link('13'), latent: link('15') }),
    '17': node('ReferenceLatent', { conditioning: link('14'), latent: link('15') }),
    '18': node('CFGGuider', { model: link('10'), positive: link('16'), negative: link('17'), cfg: 1 }),
    '19': node('SetLatentNoiseMask', { samples: link('15'), mask: link('4') }),
    '20': node('GetImageSize', { image: link('3', 1) }),
    '21': node('Flux2Scheduler', { steps: 4, width: link('20', 0), height: link('20', 1) }),
    '22': node('RandomNoise', { noise_seed: SEED }),
    '23': node('KSamplerSelect', { sampler_name: 'euler' }),
    '24': node('SamplerCustomAdvanced', { noise: link('22'), guider: link('18'), sampler: link('23'), sigmas: link('21'), latent_image: link('19') }),
    '25': node('VAEDecode', { samples: link('24'), vae: link('12') }),
    '26': node('InpaintStitchImproved', { stitcher: link('3'), inpainted_image: link('25') }),
    '27': node('SaveImage', { images: link('26'), filename_prefix: `${prefix}-filled-klein` }),
  }
}

function qwen(prompt: string, prefix: string): ApiGraph {
  return {
    '30': node('UNETLoader', { unet_name: 'qwen_image_edit_2511_fp8mixed.safetensors', weight_dtype: 'default' }),
    '31': node('LoraLoaderModelOnly', { model: link('30'), lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', strength_model: 1 }),
    '32': node('ModelSamplingAuraFlow', { model: link('31'), shift: 3 }),
    '33': node('CFGNorm', { model: link('32'), strength: 1 }),
    '34': node('CLIPLoader', { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' }),
    '35': node('VAELoader', { vae_name: 'qwen_image_vae.safetensors' }),
    '36': node('TextEncodeQwenImageEditPlus', { clip: link('34'), prompt, vae: link('35'), image1: link('3', 1) }),
    '37': node('TextEncodeQwenImageEditPlus', { clip: link('34'), prompt: '', vae: link('35'), image1: link('3', 1) }),
    '38': node('VAEEncode', { pixels: link('3', 1), vae: link('35') }),
    '39': node('SetLatentNoiseMask', { samples: link('38'), mask: link('4') }),
    '40': node('KSampler', {
      model: link('33'), seed: SEED, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple',
      positive: link('36'), negative: link('37'), latent_image: link('39'), denoise: 1,
    }),
    '41': node('VAEDecode', { samples: link('40'), vae: link('35') }),
    '42': node('InpaintStitchImproved', { stitcher: link('3'), inpainted_image: link('41') }),
    '43': node('SaveImage', { images: link('42'), filename_prefix: `${prefix}-filled-qwen` }),
  }
}

function moge(model: SettleModel, filled: string, hfovDeg: number, prefix: string): ApiGraph {
  const n = NODES[model]
  const base = Number(n.moge)
  const id = (k: number) => String(base + k)
  return {
    [n.moge]: node('MoGeInference', {
      moge_model: link('50'), image: link(filled), resolution_level: 9, fov_x_degrees: Math.round(hfovDeg * 100) / 100,
      batch_size: 1, force_projection: true, apply_mask: true, refine_steps: 0,
    }),
    [id(1)]: node('MoGeRender', { moge_geometry: link(n.moge), output: 'depth' }),
    [n.depth]: node('SaveImageAdvanced', {
      images: link(id(1)), filename_prefix: `${prefix}-${model}-depth`, format: 'exr',
      'format.bit_depth': '32-bit float', 'format.input_color_space': 'linear',
    }),
    [id(3)]: node('MoGeRender', { moge_geometry: link(n.moge), output: 'mask' }),
    [n.valid]: node('SaveImage', { images: link(id(3)), filename_prefix: `${prefix}-${model}-mask` }),
    [id(5)]: node('MoGePointMapToMesh', { moge_geometry: link(n.moge), batch_index: 0, decimation: 2, discontinuity_threshold: 0.04, texture: true }),
    [n.points]: node('SaveGLB', { mesh: link(id(5)), filename_prefix: `${prefix}-${model}-points` }),
  }
}

/** Horizontal FOV from the export camera's vertical FOV and aspect, degrees. */
export function hfovFrom(vfovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((vfovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI
}

export interface SettleGraphOptions {
  model: SettleModel
  prompt: string
  /** horizontal FOV of the view camera, degrees — MoGe shares our intrinsics */
  hfovDeg: number
  prefix?: string
}

export function buildSettleGraph(o: SettleGraphOptions): ApiGraph {
  const prefix = o.prefix ?? 'canvas-stage/settle'
  const inpaint = o.model === 'klein' ? klein(o.prompt, prefix) : qwen(o.prompt, prefix)
  const filled = o.model === 'klein' ? '26' : '42'
  return { ...common(), ...inpaint, ...moge(o.model, filled, o.hfovDeg, prefix) }
}

/** E3's fill instruction (proven on Klein and Qwen); the scene sentence is the source shot's prompt when known. */
export function settlePrompt(scene: string | null | undefined): string {
  const s = (scene ?? '').replace(/\s+/g, ' ').trim()
  return 'Fill in the black empty regions of this photo so the picture is complete and seamless, continuing the ' +
    'surrounding architecture, perspective and lighting exactly. Keep everything else unchanged.' + (s ? ` Scene: ${s}` : '')
}
