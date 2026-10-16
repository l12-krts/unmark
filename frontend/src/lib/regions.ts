// Regions drawn by hand. Coordinates are fractions of the image (0..1), so one set of regions fits
// any image size: that's how a batch reuses them. Mirrors regions_mask() in app/engine.py.

export type Point = [number, number]

export interface BoxShape {
  kind: 'box'
  x: number
  y: number
  w: number
  h: number
}

export interface StrokeShape {
  kind: 'stroke'
  /** Brush radius as a fraction of the image's shorter side. */
  r: number
  points: Point[]
}

export type Shape = BoxShape | StrokeShape
export type Tool = 'box' | 'brush'

/** Brush size slider steps (1..12) to a radius: 0.5% .. 6% of the shorter side. */
export const brushRadius = (step: number) => step / 200

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function regionCount(n: number): string {
  return `${n} drawn ${n === 1 ? 'region' : 'regions'}`
}
