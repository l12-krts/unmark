// The Python side (app/api.py), as pywebview exposes it on window.pywebview.api.
// Long work reports back through `unmark` CustomEvents on window.

import { useEffect, useRef } from 'react'

export interface ImageItem {
  id: string
  path: string
  name: string
  bytes: number
  width: number
  height: number
  thumb: string
}

export type Detector = 'box' | 'segment'
export type ModelSize = 'large' | 'base'
export type Strategy = 'crop' | 'fast' | 'original'

export interface Settings {
  prompt: string
  detector: Detector
  model: ModelSize
  expand: number
  strategy: Strategy
  outputDir: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  prompt: 'watermark',
  detector: 'box',
  model: 'large',
  expand: 6,
  strategy: 'crop',
  outputDir: null,
}

export type EngineState = 'starting' | 'idle' | 'downloading' | 'loading' | 'ready' | 'error'

export interface EngineStatus {
  state: EngineState
  message: string
  device: 'cuda' | 'cpu' | null
  gpu: string | null
}

export interface CompareImages {
  before: string
  after: string
  mask: string | null
}

export interface SingleResult extends CompareImages {
  id: string
  regions: number
  seconds: number
}

export type ItemState = 'queued' | 'running' | 'done' | 'empty' | 'error'

export type UnmarkEvent =
  | ({ type: 'engine' } & EngineStatus)
  | { type: 'stage'; job: 'single' | 'batch'; id?: string; stage: string }
  | { type: 'dropped'; items: ImageItem[] }
  | { type: 'batch'; state: 'running' | 'failed' | 'cancelled' | 'finished'; total?: number; error?: string; output?: string }
  | {
      type: 'batch-item'
      id: string
      state: Exclude<ItemState, 'queued'>
      output?: string
      regions?: number
      seconds?: number
      thumb?: string
      error?: string
    }

export interface PyApi {
  status(): Promise<EngineStatus>
  warmup(settings: Settings): Promise<void>
  get_settings(): Promise<Partial<Settings>>
  save_settings(settings: Settings): Promise<void>
  pick_images(multiple: boolean): Promise<ImageItem[]>
  pick_folder(): Promise<ImageItem[]>
  pick_output_dir(): Promise<string | null>
  describe(paths: string[]): Promise<ImageItem[]>
  preview(path: string): Promise<string>
  open_path(path: string): Promise<void>
  reveal(path: string): Promise<void>
  remove_single(path: string, settings: Settings): Promise<SingleResult>
  save_single(resultId: string, sourcePath: string): Promise<string | null>
  start_batch(items: { id: string; path: string }[], settings: Settings, outputDir: string): Promise<boolean>
  cancel_batch(): Promise<void>
  batch_compare(itemId: string, source: string, output: string): Promise<CompareImages>
}

declare global {
  interface Window {
    pywebview?: { api: PyApi }
  }
}

/** Resolves with the API once pywebview has injected it, or null when running in a plain browser. */
export function connect(timeoutMs = 5000): Promise<PyApi | null> {
  return new Promise((resolve) => {
    if (window.pywebview?.api?.status) return resolve(window.pywebview.api)
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    window.addEventListener(
      'pywebviewready',
      () => {
        window.clearTimeout(timer)
        resolve(window.pywebview?.api ?? null)
      },
      { once: true },
    )
  })
}

export function useUnmarkEvents(handler: (event: UnmarkEvent) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const listener = (e: Event) => ref.current((e as CustomEvent<UnmarkEvent>).detail)
    window.addEventListener('unmark', listener)
    return () => window.removeEventListener('unmark', listener)
  }, [])
}

/** pywebview rejects with an Error-like object carrying the Python exception text. */
export function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path
export const parentDir = (path: string) => path.replace(/[\\/][^\\/]*$/, '')

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
