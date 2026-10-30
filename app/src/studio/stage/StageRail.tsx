// The floating option rail — RETIRED by the object card wave (W1-E1, owner 2026-10-28): everything about a thing in the scene now
// lives in its one object card (panels/ObjectCard.tsx: the person's looks and maker, a prop's pictures and 3D build), opened by a
// click on the thing, so the left options strip over the viewport shows nothing any more. The movement controls stay in the right
// panel; the viewport right-click menu (walk cycle, Edit look, Duplicate, Remove, Add here) is a later track. This renders null
// while the rail's own plumbing stays in the tree, switched off, not deleted: the workspace still publishes its content
// (useRailContent) and the menus still reach the pick's choose through the bus (railBus), so the later track can put the menus back
// without re-wiring. (The old card viewer and the add-creature screen it opened are gone.)
export function StageRail({ show }: { show: boolean }) {
  void show
  return null
}
