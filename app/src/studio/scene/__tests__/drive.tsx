// Shared user actions and seeding for the Scene design tests.
import { act, fireEvent, screen } from '@testing-library/react'
import { expect } from 'vitest'
import { openScene } from '../../../library/currentScene'
import { mkPiece, type Piece } from '../design/model'
import { designKey, freshDesign, type Design } from '../design/state'

export const click = async (id: string) => { await act(async () => { fireEvent.click(screen.getByTestId(id)) }) }
export const typeIn = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } })
export const btn = (id: string) => screen.getByTestId(id) as HTMLButtonElement
export const price = (id: string) => screen.getByTestId(id).closest('.st-pricebtn')!.querySelector('.st-price')!.textContent

/** every button that starts paid work shows its price; free ones say "free" */
export function expectEveryPriceShown() {
  const all = document.querySelectorAll('.st-pricebtn')
  for (const b of all) expect(b.querySelector('.st-price')?.textContent).toMatch(/≈ \d+(\.\d)? cr|free/)
  return all.length
}

/** the scene id the seeding helpers write the design under */
export const SC = 'sc-seeded'

/** seed the current scene's design straight into localStorage: the app reads it on open (a board without driving any paid call) */
export function seedDesign(patch: Partial<Design> = {}): Design {
  const d: Design = { ...freshDesign(), screen: 'board', phase: 'board', route: 'guided', ...patch }
  localStorage.setItem(designKey(SC), JSON.stringify(d))
  act(() => openScene(SC))
  return d
}

/** a board tile of a kind, drawn (one look) and on the board, waiting for approval */
export const on = (tag: string, type: Piece['type'], line = '', name = tag): Piece =>
  mkPiece(tag, name, type, { onBoard: true, line, state: 'draft', looks: [`/lab-assets/test/${tag}.png`] })
