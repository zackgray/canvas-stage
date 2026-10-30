// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CandidateStrip, type StripItem } from '.'

afterEach(cleanup)

const items: StripItem[] = [
  {
    id: 'a', src: 'a.png', label: 'Alpha', reason: 'sharper',
    actions: [
      { id: 'use', label: 'Use', primary: true },
      { id: 'drop', label: 'Drop', disabled: true, title: 'nothing to drop yet' },
    ],
  },
  { id: 'b', src: 'b.png', label: 'Beta', stale: true },
  { id: 'clay', src: 'clay.png', label: 'Clay' },
]

const cardIds = (testId: string) =>
  Array.from(screen.getByTestId(testId).children).map((n) => n.getAttribute('data-testid'))

describe('CandidateStrip', () => {
  it('draws the leadingId card first, the rest in given order', () => {
    render(<CandidateStrip items={items} leadingId="clay" testId="strip" />)
    expect(cardIds('strip')).toEqual(['strip-card-clay', 'strip-card-a', 'strip-card-b'])
  })
  it('marks the selected card with aria-current and a class', () => {
    render(<CandidateStrip items={items} selectedId="b" testId="strip" />)
    const sel = screen.getByTestId('strip-card-b')
    expect(sel.getAttribute('aria-current')).toBe('true')
    expect(sel.className).toContain('st-strip-selected')
    expect(screen.getByTestId('strip-card-a').getAttribute('aria-current')).toBeNull()
  })
  it('clicking a thumbnail calls onOpen and onSelect', () => {
    const onOpen = vi.fn()
    const onSelect = vi.fn()
    render(<CandidateStrip items={items} onOpen={onOpen} onSelect={onSelect} testId="strip" />)
    fireEvent.click(screen.getByTestId('strip-card-a').querySelector('img')!)
    expect(onOpen).toHaveBeenCalledWith('a')
    expect(onSelect).toHaveBeenCalledWith('a')
  })
  it('clicking an action calls onAction only, never onOpen/onSelect', () => {
    const onOpen = vi.fn()
    const onSelect = vi.fn()
    const onAction = vi.fn()
    render(<CandidateStrip items={items} onOpen={onOpen} onSelect={onSelect} onAction={onAction} testId="strip" />)
    fireEvent.click(screen.getByTestId('strip-action-a-use'))
    expect(onAction).toHaveBeenCalledWith('a', 'use')
    expect(onOpen).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })
  it('a disabled action does nothing', () => {
    const onAction = vi.fn()
    render(<CandidateStrip items={items} onAction={onAction} testId="strip" />)
    fireEvent.click(screen.getByTestId('strip-action-a-drop'))
    expect(onAction).not.toHaveBeenCalled()
  })
  it('a pending card shows its label, "drawing…", and no actions', () => {
    const pending: StripItem = { id: 'p', src: null, label: 'Next take', pending: true, actions: [{ id: 'use', label: 'Use' }] }
    render(<CandidateStrip items={[...items, pending]} testId="strip" />)
    const card = screen.getByTestId('strip-card-p')
    expect(card.textContent).toContain('Next take')
    expect(card.textContent).toContain('drawing…')
    expect(card.querySelector('img')).toBeNull()
    expect(card.querySelector('.st-strip-acts')).toBeNull()
  })
  it('shows an "out of date" badge on stale cards only', () => {
    render(<CandidateStrip items={items} testId="strip" />)
    expect(screen.getByTestId('strip-card-b').textContent).toContain('out of date')
    expect(screen.getByTestId('strip-card-a').textContent).not.toContain('out of date')
  })
  it('renders emptyText in a <p> with no items, nothing without it', () => {
    const { container, rerender } = render(<CandidateStrip items={[]} emptyText="No candidates yet" testId="strip" />)
    const p = container.querySelector('p')
    expect(p?.textContent).toBe('No candidates yet')
    expect(screen.queryByTestId('strip')).toBeNull()
    rerender(<CandidateStrip items={[]} testId="strip" />)
    expect(container.firstChild).toBeNull()
  })
  it('Left/Right arrows move focus between the thumbnail buttons', () => {
    render(<CandidateStrip items={items} leadingId="clay" testId="strip" />)
    const first = screen.getByTestId('strip-card-clay').querySelector('button')!
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByTestId('strip-card-a').querySelector('button'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByTestId('strip-card-b').querySelector('button'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByTestId('strip-card-b').querySelector('button'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByTestId('strip-card-a').querySelector('button'))
  })
})
