// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openScene, resetCurrentScene } from '../../library/currentScene'
import type { LibraryApi } from '../../library/api'
import type { CutController } from '../../labs/projection/cut'
import { ExportScreen } from './ExportScreen'
import { TakeShot } from './TakeShot'

const SC = 'sc-20261024101500-ab12'
const cut = { loaded: true, running: false, status: null, error: null, data: { ffmpeg: true, performances: [], cuts: [] } } as unknown as CutController
const shot = { takeId: 'take-2026-10-24T10-00-00', render: { finished: '/renders/a.mp4', raw: '/renders/raw.mp4', frames: 97, status: 'done' } } as never

beforeEach(() => {
  localStorage.clear()
  resetCurrentScene({ get: async () => ({ id: SC }) } as unknown as LibraryApi)
  openScene(SC)
})
afterEach(() => { cleanup(); resetCurrentScene(); localStorage.clear() })

describe('a download is an export of the scene', () => {
  it('shows in the Exported list (and its count) after the download, and not before', () => {
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('click', stop) // jsdom cannot navigate to the file
    const { rerender } = render(<><TakeShot shot={shot} /><ExportScreen cut={cut} /></>)
    expect(screen.queryByTestId('export-downloaded')).toBeNull()
    expect(screen.queryByTestId('cut-out')).toBeNull() // nothing exported yet: no "Exported 0" (review F6)
    expect(screen.queryByText(/^Exported/)).toBeNull()
    fireEvent.click(screen.getByTestId('export-take-download'))
    rerender(<><TakeShot shot={shot} /><ExportScreen cut={cut} /></>)
    expect(screen.getByTestId('export-downloaded').textContent).toMatch(/finished shot · downloaded/)
    expect(screen.getByTestId('cut-out').previousElementSibling?.textContent).toMatch(/1$/)
    document.removeEventListener('click', stop)
  })
})
