import { useEffect, useState } from 'react'

// HeroUI's --ease-out-quint and --ease-in-out-quart, for Motion (which can't read CSS variables).
export const EASE_OUT = [0.23, 1, 0.32, 1] as const
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const

/**
 * False on a view's first render, true after. Gate entrance animations with it so content
 * animates when it changes, not when the view mounts (switching tabs, often by keyboard,
 * must stay instant).
 */
export function useAfterMount(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}
