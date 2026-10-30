// FROZEN PROPS (Wave A contract, docs/plan-build-1022.md §3 A0): screens style around these, never change their props.
// Field / Select / Toggle: the studio's styled inputs (dark surface, one control height; no white native widgets).

export interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** a textarea instead of a one-line input */
  multiline?: boolean
  rows?: number
  type?: 'text' | 'number'
  placeholder?: string
  /** one short grey line under the control */
  hint?: string
  disabled?: boolean
  testId?: string
}

export function Field({ label, value, onChange, multiline, rows = 3, type = 'text', placeholder, hint, disabled, testId }: FieldProps) {
  return (
    <label className="st-field">
      {label}
      {multiline
        ? <textarea className="st-input" rows={rows} value={value} placeholder={placeholder} disabled={disabled} data-testid={testId}
            onChange={(e) => onChange(e.target.value)} />
        : <input className="st-input" type={type} value={value} placeholder={placeholder} disabled={disabled} data-testid={testId}
            onChange={(e) => onChange(e.target.value)} />}
      {hint && <span className="st-field-hint">{hint}</span>}
    </label>
  )
}

export interface SelectOption<T extends string> { value: T; label: string }

export interface SelectProps<T extends string> {
  label: string
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  hint?: string
  disabled?: boolean
  testId?: string
}

export function Select<T extends string>({ label, value, options, onChange, hint, disabled, testId }: SelectProps<T>) {
  return (
    <label className="st-field">
      {label}
      <select className="st-select" value={value} disabled={disabled} data-testid={testId} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span className="st-field-hint">{hint}</span>}
    </label>
  )
}

export interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  testId?: string
}

export function Toggle({ label, checked, onChange, disabled, testId }: ToggleProps) {
  return (
    <label className="st-toggle">
      <input type="checkbox" checked={checked} disabled={disabled} data-testid={testId} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
