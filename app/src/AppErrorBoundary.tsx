// The app's last line of defence (QA run 5, F4): a render error anywhere below used to blank the whole page. It now shows what
// went wrong in one line and a Reload press; nothing on disk is touched (every saved scene, take and paid result stays).
import { Component, type ReactNode } from 'react'

type State = { error: Error | null }

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  render() {
    const e = this.state.error
    if (!e) return this.props.children
    const first = (e.message || e.name || 'Unknown error').split('\n')[0].slice(0, 300)
    return (
      <div className="st-root" role="alert" data-testid="app-crash" style={{ padding: 32, color: 'var(--st-text, #eee)', background: 'var(--st-bg, #111)', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 20 }}>Something went wrong. Reload the page.</h1>
        <p className="st-muted" data-testid="app-crash-reason">{first}</p>
        <p className="st-muted">Your scenes, takes and paid results are saved; reloading does not spend anything.</p>
        <button type="button" className="st-btn st-primary" data-testid="app-crash-reload" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
