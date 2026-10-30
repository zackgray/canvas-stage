// @vitest-environment jsdom
// The viewport right-click menu (W3-E2, StageMenu): the person's rows (Walk to a spot / Slow walk / Run / Hold here · Edit look),
// a piece's (Swap · Move to a spot / Edit look / Duplicate · the danger Remove '<name>'), the plain piece's swap level (every kit
// kind, ‹ Back), and the ground's unchanged Add here (A prop / A set piece). The first row is focused, the arrows walk the rows,
// Enter picks, an outside press asks to close, and no row spends anything. The command is handed up untouched; what runs it is
// the host's business (StagePanel / the pick's choose).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StageMenu, type StageMenuPiece } from '../StageMenu'
import type { StageMark } from '../railBus'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const FRAME = { w: 1200, h: 800 }
const personMark: StageMark = { at: [0, 0], px: { x: 40, y: 40 }, kind: null, person: true }
const pieceMark: StageMark = { at: [3, -9], px: { x: 40, y: 40 }, kind: null, piece: { index: 0, swap: true } }
const groundMark: StageMark = { at: [1, -6], px: { x: 40, y: 40 }, kind: null }
const PROP_PIECE: StageMenuPiece = { name: 'red coupe', swap: true, hasCard: true }
const PLAIN_PIECE: StageMenuPiece = { name: 'crates', swap: true, hasCard: false }

const mount = (mark: StageMark | null, onChoose = vi.fn(), piece?: StageMenuPiece | null) =>
  render(<StageMenu mark={mark} piece={piece ?? null} frame={FRAME} onChoose={onChoose} />)

const rows = () => screen.getAllByRole('menuitem').map((b) => b.textContent)

describe('the person menu', () => {
  it('opens on the person with Walk to a spot / Slow walk / Run / Hold here · Edit look', () => {
    mount(personMark)
    expect(rows()).toEqual(['Walk to a spot', 'Slow walk', 'Run', 'Hold here', 'Character…'])
  })
  it('each row asks for its own command, the walk rows naming their pace', () => {
    const onChoose = vi.fn()
    mount(personMark, onChoose)
    for (const [id, cmd] of [
      ['stage-menu-walk', { do: 'walk', speed: 'walk' }],
      ['stage-menu-walk-slow', { do: 'walk', speed: 'slow' }],
      ['stage-menu-run', { do: 'walk', speed: 'run' }],
      ['stage-menu-stay', { do: 'stay' }],
      ['stage-menu-edit-look', { do: 'editLook' }],
    ] as const) {
      onChoose.mockClear()
      fireEvent.click(screen.getByTestId(id))
      expect(onChoose).toHaveBeenCalledWith(cmd)
    }
  })
})

describe('the piece menu', () => {
  it('a prop: Swap · Move to a spot / Edit look / Duplicate · Remove <name> (danger)', () => {
    mount(pieceMark, vi.fn(), PROP_PIECE)
    expect(rows()).toEqual(['Swap', 'Move to a spot', 'Edit look', 'Duplicate', "Remove 'red coupe'"])
    expect(screen.getByTestId('stage-menu-remove').classList.contains('dng')).toBe(true)
  })
  it('a plain piece has no Edit look (its card has nothing to show); a built piece has no Swap', () => {
    const first = mount(pieceMark, vi.fn(), PLAIN_PIECE)
    expect(screen.queryByTestId('stage-menu-edit-look')).toBeNull()
    first.unmount()
    mount({ ...pieceMark, piece: { index: 0, swap: false } }, vi.fn(), { ...PLAIN_PIECE, swap: false })
    expect(screen.queryByTestId('stage-menu-swap')).toBeNull()
  })
  it('the rows ask for their commands; Remove is the danger delete', () => {
    const onChoose = vi.fn()
    mount(pieceMark, onChoose, PROP_PIECE)
    for (const [id, cmd] of [
      ['stage-menu-move-spot', { do: 'moveSpot' }],
      ['stage-menu-edit-look', { do: 'editLook' }],
      ['stage-menu-duplicate', { do: 'duplicate' }],
      ['stage-menu-remove', { do: 'delete' }],
    ] as const) {
      onChoose.mockClear()
      fireEvent.click(screen.getByTestId(id))
      expect(onChoose).toHaveBeenCalledWith(cmd)
    }
  })
  it('Swap opens the kit kinds as a second level; a kind asks for that swap, ‹ Back returns', () => {
    const onChoose = vi.fn()
    mount(pieceMark, onChoose, PLAIN_PIECE)
    fireEvent.click(screen.getByTestId('stage-menu-swap'))
    expect(screen.getByTestId('stage-menu-swap-crates')).toBeTruthy() // every kit kind, alphabetical
    expect(screen.getByTestId('stage-menu-swap-back')).toBeTruthy()
    onChoose.mockClear()
    fireEvent.click(screen.getByTestId('stage-menu-swap-crates'))
    expect(onChoose).toHaveBeenCalledWith({ do: 'swap', kind: 'crates' })
    fireEvent.click(screen.getByTestId('stage-menu-swap-back'))
    expect(rows()[0]).toBe('Swap') // back at the first level (the menu itself stays open: the host closes it)
  })
})

describe('the ground menu', () => {
  it('keeps the Add here menu unchanged: A prop / A set piece', () => {
    const onChoose = vi.fn()
    mount(groundMark, onChoose)
    expect(screen.getByTestId('stage-menu').textContent).toContain('Add here')
    expect(rows()).toEqual(['A prop', 'A set piece'])
    fireEvent.click(screen.getByTestId('stage-menu-add-prop'))
    expect(onChoose).toHaveBeenCalledWith({ do: 'add', kind: 'prop' })
    onChoose.mockClear()
    fireEvent.click(screen.getByTestId('stage-menu-add-piece'))
    expect(onChoose).toHaveBeenCalledWith({ do: 'add', kind: 'piece' })
  })
  it('a chosen Add kind shows nothing (Add mode takes over)', () => {
    mount({ ...groundMark, kind: 'piece' })
    expect(screen.queryByTestId('stage-menu')).toBeNull()
  })
  it('no menu shows with no mark', () => {
    mount(null)
    expect(screen.queryByTestId('stage-menu')).toBeNull()
  })
})

describe('the menu behaviour (the mock)', () => {
  it('opens at the cursor corner and stays inside the frame', () => {
    const { rerender } = mount(personMark)
    expect(screen.getByTestId('stage-menu').style.left).toBe('40px')
    expect(screen.getByTestId('stage-menu').style.top).toBe('40px')
    rerender(<StageMenu mark={{ ...personMark, px: { x: 1150, y: 780 } }} frame={FRAME} onChoose={vi.fn()} />)
    expect(screen.getByTestId('stage-menu').style.left).toBe('980px') // 1200 - 220
    expect(screen.getByTestId('stage-menu').style.top).toBe('540px') // 800 - 260
  })
  it('the first row is focused; the arrows walk the rows; Enter picks the focused row', () => {
    const onChoose = vi.fn()
    mount(personMark, onChoose)
    expect(document.activeElement?.textContent).toBe('Walk to a spot')
    fireEvent.keyDown(screen.getByTestId('stage-menu'), { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('Slow walk')
    fireEvent.keyDown(screen.getByTestId('stage-menu'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByTestId('stage-menu'), { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('Hold here')
    fireEvent.keyDown(screen.getByTestId('stage-menu'), { key: 'ArrowUp' })
    expect(document.activeElement?.textContent).toBe('Run')
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(onChoose).toHaveBeenCalledWith({ do: 'walk', speed: 'run' })
  })
  it('a press elsewhere asks to close; a press on a row is not an outside press', () => {
    const onChoose = vi.fn()
    mount(personMark, onChoose)
    fireEvent.pointerDown(document.body, { button: 0 })
    expect(onChoose).toHaveBeenCalledWith({ do: 'close' })
    onChoose.mockClear()
    fireEvent.pointerDown(screen.getByTestId('stage-menu-stay'), { button: 0 })
    fireEvent.click(screen.getByTestId('stage-menu-stay'))
    expect(onChoose).not.toHaveBeenCalledWith({ do: 'close' })
    expect(onChoose).toHaveBeenCalledWith({ do: 'stay' })
  })
  it('no row carries a price: nothing priced anywhere in the menu', () => {
    mount(pieceMark, vi.fn(), PROP_PIECE)
    expect(document.querySelector('.st-pricebtn')).toBeNull()
    expect(screen.getByTestId('stage-menu').textContent).not.toMatch(/cr|\d+\s*$/i)
  })
})
