import { Spinner } from '@heroui/react'
import { Picture } from '@gravity-ui/icons'
import type { ReactNode } from 'react'

interface Props {
  title: string
  description: string
  dragging: boolean
  adding: boolean
  /** Play the entrance (only when this replaces other content, not on mount). */
  animate?: boolean
  children: ReactNode
}

export function DropZone({ title, description, dragging, adding, animate = false, children }: Props) {
  return (
    <div
      className={`dropzone flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-border p-10 text-center ${animate ? 'view-enter' : ''}`}
      data-dragging={dragging}
    >
      <div className="dropzone__icon grid size-14 place-items-center rounded-full bg-default text-muted">
        {adding ? <Spinner size="sm" color="current" /> : <Picture width={24} height={24} />}
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-lg font-semibold">{dragging ? 'Drop to add' : title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  )
}

/** Shown over a view that already has content while files are dragged over the window. */
export function DropOverlay({ visible, label }: { visible: boolean; label: string }) {
  return (
    <div
      className="drop-overlay pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-accent bg-background/85"
      style={{ opacity: visible ? 1 : 0 }}
      data-visible={visible}
      aria-hidden={!visible}
    >
      <p className="drop-overlay__label text-lg font-semibold">{label}</p>
    </div>
  )
}
