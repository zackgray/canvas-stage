// "5 min ago" for the Resume list. Pure: `now` is a parameter.
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const min = Math.max(0, Math.floor((now - t) / 60000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`
  const d = Math.floor(h / 24)
  return d < 14 ? (d === 1 ? 'yesterday' : `${d} days ago`) : new Date(t).toLocaleDateString()
}
