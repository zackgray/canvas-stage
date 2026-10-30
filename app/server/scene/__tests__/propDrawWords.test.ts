// A prop draw's words (prop-view, owner 2026-10-29): a view stated in the prop's words (side, profile, front, top, three-quarter,
// rear, low angle) is honoured — the product photo keeps no front-on default and the Advanced box's own view clause is left out —
// and an empty or cleared Advanced box adds nothing. Pure.
import { describe, expect, it } from 'vitest'
import { conceptPrompt, propPartDefaults, propPartsSent, SIDE_VIEW, statesSide, statesView } from '../conceptText.ts'

const CAR = 'An open-wheel race car with wide slick tyres, matte black and red, photographed from the side.'

describe('the view a prop draw states', () => {
  it.each([
    'photographed from the side', 'a side view', 'in profile', 'a profile view', 'seen from the front', 'a top view', 'top-down',
    'three-quarter view', 'a 3/4 view', 'a rear view', 'seen from behind', 'a low angle', 'from a low angle', 'a low-angle shot', 'side-on',
  ])('"%s" states a view', (w) => expect(statesView(`A race car, ${w}.`)).toBe(true))

  it.each(['a brass rim', 'its lid back on', 'hanging from the left post', 'a side mirror', 'a wooden top'])('"%s" is no view', (w) =>
    expect(statesView(`A cart with ${w}.`)).toBe(false))

  it('the product photo honours the stated side view: no front-on default, the firm side view instead', () => {
    const p = conceptPrompt('prop', { description: CAR })
    expect(p).toMatch(/photographed from the side/)
    expect(p).not.toMatch(/seen flat on from the front/)
    expect(p).toContain(SIDE_VIEW)
  })
})

describe("a prop draw's ADVANCED parts (prop-draw-parts)", () => {
  const CART = 'A green hand cart.'
  it('unedited, the sent text is exactly what it always was', () => {
    expect(conceptPrompt('prop', { description: CART })).toBe('A product photograph of a green hand cart, seen flat on from the front and standing upright, centred on a plain neutral mid-grey background, flat even soft light, no shadows, no hand, nothing else in the picture. Real photographic detail.')
    expect(conceptPrompt('prop', { description: CART, parts: {} })).toBe(conceptPrompt('prop', { description: CART }))
    expect(conceptPrompt('prop', { description: CAR })).toBe(`A product photograph of an open-wheel race car with wide slick tyres, matte black and red, photographed from the side, ${SIDE_VIEW}, shown whole and fully in frame with clear space around it, nothing cropped, centred on a plain neutral mid-grey background, flat even soft light, no shadows, no hand, nothing else in the picture. Real photographic detail.`)
  })

  it('each edited part changes only its own part; an empty one leaves its part out', () => {
    const base = conceptPrompt('prop', { description: CART })
    expect(conceptPrompt('prop', { description: CART, parts: { view: 'seen from above' } })).toBe(base.replace('seen flat on from the front and standing upright', 'seen from above')
      .replace('centred', 'shown whole and fully in frame with clear space around it, nothing cropped, centred'))
    expect(conceptPrompt('prop', { description: CART, parts: { light: 'warm low sun from the left' } })).toBe(base.replace('flat even soft light, no shadows', 'warm low sun from the left'))
    expect(conceptPrompt('prop', { description: CART, parts: { rules: 'no hand, nothing else in the picture, no logos or printed text' } })).toBe(base.replace('nothing else in the picture.', 'nothing else in the picture, no logos or printed text.'))
    expect(conceptPrompt('prop', { description: CART, parts: { view: '' } })).toBe(base.replace(' seen flat on from the front and standing upright,', ''))
    expect(propPartsSent(CART, { view: '', setup: '', light: '', rules: '' })).toEqual([])
    expect(conceptPrompt('prop', { description: CART, parts: { view: '', setup: '', light: '', rules: '' } })).toBe('A product photograph of a green hand cart. Real photographic detail.')
  })
})

// (prop-side-view, owner 2026-10-29) the owner's phrasings of a side view, and the firm words a side view is sent with
describe('a side view, in the words or the View box', () => {
  it.each(['side profile', 'in side profile', 'from the side', 'side-on', 'profile', 'a side view', 'seen from the left', 'in profile', 'a profile shot', 'side elevation'])(
    '"%s" asks for a side view (in the words and alone in the View box)', (w) => {
      expect(statesSide(`A race car, ${w}.`)).toBe(true)
      expect(statesSide(w)).toBe(true)
      expect(statesView(`A race car, ${w}.`)).toBe(true)
    })

  it.each(['low-profile tyres', 'a side mirror', 'a bag hanging from the side of the cart', 'a slim profile wing', 'a top view', 'three-quarter view'])('"%s" is no side view', (w) =>
    expect(statesSide(`A race car with ${w}.`)).toBe(false))

  it('a side view in Describe it puts the firm side view in the View box default', () => {
    expect(propPartDefaults('A race car in side profile.').view).toBe(SIDE_VIEW)
    expect(propPartDefaults('A race car from a low angle.').view).toBe('') // another view: left out, as before
    expect(propPartDefaults('A race car.').view).toBe('seen flat on from the front and standing upright')
  })

  it('a side view typed in the View box goes with the firm words after it, and the frame then keeps it whole', () => {
    const sent = propPartsSent('A race car.', { view: 'seen from the side, in side profile' })
    expect(sent[0]).toBe(`seen from the side, in side profile, ${SIDE_VIEW}`)
    expect(sent[1]).toMatch(/^shown whole and fully in frame/)
    expect(propPartsSent('A race car.', { view: SIDE_VIEW })[0]).toBe(SIDE_VIEW) // said once, never twice
    expect(propPartsSent('A race car.', { view: 'seen from directly above, top-down' })[0]).toBe('seen from directly above, top-down') // other views as typed
  })
})
