import { useEffect, useReducer } from 'react'

/** Re-render at a fixed rate. The engine is mutable and ticks at render rate; the UI samples it. */
export function useTicker(hz = 15): void {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const id = setInterval(bump, 1000 / hz)
    return () => clearInterval(id)
  }, [hz])
}
