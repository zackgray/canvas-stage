// The Describe-a-move panel barrel (Track E, docs/plan-kimodo-live.md section 5). The join (Track D) imports from here:
// DescribeMoveButton goes in Blocking's ActionList next to Stop · Look · Turn · Kneel · Lift a frame, the panel hosts
// DescribeMovePanel (passing the picked point, the Set's kit and the hero's tag), and MotionHealthLine sits on Blocking's header.
export { DescribeMoveButton } from './DescribeMoveButton'
export { DescribeMovePanel, type DescribeMovePanelProps, type PickedMove } from './DescribeMovePanel'
export { MotionHealthLine } from './MotionHealthLine'
export { FallbackRow, type FallbackMove } from './FallbackRow'
export { useMotionComputer } from './useMotionComputer'
export { reachPieces, pieceWorldBox, type ReachPiece } from './pieces'
