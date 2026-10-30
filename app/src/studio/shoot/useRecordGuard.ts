import { useEffect, useRef, useState } from 'react'
import { isFormControl } from '../../labs/controller/input/formControl'

/** presses closer together than this are one press: a double or triple click cannot start, stop and discard a take */
export const TRANSITION_MS = 600

/** the slice of the engine's deck the guard reads */
interface Deck { recording: boolean; takeCount: number }

/**
 * Every Record / Stop press on Shoot goes through `press`. A press right after another is ignored (a take that is stopped a
 * few frames after it started is not a take). Starting over an unlocked take asks first (the new one would replace it), and a
 * stop that kept nothing says so instead of leaving the take silently gone. While `wait` is set (the performer is being rebuilt to
 * a new shot length), a press that would start a take does nothing but say so: a take filmed now would run at the old length.
 * Stop always works.
 */
export function useRecordGuard(deck: Deck, unlocked: boolean, wait: () => string | null = () => null, now: () => number = () => Date.now()) {
  const last = useRef(-Infinity)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const WAIT_TAIL = ' Record starts once it is ready.'
  /** read at the press, not at the last render: a length picked in the same frame already holds Record */
  const waitNote = () => { const w = wait(); return w ? `${w}${WAIT_TAIL}` : null }
  const waiting = wait()
  // the rebuild finished: the "wait" note has nothing left to say
  useEffect(() => { if (!waiting) setNote((n) => (n?.endsWith(WAIT_TAIL) ? null : n)) }, [waiting])
  // the take is locked now (its lock found again after a tab switch, or locked meanwhile): "not locked" has nothing left to ask; the
  // press is dropped, never run unasked (owner 2026-10-28: the ask stayed up beside "Take locked")
  useEffect(() => { if (!unlocked) setPending(null) }, [unlocked])
  const run = (action: () => void) => {
    const was = deck.recording, before = deck.takeCount
    action()
    setNote(was && deck.takeCount === before ? 'That was too short to keep, so nothing was recorded. Let it run a moment longer.' : null)
  }
  return {
    note,
    asking: pending !== null,
    press: (action: () => void) => {
      const held = deck.recording ? null : waitNote()
      if (held) return setNote(held)
      const t = now()
      if (t - last.current < TRANSITION_MS) return
      last.current = t
      if (!deck.recording && unlocked) return setPending(() => action)
      run(action)
    },
    confirm: () => { const a = pending; setPending(null); last.current = now(); if (!a) return; const held = deck.recording ? null : waitNote(); if (held) return setNote(held); run(a) },
    cancel: () => setPending(null),
  }
}

/**
 * R is the camera's Record key, and it goes through the same `press` as the button: a rapid second R is ignored, and R over an
 * unlocked take asks first. Capture phase, so the engine's own listener never sees it; where the engine would ignore R (a form
 * control, a modal up) this does too.
 */
export function useRecordKey(press: (action: () => void) => void, toggle: () => void, on = true): void {
  const latest = useRef({ press, toggle })
  latest.current = { press, toggle }
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyR' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isFormControl(e.target)) return
      if (document.querySelector('[aria-modal="true"]')) return
      e.stopImmediatePropagation()
      latest.current.press(latest.current.toggle)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on])
}
