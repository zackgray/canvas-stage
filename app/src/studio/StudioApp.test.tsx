import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { STAGES, type Stage } from './route'
import { StudioView } from './StudioView'

const view = (stage: Stage, name: string | null = null) =>
  renderToStaticMarkup(<StudioView stage={stage} projectName={name} viewport={<canvas />} screen={<p>screen</p>} drawer={<p>words</p>} />)

describe('studio shell', () => {
  it('renders every stage with its screen, the app title and the project name, empty-project tolerant', () => {
    for (const stage of STAGES) {
      const html = view(stage)
      expect(html).toContain('data-testid="studio-screen"><p>screen</p>')
      expect(html).toContain('Canvas Stage')
      expect(html).toContain('Untitled project')
    }
    expect(view('stage', 'Warehouse')).toContain('Warehouse')
  })

  it('links nowhere outside the studio: no legacy, Dev or classic UI link', () => {
    for (const stage of STAGES) {
      const html = view(stage)
      for (const id of ['legacy-link', 'dev-link', 'classic-link']) expect(html).not.toContain(`data-testid="${id}"`)
      expect(html).not.toContain('#/app/')
    }
  })

  it('keeps the stage slot the body\'s first child, with the viewport mounted on every stage', () => {
    for (const stage of STAGES) {
      const html = view(stage)
      expect(html).toContain(`<div class="st-body"><main class="st-stage${stage === 'stage' ? ' st-stage-on' : ''}" data-testid="studio-stage">`)
      expect(html).toContain('<canvas>')
    }
    // only the Stage shows it
    expect(view('stage')).toContain('class="st-vp st-vp-on" aria-hidden="false"')
    expect(view('render')).toContain('class="st-vp" aria-hidden="true"')
  })

  it('on the Stage only, the words drawer sits in the stage slot after the screen (under the viewport, in its column)', () => {
    expect(view('stage')).toContain('data-testid="studio-screen"><p>screen</p></div><p>words</p></main>')
    for (const stage of STAGES.filter((s) => s !== 'stage')) expect(view(stage)).not.toContain('<p>words</p>')
  })

  it('has no stage chevrons and no stage label in the top bar', () => {
    const html = view('render')
    expect(html).not.toContain('st-chev')
    expect(html).not.toContain('studio-stage-name')
    expect(html).not.toContain('st-bar-mid')
  })

  it('wears one small "Built on" credit line at the very bottom naming its open models', () => {
    const credits: Record<Stage, string> = {
      stage: 'Built on three.js, CMU mocap, Qwen-Image 2512, Z-Image Turbo, Qwen-Image-Edit 2511, FLUX.2 Klein 4B',
      render: 'Built on LTX-2.5 + Layout-To-Render IC-LoRA', export: 'Built on ffmpeg',
    }
    for (const stage of STAGES) {
      const html = view(stage)
      expect(html).toContain('<footer class="st-foot" data-testid="stage-credit">')
      expect(html).toContain(`data-testid="stage-built-on">${credits[stage]}<`)
      expect(html).not.toContain('stage-promise') // no description line under the top bar
    }
  })
})
