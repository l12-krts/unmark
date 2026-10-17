import { toast } from '@heroui/react'
import { useRef, useState } from 'react'

import { errorText, fileName, type ImageItem, type PyApi, type Settings, type SingleResult } from '../lib/bridge'
import type { Shape } from '../lib/regions'

export type SingleStatus = 'empty' | 'ready' | 'working' | 'done'

interface State {
  item: ImageItem | null
  preview: string | null
  status: SingleStatus
  stage: string
  result: SingleResult | null
  error: string | null
  /** Regions drawn on this image. */
  shapes: Shape[]
}

const EMPTY: State = { item: null, preview: null, status: 'empty', stage: '', result: null, error: null, shapes: [] }

export function useSingle(api: PyApi | null | undefined, settings: Settings) {
  const [state, setState] = useState<State>(EMPTY)
  // Results and previews can land after the user moved on to another image.
  const current = useRef<string | null>(null)

  const open = async (item: ImageItem) => {
    current.current = item.id
    setState({ ...EMPTY, item, status: 'ready' })
    if (!api) return
    try {
      const preview = await api.preview(item.path)
      if (current.current === item.id) setState((s) => ({ ...s, preview }))
    } catch {
      // The thumbnail stays up; processing will report a real problem.
    }
  }

  const pick = async () => {
    if (!api) return
    const [item] = await api.pick_images(false)
    if (item) await open(item)
  }

  const run = async () => {
    const item = state.item
    if (!api || !item || state.status === 'working') return
    setState((s) => ({ ...s, status: 'working', stage: 'Starting', error: null, result: null }))
    try {
      const result = await api.remove_single(item.path, settings, state.shapes)
      if (current.current === item.id) setState((s) => ({ ...s, status: 'done', result }))
    } catch (err) {
      if (current.current === item.id) setState((s) => ({ ...s, status: 'ready', error: errorText(err) }))
    }
  }

  const save = async () => {
    const { item, result } = state
    if (!api || !item || !result) return
    try {
      const saved = await api.save_single(result.id, item.path)
      if (saved)
        toast.success(`Saved ${fileName(saved)}`, {
          actionProps: { children: 'Show in folder', onPress: () => void api.reveal(saved) },
        })
    } catch (err) {
      toast.danger(errorText(err))
    }
  }

  const clear = () => {
    current.current = null
    setState(EMPTY)
  }

  const onStage = (stage: string) => setState((s) => (s.status === 'working' ? { ...s, stage } : s))

  const setShapes = (shapes: Shape[]) => setState((s) => ({ ...s, shapes }))

  /** Back from a result to the image, regions kept, to change them and run again. */
  const editRegions = () => setState((s) => ({ ...s, status: 'ready', result: null, error: null }))

  return { ...state, open, pick, run, save, clear, onStage, setShapes, editRegions }
}

export type SingleController = ReturnType<typeof useSingle>
