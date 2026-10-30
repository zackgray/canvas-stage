// Pure helpers behind the studio primitives (kept out of the component files for fast refresh).

/** "≈ 32 cr", "free", or the string as given; null for no price. */
export function formatPrice(price: number | string | null): string | null {
  if (price === null) return null
  if (typeof price === 'string') return price
  if (!Number.isFinite(price) || price <= 0) return 'free'
  return `≈ ${Math.round(price * 10) / 10} cr`
}

/** "0:07", "4:32", "1:02:09" */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}
