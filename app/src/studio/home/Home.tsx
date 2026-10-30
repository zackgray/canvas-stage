// Home (#/studio): one Start a new scene press (HomeBox) and the Resume list. The press opens the Stage of a scene with no work
// yet: it reuses the newest untouched empty scene when there is one (a fresh "Untitled scene" the owner left blank), else it makes
// a new library scene — Start never piles up empty scenes. Untouched scenes stay off the Resume list (they would be rows the owner
// cannot tell apart); a scene is named from its first words on the Stage, so written scenes name themselves. No viewport, board or
// strip here: they belong to a scene.
import { useState } from 'react'
import { libraryApi, type LibraryApi } from '../../library/api'
import { useScenes } from '../../library/useScenes'
import type { SceneSummary, SceneView } from '../../shared/libraryContract'
import { sceneHash } from '../route'
import './home.css'
import { HomeBox } from './HomeBox'
import { Resume } from './Resume'
import { isUntouched, seedScene } from './startScene'

const DEFAULT_API = libraryApi()

/** (QA run 5, F4) the failed start with the server's own reason when there is one ("A new scene could not be made: …") */
export const problemLine = (problem: string | null, reason: string | null): string | null =>
  problem && reason ? `${problem.replace(/\.$/, '')}: ${reason}` : problem ?? reason

/** `go`: where the address goes (tests pass their own) */
export function Home({ api = DEFAULT_API, go = (h: string) => { window.location.hash = h } }: { api?: LibraryApi; go?: (hash: string) => void }) {
  const lib = useScenes(api)
  const [starting, setStarting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const start = async () => {
    setStarting(true); setProblem(null)
    const reuse = lib.scenes.find(isUntouched)
    if (reuse) { seedScene(viewOf(reuse)); go(sceneHash(reuse.id, 'stage')); return }
    const scene = await lib.create()
    if (!scene) { setStarting(false); setProblem('A new scene could not be made.'); return }
    seedScene(scene)
    go(sceneHash(scene.id, 'stage'))
  }
  const visible = lib.scenes.filter((s) => !isUntouched(s))
  return (
    <div className="st-root st-home" data-testid="studio-home">
      <main className="st-home-body">
        <section className="st-home-launch" data-testid="home-launch">
          <HomeBox onStart={() => void start()} starting={starting} latest={visible[0]} />
          {(problem || lib.error) && <p className="st-warn" role="alert" data-testid="home-error">{problemLine(problem, lib.error)}</p>}
        </section>
        <section className="st-home-resume" aria-label="Resume">
          <div className="st-home-resume-head"><h2>Resume</h2>{visible.length > 0 && <span className="st-home-count">{visible.length} {visible.length === 1 ? 'scene' : 'scenes'}</span>}</div>
          {lib.loading ? <p className="st-muted">Opening your scenes…</p>
            : visible.length === 0 ? <p className="st-resume-empty" data-testid="resume-empty"><b>No scenes yet</b>Start one above and it will wait for you here.</p>
            : <Resume scenes={visible} onRename={(s, name) => void lib.rename(s, name)} onRemove={(s) => void lib.remove(s)} />}
        </section>
      </main>
    </div>
  )
}

/** the SceneView seedScene writes the fresh design under (only id and revision are read there) */
const viewOf = (s: SceneSummary): SceneView => ({
  id: s.id, name: s.name, revision: s.revision, hidden: s.hidden,
  createdAt: s.lastEdited, updatedAt: s.lastEdited, worldId: null, worlds: [],
  summary: s, facts: { setBuilt: false, briefChanged: false, takes: {} },
})
