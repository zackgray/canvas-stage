// The one-line "Built on …" credit each stage wears at the very bottom of the page, naming its open models (the contest
// requires the credit). Pure data, so the shell and the tests read the same words.
import type { Stage } from './route'

const BUILT_ON: Record<Stage, string> = {
  stage: 'three.js, CMU mocap, Qwen-Image 2512, Z-Image Turbo, Qwen-Image-Edit 2511, FLUX.2 Klein 4B',
  render: 'LTX-2.5 + Layout-To-Render IC-LoRA',
  export: 'ffmpeg',
}

export const creditLine = (stage: Stage): string => `Built on ${BUILT_ON[stage]}`
