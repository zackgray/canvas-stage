// @vitest-environment jsdom
// The new prop screen (layout wave L3; object card wave: one candidate by default like every count): the label and the describe
// box, the count stepper beside Draw (1..4, one by default) with the real cost on the Draw button following the count, the words
// that will go in a box under the honest label "Your words" (the server adds the plain product-photo setup; a stated view or light
// wins) with the warn-only checks under it (a pasted prompt goes as typed), an upload as a free candidate, and a close only through
// Cancel / ✕ (a click on the dark space never discards typed text). It says, before the pick, that the picked one builds itself in
// 3D and at what price; no person screen exists (F13: no route places a person).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddGenScreen } from '../AddGenScreen'
import { addGenDraft, clearAddGenDraft } from '../addGenDraft'

afterEach(() => { cleanup(); vi.restoreAllMocks(); clearAddGenDraft() })

describe('the new prop screen', () => {
  it('shows the real cost on the Draw button and draws with the words as typed', async () => {
    const draw = vi.fn(async () => ['/d/1.png', '/d/2.png'])
    render(<AddGenScreen price={(n) => n * 6} draw={draw} buildPrice={12} onClose={() => {}} />)
    expect(screen.getByTestId('add-gen-draw').textContent).toBe('Draw 1 candidate')
    expect(screen.getByTestId('add-gen').textContent).toContain('≈ 6 cr')
    expect(screen.getByTestId('add-gen').textContent).not.toMatch(/person/i) // F13: a prop screen only
    expect(screen.getByTestId('add-gen-build-line').textContent).toContain('builds itself in 3D: one Cloud job, about a minute, about 12 cr')
    expect((screen.getByTestId('add-gen-draw') as HTMLButtonElement).disabled).toBe(true) // nothing typed yet
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a green hand cart with one wheel' } })
    fireEvent.change(screen.getByTestId('add-gen-name'), { target: { value: 'Cart' } })
    expect(screen.getByTestId('add-gen-sent').textContent).toMatch(/^What will be sent: A product photograph of a green hand cart with one wheel, .*grey background/) // the exact words
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await waitFor(() => expect(draw).toHaveBeenCalledWith('Cart', 'a green hand cart with one wheel', 1))
    expect((await screen.findByTestId('add-gen-done')).textContent).toContain('2 candidates added to the list')
  })

  it('the stepper sets the count: the button text and the price follow it, and the count goes with the draw', async () => {
    const draw = vi.fn(async () => ['/d/1.png'])
    render(<AddGenScreen price={(n) => n * 6} draw={draw} onClose={() => {}} />)
    expect(screen.getByTestId('add-gen-draw').textContent).toBe('Draw 1 candidate')
    expect(screen.getByTestId('add-gen').textContent).toContain('≈ 6 cr')
    fireEvent.click(screen.getByTestId('add-gen-count-less')) // at the floor: nothing below 1
    expect(screen.getByTestId('add-gen-draw').textContent).toBe('Draw 1 candidate')
    fireEvent.click(screen.getByTestId('add-gen-count-more'))
    expect(screen.getByTestId('add-gen-draw').textContent).toBe('Draw 2 candidates')
    expect(screen.getByTestId('add-gen').textContent).toContain('≈ 12 cr')
    fireEvent.click(screen.getByTestId('add-gen-count-more'))
    fireEvent.click(screen.getByTestId('add-gen-count-more')) // at the ceiling: nothing above 4
    expect(screen.getByTestId('add-gen-draw').textContent).toBe('Draw 4 candidates')
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'an old wooden wheelbarrow' } })
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await waitFor(() => expect(draw).toHaveBeenCalledWith('', 'an old wooden wheelbarrow', 4))
  })

  it('warns, warn-only, about a pasted prompt — the words still go as typed', async () => {
    const draw = vi.fn(async () => [])
    render(<AddGenScreen price={(n) => n * 6} draw={draw} onClose={() => {}} />)
    expect(screen.getByTestId('add-gen-draw').textContent).toBe('Draw 1 candidate')
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a wheelbarrow, no fire nearby' } })
    const warnings = await screen.findByTestId('add-gen-warnings')
    expect(warnings.textContent).toContain('Negatives') // the check only tells; it never rewrites
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await waitFor(() => expect(draw).toHaveBeenCalledWith('', 'a wheelbarrow, no fire nearby', 1))
  })

  it('an upload becomes a candidate as is, free, with no draw', async () => {
    const draw = vi.fn(async () => [])
    const upload = vi.fn(async () => '/u/photo.png')
    render(<AddGenScreen price={(n) => n * 6} draw={draw} upload={upload} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId('add-gen-upload'), { target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } })
    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(draw).not.toHaveBeenCalled()
    expect((await screen.findByTestId('add-gen-done')).textContent).toContain('added to the list as is')
  })

  it('closes on Cancel and ✕; a click on the dark space around the form closes nothing', () => {
    const onClose = vi.fn()
    render(<AddGenScreen price={(n) => n * 6} draw={vi.fn(async () => [])} onClose={onClose} />)
    fireEvent.click(document.querySelector('.st-gen-big')!) // the dark space beside the form
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('add-gen-cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('add-gen-close'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe("ADVANCED: the person card's boxes, one per part a prop draw adds (prop-draw-parts)", () => {
  const box = (k: string) => screen.getByTestId(`add-gen-part-${k}`) as HTMLTextAreaElement
  const sent = () => screen.getByTestId('add-gen-part-sent').textContent!
  const mount = (draw = vi.fn(async () => [])) => {
    render(<AddGenScreen price={(n) => n * 6} draw={draw} onClose={() => {}} />)
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a red race car' } })
    fireEvent.click(screen.getByTestId('add-gen-tab-advanced'))
    return draw
  }

  it('Describe it is not copied in: each box shows its real default, and unedited the draw goes as ever (no parts sent)', async () => {
    const draw = mount()
    expect(screen.queryByTestId('add-gen-prompt')).toBeNull() // no copy of Describe it
    expect(box('view').value).toBe('seen flat on from the front and standing upright')
    // (prop-advanced-same) the setup and its light are the one large 'How the picture is taken' box, as the person card's framing
    expect(box('setup').value).toBe('centred on a plain neutral mid-grey background, flat even soft light, no shadows')
    expect(screen.queryByTestId('add-gen-part-light')).toBeNull()
    expect(box('rules').value).toBe('no hand, nothing else in the picture')
    expect(sent()).toBe('What will be sent: A product photograph of a red race car, seen flat on from the front and standing upright, centred on a plain neutral mid-grey background, flat even soft light, no shadows, no hand, nothing else in the picture. Real photographic detail.')
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await waitFor(() => expect(draw).toHaveBeenCalledWith('', 'a red race car', 1))
  })

  it('an edit stays as typed, changes only its own part, is marked Edited and goes with the draw; Reset brings the default back', async () => {
    const draw = mount()
    fireEvent.change(box('view'), { target: { value: 'seen from above' } })
    expect(box('view').value).toBe('seen from above')
    expect(screen.getByTestId('add-gen-part-view-edited')).toBeTruthy()
    expect(sent()).toContain('a red race car, seen from above, shown whole and fully in frame with clear space around it, nothing cropped, centred on a plain neutral mid-grey background, flat even soft light')
    expect(screen.getByTestId('add-gen-tab-advanced').textContent).toContain('edited')
    fireEvent.click(screen.getByTestId('add-gen-part-nologos'))
    expect(box('rules').value).toBe('no hand, nothing else in the picture, no logos or printed text')
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await waitFor(() => expect(draw).toHaveBeenCalledWith('', 'a red race car', 1, { view: 'seen from above', rules: 'no hand, nothing else in the picture, no logos or printed text' }))
    fireEvent.click(screen.getByTestId('add-gen-part-view-reset'))
    expect(box('view').value).toBe('seen flat on from the front and standing upright')
    expect(screen.queryByTestId('add-gen-part-view-edited')).toBeNull()
  })

  it('clearing a box really clears that part; a view stated in Describe it drops the default view, a side view gets the firm one', async () => {
    const draw = mount()
    fireEvent.change(box('setup'), { target: { value: '' } })
    expect(box('setup').value).toBe('')
    expect(sent()).toBe('What will be sent: A product photograph of a red race car, seen flat on from the front and standing upright, no hand, nothing else in the picture. Real photographic detail.')
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    await waitFor(() => expect(draw).toHaveBeenCalledWith('', 'a red race car', 1, { setup: '', light: '' }))
    fireEvent.click(screen.getByTestId('add-gen-part-setup-reset'))
    fireEvent.click(screen.getByTestId('add-gen-tab-describe'))
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a red race car, from a low angle' } })
    fireEvent.click(screen.getByTestId('add-gen-tab-advanced'))
    expect(box('view').value).toBe('') // its default is left out
    expect(sent()).not.toMatch(/seen flat on from the front/)
    fireEvent.click(screen.getByTestId('add-gen-tab-describe'))
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a red race car, photographed from the side' } })
    fireEvent.click(screen.getByTestId('add-gen-tab-advanced'))
    expect(box('view').value).toMatch(/^a strict side profile/)
    expect(screen.getByTestId('add-gen-parts').textContent).toContain('Describe it asks for a side view')
  })
})


describe('unsent words survive closing (add-prop-draft)', () => {
  const open = (p: Partial<Parameters<typeof AddGenScreen>[0]> = {}) =>
    render(<AddGenScreen price={(n) => n * 6} draw={vi.fn(async () => [])} onClose={() => {}} {...p} />)

  it('brings the label, Describe it and an ADVANCED edit back when the screen is opened again', () => {
    const first = open()
    fireEvent.change(screen.getByTestId('add-gen-name'), { target: { value: 'Cart' } })
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a green hand cart' } })
    fireEvent.click(screen.getByTestId('add-gen-tab-advanced'))
    fireEvent.change(screen.getByTestId('add-gen-part-view'), { target: { value: 'seen from the side' } })
    first.unmount()
    open()
    expect((screen.getByTestId('add-gen-name') as HTMLInputElement).value).toBe('Cart')
    expect((screen.getByTestId('add-gen-desc') as HTMLTextAreaElement).value).toBe('a green hand cart')
    expect(screen.getByTestId('add-gen-tab-advanced').textContent).toContain('edited')
    fireEvent.click(screen.getByTestId('add-gen-tab-advanced'))
    expect((screen.getByTestId('add-gen-part-view') as HTMLTextAreaElement).value).toBe('seen from the side')
  })

  it('forgets them once a candidate is placed, or when every box is emptied by hand', async () => {
    const approve = vi.fn(async () => {})
    const a = open({ draw: vi.fn(async () => ['/d/1.png']), approve })
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a cart' } })
    fireEvent.click(screen.getByTestId('add-gen-draw'))
    fireEvent.click(await screen.findByRole('button', { name: /use this one/i }))
    await waitFor(() => expect(approve).toHaveBeenCalled())
    await waitFor(() => expect(addGenDraft()).toBeNull())
    a.unmount()
    const b = open()
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a barrel' } })
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: '' } })
    b.unmount()
    expect(addGenDraft()).toBeNull()
  })

  it('leaves the draft alone when it is opened on a drawn candidate', () => {
    const a = open()
    fireEvent.change(screen.getByTestId('add-gen-desc'), { target: { value: 'a barrel' } })
    a.unmount()
    const b = open({ initial: { looks: [{ url: '/d/1.png', name: 'Crate', desc: 'a crate' }], sel: 0 }, approve: vi.fn(async () => {}) })
    expect((screen.getByTestId('add-gen-desc') as HTMLTextAreaElement).value).toBe('a crate')
    b.unmount()
    expect(addGenDraft()?.desc).toBe('a barrel')
  })
})
