// @vitest-environment jsdom
// The Camera's viewfinder rides the Camera pane alone: its box sits on the pane's picture (the export frame inside its slot), so the
// thirds, the readouts and the focus bracket never cross into the Free view or the Top View beside it.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Stage } from '../../engine/Stage'
import { CameraPaneBox } from '../CameraPaneBox'

afterEach(cleanup)

const stage = (rect: { x: number; y: number; w: number; h: number } | null) => {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: 1260 })
  Object.defineProperty(canvas, 'clientHeight', { value: 680 })
  return { renderer: { domElement: canvas }, panes: { rect: () => rect } } as unknown as Stage
}

describe('CameraPaneBox', () => {
  it('sits on the Camera pane\'s picture, not on the whole viewport', () => {
    render(<CameraPaneBox stage={stage({ x: 0, y: 162, w: 630, h: 357 })}><div className="cl-thirds" /></CameraPaneBox>)
    const box = screen.getByTestId('camera-pane-box')
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['0px', '162px', '630px', '357px'])
  })
  it('hidden while the Camera pane is off', () => {
    render(<CameraPaneBox stage={stage(null)}><span /></CameraPaneBox>)
    expect(screen.getByTestId('camera-pane-box').style.display).toBe('none')
  })
})
