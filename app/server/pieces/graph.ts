/**
 * The "Build in 3D" graph: E136's TRELLIS.2 arm alone (experiments/lib/e136-graphs.ts meshGraph, from Comfy's own template
 * 3d_pixal3d_trellis2_image_to_model; Pixal3D dropped, E136: it outputs in the source camera's frame, tilted per image). The board
 * tile is a flat-lit product photograph on plain grey (conceptGraph 'prop'), which is what the template's cut-out expects:
 * RemoveBackground (birefnet) -> ImageCropToMask pad 1.0 -> DINOv3-L NAF conditioning -> structure / shape 512 / upsample 1024 with
 * the template's samplers, CFG overrides and RescaleCFG -> shape decode only (no texture: layout clay) -> RemeshMesh solid ->
 * DecimateMesh 30k -> smooth normals -> SaveGLB. Seeds are the template's (56 / 42 / 42): a reroll is a new tile, not a new seed.
 */
import type { ApiGraph } from '../comfy/index.ts'
import { NODES, TRELLIS } from './spec.ts'

const L = (id: string, slot = 0): [string, number] => [id, slot]

export interface PieceGraphOpts { res?: number; remesh?: number; faces?: number }

/** Bind `img.image` to the tile's png. Output: the GLB on node `glb`. */
export function buildPieceGraph(prefix: string, o: PieceGraphOpts = {}): ApiGraph {
  const res = o.res ?? 1024, remesh = o.remesh ?? 512, faces = o.faces ?? 30000
  return {
    [NODES.image]: { class_type: 'LoadImage', inputs: { image: 'tile.png' } },
    bgm: { class_type: 'LoadBackgroundRemovalModel', inputs: { bg_removal_name: 'birefnet.safetensors' } },
    rb: { class_type: 'RemoveBackground', inputs: { bg_removal_model: L('bgm'), image: L(NODES.image) } },
    crop: { class_type: 'ImageCropToMask', inputs: { images: L(NODES.image), masks: L('rb'), width: 1024, height: 1024, pad_factor: 1.0, grow_mask: 0, background: '#000000' } },
    cv: { class_type: 'CLIPVisionLoader', inputs: { clip_name: 'dino_v3_L_naf_fp32.safetensors' } },
    cond: { class_type: 'Trellis2Conditioning', inputs: { clip_vision_model: L('cv'), image: L('crop') } },
    svae: { class_type: 'VAELoader', inputs: { vae_name: 'trellis_2_shape_vae_bf16.safetensors' } },
    u: { class_type: 'UNETLoader', inputs: { unet_name: TRELLIS, weight_dtype: 'default' } },
    co1: { class_type: 'CFGOverride', inputs: { model: L('u'), cfg: 1, start_percent: 0.667, end_percent: 1 } },
    rc1: { class_type: 'RescaleCFG', inputs: { model: L('co1'), multiplier: 0.7 } },
    ms: { class_type: 'ModelSamplingSD3', inputs: { model: L('rc1'), shift: 5 } },
    co2: { class_type: 'CFGOverride', inputs: { model: L('u'), cfg: 1, start_percent: 0.769, end_percent: 1 } },
    rc2: { class_type: 'RescaleCFG', inputs: { model: L('co2'), multiplier: 0.5 } },
    els: { class_type: 'EmptyTrellis2LatentStructure', inputs: { batch_size: 1 } },
    k1: { class_type: 'KSampler', inputs: { model: L('ms'), positive: L('cond', 0), negative: L('cond', 1), latent_image: L('els'), seed: 56, steps: 12, cfg: 7.5, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
    vs: { class_type: 'VaeDecodeStructureTrellis2', inputs: { samples: L('k1'), vae: L('svae'), resolution: '32' } },
    ss: { class_type: 'Trellis2ShapeStage', inputs: { positive: L('cond', 0), negative: L('cond', 1), voxel: L('vs') } },
    k2: { class_type: 'KSampler', inputs: { model: L('rc2'), positive: L('ss', 0), negative: L('ss', 1), latent_image: L('ss', 2), seed: 42, steps: 20, cfg: 7.5, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
    up: { class_type: 'Trellis2UpsampleStage', inputs: { positive: L('ss', 0), negative: L('ss', 1), shape_latent: L('k2'), vae: L('svae'), target_resolution: res } },
    k3: { class_type: 'KSampler', inputs: { model: L('rc2'), positive: L('up', 0), negative: L('up', 1), latent_image: L('up', 2), seed: 42, steps: 12, cfg: 7.5, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    dec: { class_type: 'VaeDecodeShapeTrellis', inputs: { samples: L('k3'), vae: L('svae') } },
    rm: { class_type: 'RemeshMesh', inputs: { mesh: L('dec'), resolution: remesh, sign_mode: 'solid', 'sign_mode.fill': 20, 'sign_mode.qef': false, band: 1, project_back: 0, fix_poles: false, smooth_iters: 20, drop_small_components: 0.01, precluster_max_verts: 20000000 } },
    dm: { class_type: 'DecimateMesh', inputs: { mesh: L('rm'), target_face_count: faces, placement_mode: 'midpoint' } },
    sn: { class_type: 'MeshSmoothNormals', inputs: { mesh: L('dm'), crease_angle: 180 } },
    [NODES.glb]: { class_type: 'SaveGLB', inputs: { mesh: L('sn'), filename_prefix: `${prefix}-trellis2` } },
  }
}
