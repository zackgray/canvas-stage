// The tab bar's three stages, in order (after Home), and the words Home's Resume list gives how far a scene has got. Pure, so the
// tab bar, the Resume list and the tests read the same words.
import type { SceneStageReached } from '../../shared/libraryContract'

export const STEPS = ['stage', 'render', 'export'] as const
export type Step = (typeof STEPS)[number]

export const STEP_LABEL: Record<Step, string> = { stage: 'Stage', render: 'Render', export: 'Export' }

/** the label Home's Resume list gives how far a scene has got: 'set'/'shoot' were saved before the merge (they reached the Stage);
 *  the Brief and Board no longer exist, so a scene saved there has not been built */
export const reachedLabel = (r: SceneStageReached): string => (r === 'brief' || r === 'board' ? 'Not built yet' : r === 'set' || r === 'shoot' ? 'Stage' : STEP_LABEL[r])
