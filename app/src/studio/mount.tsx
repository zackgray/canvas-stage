import { lazy, Suspense } from 'react'
import type { StudioRoute } from './route'

const StudioApp = lazy(() => import('./StudioApp'))

/** The studio, loaded on demand. App.tsx's one route line: `const studio = parseStudioRoute(labId); if (studio) return <StudioRoot …/>`. */
export function StudioRoot({ route }: { route: StudioRoute }) {
  return (
    <Suspense fallback={<p className="lab-loading">Loading the studio…</p>}>
      <StudioApp route={route} />
    </Suspense>
  )
}
