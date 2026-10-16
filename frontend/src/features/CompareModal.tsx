import { Button, Label, Modal, Spinner, Switch } from '@heroui/react'
import { FolderOpen } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'

import { CompareSlider } from '../components/CompareSlider'
import { errorText, fileName, type CompareImages, type PyApi } from '../lib/bridge'
import type { BatchItem } from '../state/useBatch'

interface Props {
  api: PyApi
  item: BatchItem | null
  onClose: () => void
}

export function CompareModal({ api, item, onClose }: Props) {
  const [images, setImages] = useState<CompareImages | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMask, setShowMask] = useState(false)

  useEffect(() => {
    setImages(null)
    setError(null)
    if (!item?.output) return
    let live = true
    api
      .batch_compare(item.id, item.path, item.output)
      .then((result) => live && setImages(result))
      .catch((err) => live && setError(errorText(err)))
    return () => {
      live = false
    }
  }, [api, item])

  return (
    <Modal.Backdrop isOpen={item !== null} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="lg">
        <Modal.Dialog className="w-[min(1100px,92vw)] max-w-none">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="truncate pr-8">{item?.name}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className="stage h-[62vh]">
              {images && item ? (
                <CompareSlider {...images} width={item.width} height={item.height} showMask={showMask} intro className="fade-in" />
              ) : error ? (
                <p className="text-sm text-danger">{error}</p>
              ) : (
                <Spinner />
              )}
            </div>
          </Modal.Body>
          <Modal.Footer className="flex items-center gap-3">
            {images?.mask && (
              <Switch isSelected={showMask} onChange={setShowMask} size="sm">
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Label className="text-sm">Show mask</Label>
                </Switch.Content>
              </Switch>
            )}
            {item?.output && (
              <Button variant="secondary" className="ml-auto" onPress={() => item.output && void api.reveal(item.output)}>
                <FolderOpen />
                Show {fileName(item.output)}
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
