/** Browser-safe (types only): the DoF part of a finish id, shared by the still and the clip finish and their clients. */
import type { FinishDof } from './types.ts'

/** "-dof-lf-f1_4-2_60m": the DoF part of a finish id (ids allow only word characters and dashes). */
export const dofTag = (d: FinishDof | undefined) =>
  d ? `-dof-${d.format}-f${String(d.fNumber).replace('.', '_')}-${d.focusM.toFixed(2).replace('.', '_')}m` : ''
