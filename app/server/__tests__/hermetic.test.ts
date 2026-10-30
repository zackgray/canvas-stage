import { expect, it } from 'vitest'
import { toWorkflow } from '../comfy/index.ts'

// A fresh public clone has no app/.env. The suite must pass there, so it never sees the real key here either
// (vite.config.ts skips loadEnv under Vitest), and building a workflow must not need a Comfy client.
it('the suite runs without a Comfy key, and building a workflow needs none', () => {
  expect(process.env.COMFY_API_KEY ?? '').toBe('')
  const wf = toWorkflow({ '1': { class_type: 'LoadImage', inputs: { image: 'x.png' } } })
  wf.setInput('1', 'image', 'y.png')
  expect(wf.json).toEqual({ '1': { class_type: 'LoadImage', inputs: { image: 'y.png' } } })
})
