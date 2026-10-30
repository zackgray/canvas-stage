/**
 * Which Layout-To-Render LoRA the graph loads. The name is whatever the account's import is called: the default is the file
 * as Comfy Cloud names the Lightricks release, CANVAS_L2R_LORA overrides it (a self-hosted copy, or a Cloud import that
 * landed under another name). Read on every call, so a restart is the only step after changing it.
 */
import { comboOptions, envValue, type ObjectInfo } from '../comfy/index.ts'

export const L2R_LORA_DEFAULT = 'Lightricks__LTX-25-22b-IC-LoRA-Layout-To-Render__ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors'

export const l2rLora = (): string => envValue('CANVAS_L2R_LORA') ?? L2R_LORA_DEFAULT

const LOADER = 'LTXICLoRALoaderModelOnly'

/**
 * A plain refusal when the LoRA loader's own list does not offer `name`, else null. Only a self-hosted ComfyUI lists every
 * installed LoRA; Comfy Cloud's shared list leaves out a user's imports, so on Cloud (`cloud`) nothing can be checked here.
 */
export function loraRefusal(info: ObjectInfo, name: string, cloud: boolean): string | null {
  if (cloud) return null
  const spec = info[LOADER]?.input?.required?.lora_name
  const offered = comboOptions(spec)
  if (!offered.length) return null // this ComfyUI does not list models: nothing to compare
  if (offered.includes(name)) return null
  return `Render needs the Layout-To-Render LoRA, and your ComfyUI does not list "${name}". Put the file in ComfyUI's loras folder (or set CANVAS_L2R_LORA to the name it is listed under), then restart.`
}
