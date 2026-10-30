// A text box that grows with its words (the words drawer): the height follows the content up to the box's CSS max-height, then it scrolls.
import { useLayoutEffect, type RefObject } from 'react'

export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, on = true): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    el.style.height = 'auto'
    if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`
  }, [ref, value, on])
}
