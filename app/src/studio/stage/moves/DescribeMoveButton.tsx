// The action button that opens the Describe-a-move panel, sitting next to Stop · Look · Turn · Kneel · Lift a frame (plan
// section 5, decision D11). The join (Track D) places it in Blocking's ActionList and owns the open state; the panel itself
// is not a modal, so the 3D view stays live while it shows.
export function DescribeMoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="st-btn" data-testid="describe-move-open" title="Describe a new move in your own words; the motion computer makes it"
      onClick={onClick} disabled={disabled}>
      Describe a move…
    </button>
  )
}
