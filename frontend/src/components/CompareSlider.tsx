import { Chip } from '@heroui/react'
import { ChevronsExpandHorizontal } from '@gravity-ui/icons'
import { useEffect, useRef, useState } from 'react'

import type { CompareImages } from '../lib/bridge'

interface Props extends CompareImages {
  width: number
  height: number
  showMask: boolean
  /** Sweep from "all before" to the middle once, so the change is obvious. */
  intro?: boolean
  className?: string
}

const clamp = (n: number) => Math.min(100, Math.max(0, n))
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function CompareSlider({ before, after, mask, width, height, showMask, intro = false, className = '' }: Props) {
  const playIntro = intro && !prefersReducedMotion()
  const [pos, setPos] = useState(playIntro ? 100 : 50)
  const [introOn, setIntroOn] = useState(playIntro)
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!playIntro) return
    // Two frames so the starting position paints before the transition target is set.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPos(50))
    })
    const done = window.setTimeout(() => setIntroOn(false), 700)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(done)
    }
  }, [playIntro])

  const moveTo = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setPos(clamp(((clientX - rect.left) / rect.width) * 100))
  }

  return (
    <div className={`stage__fit ${className}`} style={{ ['--ar' as string]: width / height }}>
      <div
        ref={ref}
        className="compare"
        role="slider"
        tabIndex={0}
        aria-label="Before and after. Drag or use the arrow keys."
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        data-intro={introOn}
        data-dragging={dragging}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          setIntroOn(false)
          setDragging(true)
          moveTo(e.clientX)
        }}
        onPointerMove={(e) => dragging && moveTo(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2
          const next =
            e.key === 'ArrowLeft' ? pos - step : e.key === 'ArrowRight' ? pos + step : e.key === 'Home' ? 0 : e.key === 'End' ? 100 : null
          if (next === null) return
          e.preventDefault()
          setIntroOn(false)
          setPos(clamp(next))
        }}
      >
        <img className="stage__img" src={after} alt="After" draggable={false} />
        <img
          className="stage__img compare__before"
          src={before}
          alt="Before"
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        {mask && (
          <div
            className="compare__mask"
            data-visible={showMask}
            style={{ maskImage: `url(${mask})`, WebkitMaskImage: `url(${mask})` }}
          />
        )}
        <div className="compare__handle" style={{ transform: `translateX(${pos}%)` }}>
          <span className="compare__line" />
          <span className="compare__knob">
            <ChevronsExpandHorizontal width={16} height={16} />
          </span>
        </div>
        <Chip size="sm" className="compare__label left-3" style={{ opacity: pos < 12 ? 0 : 1 }}>
          Before
        </Chip>
        <Chip size="sm" className="compare__label right-3" style={{ opacity: pos > 88 ? 0 : 1 }}>
          After
        </Chip>
      </div>
    </div>
  )
}
