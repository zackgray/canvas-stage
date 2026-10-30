import type { PromptWarning } from '../shared/stillPressContract'

/**
 * (prompt wave) the warn-only notes under a prompt field, one muted line each. They only tell: the text is never changed or blocked.
 * Shared by Shoot's StillPreview and Render's PromptBox.
 */
export function PromptWarnings({ warnings, testId }: { warnings?: PromptWarning[]; testId: string }) {
  if (!warnings?.length) return null
  return (
    <ul className="st-warn" data-testid={testId} style={{ margin: 0, paddingLeft: 18 }}>
      {warnings.map((w) => <li key={w.code} data-code={w.code}>{w.message}</li>)}
    </ul>
  )
}

/** a read-only line showing a prompt the app writes itself (the Klein finish, the face redraw); editing it is deferred */
export function ReadOnlyPrompt({ label, text, testId }: { label: string; text?: string; testId: string }) {
  if (!text) return null
  return (
    <label className="st-field">
      <span>{label} (read-only)</span>
      <textarea className="st-input" rows={3} readOnly value={text} data-testid={testId} style={{ width: '100%' }} />
    </label>
  )
}
