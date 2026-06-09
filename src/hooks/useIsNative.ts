'use client'

import { useEffect, useState } from 'react'

/**
 * Client-side native detection backstop for pricing UI.
 *
 * `resolved` is false until Capacitor has answered. Pricing/checkout UI should
 * render ONLY when `resolved && !isNative` — i.e. default to HIDDEN and reveal
 * only once we've confirmed we're on the web. This way the native app never
 * flashes paid tiers even if the server-side User-Agent gate is bypassed.
 *
 * `serverIsNative` lets a server component seed the answer (read from the
 * native User-Agent) so there is no flash at all on native.
 */
export function useIsNative(serverIsNative = false) {
  const [isNative, setIsNative] = useState(serverIsNative)
  const [resolved, setResolved] = useState(serverIsNative)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        const native = Capacitor.isNativePlatform()
        if (mounted) {
          // Once native, stay native — never downgrade.
          setIsNative((prev) => prev || native)
          setResolved(true)
        }
      } catch {
        if (mounted) setResolved(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  return { isNative, resolved }
}
