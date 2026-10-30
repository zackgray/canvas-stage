import type { PassBox } from '../../shared/passContract'

/** A box of a picture at its own pixels (never scaled; a big box scrolls), so a face is judged at 100 %, not from a thumbnail. */
export function Crop100({ src, box, label, testId }: { src: string; box: PassBox; label: string; testId?: string }) {
  return (
    <div className="st-crop100" data-testid={testId}>
      <div role="img" aria-label={`${label}, at 100 %`} title={`${label}, at 100 %`}
        style={{ width: box.w, height: box.h, backgroundImage: `url("${src}")`, backgroundPosition: `-${box.x}px -${box.y}px`, backgroundRepeat: 'no-repeat' }} />
    </div>
  )
}
