/**
 * The crop redraw graph (E135 kleinPropRedraw, as E139 crop, E140 fix and E141 cface ran it): crop around the mask
 * (InpaintCropImproved) -> Klein 4B with image 1 = the crop and image 2 = the reference (a board tile or a cast card) at 0.5 MP,
 * sampled only inside the cropped mask (SetLatentNoiseMask over the crop's own latent) -> InpaintStitchImproved back into the same
 * pixels. Only the stitched picture is saved; the paste onto the still is done locally inside the mask (pasteBack.ts). Pure.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { KLEIN_REF_MP } from './kitSpec.ts'

const L = (id: string, slot = 0): [string, number] => [id, slot]

/** expand = px the noise mask grows, blend = its feather, ctx = crop context around the mask, target = the crop's square side */
export interface CropOpts { expand: number; blend: number; ctx: number; target: number }
/** E140/E141 faces: the face area alone, 3x context, 1024, 12 px blend */
export const FACE_CROP: CropOpts = { expand: 0, blend: 12, ctx: 3, target: 1024 }
/** E139 crop: the piece's ID mask grown 4 px, 1.3x context, 1024, 12 px blend */
export const PROP_CROP: CropOpts = { expand: 4, blend: 12, ctx: 1.3, target: 1024 }

/** the loader nodes a run binds, and the one save node */
export const REDRAW_NODES = { still: 'still', mask: 'maskimg', ref: 'ref', save: 'out' } as const

export function buildRedrawGraph(prompt: string, seed: number, o: CropOpts, prefix: string): ApiGraph {
  const T = o.target
  return {
    k1: { class_type: 'UNETLoader', inputs: { unet_name: 'flux-2-klein-4b.safetensors', weight_dtype: 'default' } },
    k2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'flux2' } },
    k3: { class_type: 'VAELoader', inputs: { vae_name: 'flux2-vae.safetensors' } },
    still: { class_type: 'LoadImage', inputs: { image: 'still.png' } },
    maskimg: { class_type: 'LoadImage', inputs: { image: 'mask.png' } },
    mask: { class_type: 'ImageToMask', inputs: { image: L('maskimg'), channel: 'red' } },
    ref: { class_type: 'LoadImage', inputs: { image: 'ref.png' } },
    refs: { class_type: 'ImageScaleToTotalPixels', inputs: { image: L('ref'), upscale_method: 'lanczos', megapixels: KLEIN_REF_MP, resolution_steps: 16 } },
    crop: { class_type: 'InpaintCropImproved', inputs: { image: L('still'), mask: L('mask'), downscale_algorithm: 'bilinear', upscale_algorithm: 'bicubic', preresize: false, preresize_mode: 'ensure minimum resolution',
      preresize_min_width: 1024, preresize_min_height: 1024, preresize_max_width: 16384, preresize_max_height: 16384, mask_fill_holes: true, mask_expand_pixels: o.expand, mask_invert: false,
      mask_blend_pixels: o.blend, mask_hipass_filter: 0.1, extend_for_outpainting: false, extend_up_factor: 1, extend_down_factor: 1, extend_left_factor: 1, extend_right_factor: 1,
      context_from_mask_extend_factor: o.ctx, output_resize_to_target_size: true, output_target_width: T, output_target_height: T, output_padding: '32' } },
    l1: { class_type: 'VAEEncode', inputs: { pixels: L('crop', 1), vae: L('k3') } },
    l2: { class_type: 'VAEEncode', inputs: { pixels: L('refs'), vae: L('k3') } },
    nm: { class_type: 'SetLatentNoiseMask', inputs: { samples: L('l1'), mask: L('crop', 2) } },
    p: { class_type: 'CLIPTextEncode', inputs: { clip: L('k2'), text: prompt } },
    p0: { class_type: 'ReferenceLatent', inputs: { conditioning: L('p'), latent: L('l1') } },
    p1: { class_type: 'ReferenceLatent', inputs: { conditioning: L('p0'), latent: L('l2') } },
    n: { class_type: 'CLIPTextEncode', inputs: { clip: L('k2'), text: '' } },
    n0: { class_type: 'ReferenceLatent', inputs: { conditioning: L('n'), latent: L('l1') } },
    n1: { class_type: 'ReferenceLatent', inputs: { conditioning: L('n0'), latent: L('l2') } },
    ks: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    sig: { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: T, height: T } },
    gd: { class_type: 'CFGGuider', inputs: { model: L('k1'), positive: L('p1'), negative: L('n1'), cfg: 1 } },
    rn: { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    sm: { class_type: 'SamplerCustomAdvanced', inputs: { noise: L('rn'), guider: L('gd'), sampler: L('ks'), sigmas: L('sig'), latent_image: L('nm') } },
    dec: { class_type: 'VAEDecode', inputs: { samples: L('sm'), vae: L('k3') } },
    st: { class_type: 'InpaintStitchImproved', inputs: { stitcher: L('crop'), inpainted_image: L('dec') } },
    out: { class_type: 'SaveImage', inputs: { images: L('st'), filename_prefix: `${prefix}-stitched` } },
  } as ApiGraph
}
