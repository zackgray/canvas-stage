import { useEffect, useRef, type ReactNode } from 'react'

export interface AskProps {
  /** the question, in plain words ("Clear this brief and board?") */
  children: ReactNode
  /** the button that goes ahead ("Clear and start again") */
  yes: string
  /** the button that backs out ("Keep it") */
  no: string
  onYes: () => void
  onNo: () => void
  /** shown as the group's name to screen readers */
  label: string
  testId?: string
}

/**
 * An inline "are you sure?" in place of the button that asked it. Escape backs out, and the safe answer has focus,
 * so Enter never goes ahead by accident. Test ids: `<testId>`, `<testId>-yes`, `<testId>-no`.
 */
export function Ask({ children, yes, no, onYes, onNo, label, testId = 'ask' }: AskProps) {
  const noRef = useRef<HTMLButtonElement>(null)
  const onNoRef = useRef(onNo)
  onNoRef.current = onNo
  useEffect(() => {
    noRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onNoRef.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <span className="st-ask" role="group" aria-label={label} data-testid={testId}>
      {children}
      <button type="button" onClick={onYes} data-testid={`${testId}-yes`}>{yes}</button>
      <button type="button" ref={noRef} onClick={onNo} data-testid={`${testId}-no`}>{no}</button>
    </span>
  )
}
