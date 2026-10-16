import { Button } from '@heroui/react'
import { Xmark } from '@gravity-ui/icons'
import { useEffect, useRef, useState, type PointerEvent } from 'react'

import { clamp01, type BoxShape, type Point, type Shape, type Tool } from '../lib/regions'

interface Props {
  shapes: Shape[]
  onChange: (shapes: Shape[]) => void
  tool: Tool
  /** Brush radius, as a fraction of the shorter side. */
  brush: number
  /** The image's pixel size: the drawing's coordinate space. */
  width: number
  height: number
  editable: boolean
}

const MIN_BOX_PX = 4 // smaller drags are clicks (select a box)

/**
 * Draw boxes or brush strokes over an image that fills its parent (.stage__fit). Direct
 * manipulation, so nothing here animates. Delete removes the selected box, Ctrl+Z undoes.
 */
export function RegionEditor({ shapes, onChange, tool, brush, width, height, editable }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const start = useRef<{ point: Point; hit: Shape | null } | null>(null)
  const [draft, setDraft] = useState<Shape | null>(null)
  // The selected box itself, not its index: undo or clear elsewhere can't make it point at another shape.
  const [selected, setSelected] = useState<Shape | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const side = Math.min(width, height)

  const toPoint = (e: PointerEvent): Point => {
    const rect = ref.current!.getBoundingClientRect()
    return [clamp01((e.clientX - rect.left) / rect.width), clamp01((e.clientY - rect.top) / rect.height)]
  }
  const pixels = (a: Point, b: Point) => Math.hypot((a[0] - b[0]) * width, (a[1] - b[1]) * height)

  const boxAt = ([x, y]: Point): Shape | null =>
    [...shapes].reverse().find((s) => s.kind === 'box' && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) ?? null

  const picked = selected?.kind === 'box' && shapes.includes(selected) ? selected : null

  const remove = (shape: Shape) => {
    onChange(shapes.filter((s) => s !== shape))
    setSelected(null)
  }

  // Keyboard: Delete removes the selected box, Ctrl+Z the last region, Escape deselects.
  useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && picked) {
        e.preventDefault()
        remove(picked)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && shapes.length) {
        e.preventDefault()
        onChange(shapes.slice(0, -1))
        setSelected(null)
      } else if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!editable || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const point = toPoint(e)
    if (tool === 'box') {
      start.current = { point, hit: boxAt(point) }
    } else {
      setSelected(null)
      setDraft({ kind: 'stroke', r: brush, points: [point] })
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!editable) return
    const point = toPoint(e)
    if (tool === 'brush') setCursor(point)
    if (tool === 'box' && start.current) {
      const from = start.current.point
      if (pixels(from, point) < MIN_BOX_PX) return
      setDraft({
        kind: 'box',
        x: Math.min(from[0], point[0]),
        y: Math.min(from[1], point[1]),
        w: Math.abs(point[0] - from[0]),
        h: Math.abs(point[1] - from[1]),
      })
    } else if (draft?.kind === 'stroke') {
      const last = draft.points[draft.points.length - 1]
      // Keep the path light: a new point every third of the brush radius.
      if (pixels(last, point) >= Math.max(2, (draft.r * side) / 3)) setDraft({ ...draft, points: [...draft.points, point] })
    }
  }

  const onPointerUp = () => {
    if (!editable) return
    if (draft) {
      onChange([...shapes, draft])
      if (draft.kind === 'box') setSelected(draft)
    } else if (start.current) {
      setSelected(start.current.hit) // a click: select the box under it, or deselect
    }
    start.current = null
    setDraft(null)
  }

  const box = (s: BoxShape) => ({ x: s.x * width, y: s.y * height, width: s.w * width, height: s.h * height })
  const path = (points: Point[]) =>
    points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * width).toFixed(1)} ${(y * height).toFixed(1)}`).join(' ') +
    (points.length === 1 ? ` L${(points[0][0] * width).toFixed(1)} ${(points[0][1] * height).toFixed(1)}` : '')

  const strokes = [...shapes, ...(draft ? [draft] : [])].filter((s) => s.kind === 'stroke')

  return (
    <div
      ref={ref}
      className="regions absolute inset-0"
      data-tool={tool}
      data-editable={editable}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setCursor(null)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
        {/* One translucent group, so overlapping strokes don't get darker. */}
        <g className="regions__strokes">
          {strokes.map((s, i) => (
            <path key={i} d={path(s.points)} strokeWidth={2 * s.r * side} />
          ))}
        </g>
        {shapes.map((s, i) =>
          s.kind === 'box' ? (
            <rect key={i} className="regions__box" data-selected={s === picked} vectorEffect="non-scaling-stroke" {...box(s)} />
          ) : null,
        )}
        {draft?.kind === 'box' && <rect className="regions__draft" vectorEffect="non-scaling-stroke" {...box(draft)} />}
        {tool === 'brush' && editable && cursor && (
          <circle className="regions__cursor" vectorEffect="non-scaling-stroke" cx={cursor[0] * width} cy={cursor[1] * height} r={brush * side} />
        )}
      </svg>
      {picked && editable && (
        // Own pointer handling: a press here must not start a new box.
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(picked.x + picked.w) * 100}%`, top: `${picked.y * 100}%` }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <Button isIconOnly size="sm" variant="danger" aria-label="Remove region" onPress={() => remove(picked)}>
            <Xmark />
          </Button>
        </span>
      )}
    </div>
  )
}
