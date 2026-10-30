import { useState, type ReactNode } from 'react'
import { readAdvancedOpen, writeAdvancedOpen } from './advancedState'

// FROZEN PROPS (Wave A contract, docs/plan-build-1022.md §3 A0): screens style around this, never change its props.

export interface AdvancedProps {
  /** the stage (or any stable key) whose open state is remembered: localStorage `canvas.studio.advanced.<stage>` */
  stage: string
  children: ReactNode
  /** summary text; default "Advanced" */
  label?: string
  /** used until the user has opened or closed it once; default closed */
  defaultOpen?: boolean
}

/** One Advanced drawer per stage; its open state survives a reload and a stage switch. */
export function Advanced({ stage, children, label = 'Advanced', defaultOpen = false }: AdvancedProps) {
  const [open, setOpen] = useState(() => readAdvancedOpen(stage, defaultOpen))
  return (
    <details className="st-adv" open={open} data-testid={`advanced-${stage}`}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open
        if (next === open) return
        setOpen(next)
        writeAdvancedOpen(stage, next)
      }}>
      <summary>{label}</summary>
      {children}
    </details>
  )
}
