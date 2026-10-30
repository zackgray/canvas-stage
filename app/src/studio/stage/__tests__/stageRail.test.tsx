// @vitest-environment jsdom
// The floating option rail — RETIRED by the object card wave (W1-E1, owner 2026-10-28): everything about a thing in the scene
// lives in its one object card now (opened by the click that used to open the rail), so the rail renders nothing at all — no
// strip, no cards, no peek, no viewer, no menus — whatever the workspace still publishes through the bus (the bus itself stays:
// the later right-click-menu track reuses it).
import { useEffect } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StageRail } from '../StageRail'
import { StageRailProvider, useRailActions, type MenuChoice, type StageMark } from '../railBus'
import type { RailContent } from '../railModel'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const content: RailContent = {
  title: 'Beekeeper — options',
  cards: [{ id: 'c1', name: 'Beekeeper · look 1', desc: 'words', img: '/x/c1.png', current: true }],
  onClose: () => {},
}
const mark: StageMark = { at: [0, 0], px: { x: 10, y: 10 }, kind: null }

/** publishes content or the Add-here menu through the real bus, exactly as the workspace still does */
function Probe({ withMenu }: { withMenu: boolean }) {
  const { publish, setMark, registerChooser } = useRailActions()
  useEffect(() => {
    publish(withMenu ? null : content)
    setMark(withMenu ? mark : null)
    registerChooser(vi.fn() as (k: MenuChoice) => void)
    return () => { publish(null); setMark(null); registerChooser(null) }
  }, [publish, setMark, registerChooser, withMenu])
  return <StageRail show />
}

describe('the retired option rail', () => {
  it('renders nothing, whatever the workspace publishes — option cards or the Add-here menu', () => {
    const { container, rerender } = render(<StageRailProvider><Probe withMenu={false} /></StageRailProvider>)
    expect(screen.queryByTestId('stage-rail')).toBeNull()
    expect(screen.queryByTestId('rail-card-c1')).toBeNull()
    expect(screen.queryByTestId('add-menu')).toBeNull()
    expect(screen.queryByTestId('piece-menu')).toBeNull()
    expect(screen.queryByTestId('stage-peek')).toBeNull()
    expect(screen.queryByTestId('card-viewer')).toBeNull()
    expect(container.querySelector('aside')).toBeNull()
    rerender(<StageRailProvider><Probe withMenu /></StageRailProvider>)
    expect(screen.queryByTestId('stage-rail')).toBeNull()
    expect(screen.queryByTestId('add-menu')).toBeNull()
    expect(container.querySelector('aside')).toBeNull()
  })
})
