export interface SegItem<T extends string> { id: T; label: string; disabled?: boolean; title?: string }

/** A segmented control: one choice of a few, one line. */
export function Seg<T extends string>({ items, value, onChange, small, label, testId }: {
  items: readonly SegItem<T>[]; value: T | null; onChange: (id: T) => void; small?: boolean; label: string; testId?: string
}) {
  return (
    <div className={`st-seg${small ? ' st-seg-small' : ''}`} role="group" aria-label={label} data-testid={testId}>
      {items.map((it) => (
        <button key={it.id} type="button" className={it.id === value ? 'st-seg-on' : undefined} aria-pressed={it.id === value}
          disabled={it.disabled} title={it.title} data-testid={testId ? `${testId}-${it.id}` : undefined}
          onClick={(e) => { onChange(it.id); e.currentTarget.blur() }}>{it.label}</button>
      ))}
    </div>
  )
}

/** A small uppercase section head with an optional count or hint on the right. */
export function RowHead({ title, hint }: { title: string; hint?: string }) {
  return <div className="st-rowhead"><h2>{title}</h2>{hint && <span className="st-muted">{hint}</span>}</div>
}
