import { toast } from '@heroui/react'
import { useMemo, useState } from 'react'

import { errorText, parentDir, type ImageItem, type ItemState, type PyApi, type Settings, type UnmarkEvent } from '../lib/bridge'
import type { Shape } from '../lib/regions'

export interface BatchItem extends ImageItem {
  state: ItemState
  stage?: string
  output?: string
  regions?: number
  seconds?: number
  resultThumb?: string
  error?: string
  /** Position within the set it was added with: drives the entry stagger. */
  enter: number
}

const TERMINAL: ItemState[] = ['done', 'empty', 'error']

export function useBatch(api: PyApi | null | undefined, settings: Settings) {
  const [items, setItems] = useState<BatchItem[]>([])
  const [running, setRunning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [runIds, setRunIds] = useState<string[]>([])
  const [lastOutput, setLastOutput] = useState<string | null>(null)
  /** Regions drawn once and applied at the same place on every image. */
  const [shapes, setShapes] = useState<Shape[]>([])

  const outputDir = settings.outputDir ?? (items[0] ? `${parentDir(items[0].path)}\\unmarked` : null)

  const add = (incoming: ImageItem[]) => {
    const known = new Set(items.map((i) => i.path.toLowerCase()))
    const fresh = incoming.filter((i) => !known.has(i.path.toLowerCase()))
    if (incoming.length && !fresh.length) toast('Those images are already in the list')
    setItems((current) => [...current, ...fresh.map((i, n) => ({ ...i, state: 'queued' as const, enter: n }))])
  }

  const pickImages = async () => api && add(await api.pick_images(true))
  const pickFolder = async () => {
    if (!api) return
    const found = await api.pick_folder()
    if (!found.length) toast('No images in that folder')
    add(found)
  }

  const remove = (id: string) => setItems((current) => current.filter((i) => i.id !== id))
  const clear = () => {
    setItems([])
    setRunIds([])
  }

  const pending = items.filter((i) => i.state !== 'done')
  const targets = pending.length ? pending : items

  // With detection off there must be something drawn, or nothing would happen.
  const canStart = settings.detector !== 'none' || shapes.length > 0

  const start = async () => {
    if (!api || !outputDir || running || !targets.length || !canStart) return
    const ids = new Set(targets.map((i) => i.id))
    setItems((current) =>
      current.map((i) =>
        ids.has(i.id) ? { ...i, state: 'queued', stage: undefined, error: undefined, regions: undefined, output: undefined, resultThumb: undefined } : i,
      ),
    )
    setRunIds([...ids])
    setRunning(true)
    try {
      const ok = await api.start_batch(
        targets.map(({ id, path }) => ({ id, path })),
        settings,
        outputDir,
        shapes,
      )
      if (!ok) setRunning(false)
    } catch (err) {
      setRunning(false)
      toast.danger(errorText(err))
    }
  }

  const cancel = () => {
    if (!api) return
    setCancelling(true)
    void api.cancel_batch()
  }

  const onStage = (id: string | undefined, stage: string) =>
    setItems((current) => current.map((i) => (i.id === id ? { ...i, stage } : i)))

  const onEvent = (event: UnmarkEvent) => {
    if (event.type === 'batch-item') {
      setItems((current) =>
        current.map((i) =>
          i.id === event.id
            ? {
                ...i,
                state: event.state,
                stage: event.state === 'running' ? 'Starting' : undefined,
                output: event.output,
                regions: event.regions,
                seconds: event.seconds,
                resultThumb: event.thumb,
                error: event.error,
              }
            : i,
        ),
      )
    } else if (event.type === 'batch') {
      if (event.state === 'running') return setRunning(true)
      setRunning(false)
      setCancelling(false)
      if (event.output) setLastOutput(event.output)
      if (event.state === 'failed') toast.danger(event.error ?? 'The batch could not start')
      if (event.state === 'cancelled') toast('Batch stopped')
      if (event.state === 'finished' && api && event.output) {
        const out = event.output
        toast.success('Batch finished', {
          description: out,
          actionProps: { children: 'Open folder', onPress: () => void api.open_path(out) },
        })
      }
    }
  }

  const progress = useMemo(() => {
    const run = items.filter((i) => runIds.includes(i.id))
    const finished = run.filter((i) => TERMINAL.includes(i.state))
    const timed = finished.filter((i) => i.seconds)
    const average = timed.length ? timed.reduce((sum, i) => sum + (i.seconds ?? 0), 0) / timed.length : null
    return {
      total: run.length,
      finished: finished.length,
      secondsLeft: average && running ? Math.round(average * (run.length - finished.length)) : null,
    }
  }, [items, runIds, running])

  const counts = useMemo(
    () => ({
      done: items.filter((i) => i.state === 'done').length,
      empty: items.filter((i) => i.state === 'empty').length,
      error: items.filter((i) => i.state === 'error').length,
    }),
    [items],
  )

  return {
    items,
    running,
    cancelling,
    shapes,
    setShapes,
    canStart,
    outputDir,
    lastOutput,
    targets: targets.length,
    allDone: !pending.length && items.length > 0,
    progress,
    counts,
    add,
    pickImages,
    pickFolder,
    remove,
    clear,
    start,
    cancel,
    onStage,
    onEvent,
  }
}

export type BatchController = ReturnType<typeof useBatch>
