// @vitest-environment jsdom
// QA m8: an opening still that is not there (never approved) is a plain line, not a broken-image icon.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RefChips } from './RefChips'
import { SafeImg } from './SafeImg'

afterEach(cleanup)

describe('SafeImg', () => {
  it('swaps a picture that fails to load for a plain line, and tries again for a new address', () => {
    const { rerender } = render(<SafeImg src="/a.png" alt="x" line="Not available yet" testId="pic" />)
    fireEvent.error(screen.getByTestId('pic'))
    expect(screen.queryByTestId('pic')).toBeNull()
    expect(screen.getByTestId('pic-missing').textContent).toBe('Not available yet')
    rerender(<SafeImg src="/b.png" alt="x" line="Not available yet" testId="pic" />)
    expect(screen.getByTestId('pic')).toBeTruthy()
  })

  it('an opening chip whose still is missing shows the line inside its chip', () => {
    render(<RefChips chips={[{ role: 'opening', label: 'Look · opening still', url: '/nope.png', sent: true }]} />)
    fireEvent.error(screen.getByRole('img', { name: 'Look · opening still' }))
    expect(screen.getByTestId('l2r-chip-opening').textContent).toContain('Not available yet')
    expect(document.querySelector('img')).toBeNull()
  })
})
