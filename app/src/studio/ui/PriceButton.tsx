import { formatPrice } from './format'

// FROZEN PROPS (Wave A contract, docs/plan-build-1022.md §3 A0): screens style around this, never change its props.

export interface PriceButtonProps {
  /** the action, a verb first: "Build world", "Render 2 takes" */
  verb: string
  /**
   * the estimate shown in grey beside the verb: a number = credits ("≈ 32 cr"), 0 = "free", a string is shown as given
   * ("≈ 9–17 cr", "free"). Every paid button passes one; null hides it (only for free, obvious actions).
   */
  price: number | string | null
  onClick?: () => void
  disabled?: boolean
  /** the stage's one primary action (accent fill) */
  primary?: boolean
  /** tooltip, e.g. why it is disabled */
  title?: string
  testId?: string
}

/** A button with its price beside it, in grey. */
export function PriceButton({ verb, price, onClick, disabled, primary, title, testId }: PriceButtonProps) {
  const text = formatPrice(price)
  return (
    <span className="st-pricebtn">
      <button type="button" className={`st-btn${primary ? ' st-primary' : ''}`} onClick={onClick} disabled={disabled} title={title}
        data-testid={testId}>{verb}</button>
      {text !== null && <span className="st-price">{text}</span>}
    </span>
  )
}
