import { useEffect, useRef, useState } from 'react'

import { DEFAULT_SETTINGS, type PyApi, type Settings } from '../lib/bridge'

/** Settings live in %APPDATA%\Unmark\settings.json (pywebview's origin changes every launch). */
export function useSettings(api: PyApi | null | undefined) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const loaded = useRef(false)

  useEffect(() => {
    if (!api) return
    void api.get_settings().then((saved) => {
      setSettings({ ...DEFAULT_SETTINGS, ...saved })
      loaded.current = true
    })
  }, [api])

  useEffect(() => {
    if (!api || !loaded.current) return
    const timer = window.setTimeout(() => void api.save_settings(settings), 300)
    return () => window.clearTimeout(timer)
  }, [api, settings])

  const update = (patch: Partial<Settings>) => {
    // A different detector model: start loading it now rather than on the next image.
    if (api && patch.model && patch.model !== settings.model) void api.warmup({ ...settings, ...patch })
    setSettings((current) => ({ ...current, ...patch }))
  }

  return [settings, update] as const
}
