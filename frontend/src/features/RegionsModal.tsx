import { Button, Modal } from '@heroui/react'
import { ChevronLeft, ChevronRight } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'

import { RegionEditor } from '../components/RegionEditor'
import { RegionToolbar } from '../components/RegionToolbar'
import type { PyApi } from '../lib/bridge'
import { brushRadius, type Shape, type Tool } from '../lib/regions'
import type { BatchItem } from '../state/useBatch'

interface Props {
  api: PyApi
  items: BatchItem[]
  shapes: Shape[]
  onChange: (shapes: Shape[]) => void
  isOpen: boolean
  onClose: () => void
}

/** Draw regions once for the whole batch; flip through the images to check they land on the mark. */
export function RegionsModal({ api, items, shapes, onChange, isOpen, onClose }: Props) {
  const [index, setIndex] = useState(0)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [tool, setTool] = useState<Tool>('box')
  const [brushStep, setBrushStep] = useState(4)
  const item = items[Math.min(index, items.length - 1)]

  useEffect(() => {
    if (!isOpen || !item || previews[item.id]) return
    let live = true
    api
      .preview(item.path)
      .then((url) => live && setPreviews((p) => ({ ...p, [item.id]: url })))
      .catch(() => undefined) // the thumbnail stays up
    return () => {
      live = false
    }
  }, [api, isOpen, item, previews])

  const step = (delta: number) => setIndex((i) => (i + delta + items.length) % items.length)

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="lg">
        <Modal.Dialog className="w-[min(1100px,92vw)] max-w-none">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Regions for every image</Modal.Heading>
            <p className="text-sm text-muted">Draw on one image; the same spots are cleaned on all of them.</p>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3">
            <RegionToolbar
              tool={tool}
              onTool={setTool}
              brushStep={brushStep}
              onBrushStep={setBrushStep}
              count={shapes.length}
              onUndo={() => onChange(shapes.slice(0, -1))}
              onClear={() => onChange([])}
            />
            {item && (
              <div className="stage h-[58vh]">
                <div className="stage__fit" style={{ ['--ar' as string]: item.width / item.height }}>
                  <img className="stage__img stage__img--placeholder rounded-lg" src={item.thumb} alt="" draggable={false} />
                  {previews[item.id] && (
                    <img className="stage__img fade-in rounded-lg" src={previews[item.id]} alt={item.name} draggable={false} />
                  )}
                  <RegionEditor
                    shapes={shapes}
                    onChange={onChange}
                    tool={tool}
                    brush={brushRadius(brushStep)}
                    width={item.width}
                    height={item.height}
                    editable
                  />
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer className="flex items-center gap-2">
            {items.length > 1 && (
              <>
                <Button isIconOnly size="sm" variant="secondary" aria-label="Previous image" onPress={() => step(-1)}>
                  <ChevronLeft />
                </Button>
                <span className="min-w-0 truncate text-sm tabular-nums text-muted">
                  {index + 1} of {items.length} · {item?.name}
                </span>
                <Button isIconOnly size="sm" variant="secondary" aria-label="Next image" onPress={() => step(1)}>
                  <ChevronRight />
                </Button>
              </>
            )}
            <Button className="ml-auto" onPress={onClose}>
              Done
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
