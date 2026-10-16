import { Button, Card, Chip, Label, ProgressBar, ScrollShadow, Spinner, Tooltip } from '@heroui/react'
import { Eye, FolderOpen, FolderPlus, MagicWand, Picture, StopFill, Xmark } from '@gravity-ui/icons'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { DropOverlay, DropZone } from '../components/DropZone'
import { formatBytes, type PyApi, type Settings } from '../lib/bridge'
import { EASE_IN_OUT, EASE_OUT, useAfterMount } from '../lib/motion'
import type { BatchController, BatchItem } from '../state/useBatch'
import { CompareModal } from './CompareModal'

interface Props {
  api: PyApi
  batch: BatchController
  onSettings: (patch: Partial<Settings>) => void
  usingDefaultOutput: boolean
  dragging: boolean
  adding: boolean
}

function StatusChip({ item, animate }: { item: BatchItem; animate: boolean }) {
  return (
    <span key={item.state} className={animate ? 'fade-in-fast' : ''}>
      <StatusChipBody item={item} />
    </span>
  )
}

function StatusChipBody({ item }: { item: BatchItem }) {
  switch (item.state) {
    case 'queued':
      return <Chip size="sm">Queued</Chip>
    case 'running':
      return (
        <Chip size="sm" color="accent" variant="soft" className="gap-1.5">
          <Spinner size="sm" color="current" />
          <Chip.Label>Working</Chip.Label>
        </Chip>
      )
    case 'done':
      return (
        <Chip size="sm" color="success" variant="soft">
          {item.regions === 1 ? '1 region' : `${item.regions} regions`}
        </Chip>
      )
    case 'empty':
      return (
        <Chip size="sm" color="warning" variant="soft">
          Nothing found
        </Chip>
      )
    case 'error':
      return (
        <Chip size="sm" color="danger" variant="soft">
          Failed
        </Chip>
      )
  }
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} s left`
  return `about ${Math.round(seconds / 60)} min left`
}

export function BatchView({ api, batch, onSettings, usingDefaultOutput, dragging, adding }: Props) {
  const [comparing, setComparing] = useState<BatchItem | null>(null)
  const swapped = useAfterMount() // the list appeared after the tab opened: animate it in
  const { items, running, progress, counts } = batch

  if (!items.length) {
    return (
      <DropZone
        title="Drop images or a folder"
        description="Select multiple images to remove watermarks."
        dragging={dragging}
        adding={adding}
        animate={swapped}
      >
        <Button onPress={() => void batch.pickImages()}>
          <Picture />
          Add images
        </Button>
        <Button variant="secondary" onPress={() => void batch.pickFolder()}>
          <FolderPlus />
          Add folder
        </Button>
      </DropZone>
    )
  }

  const chooseOutput = async () => {
    const dir = await api.pick_output_dir()
    if (dir) onSettings({ outputDir: dir })
  }

  const startLabel = batch.allDone
    ? 'Run all again'
    : `Remove from ${batch.targets} ${batch.targets === 1 ? 'image' : 'images'}`

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col gap-4 ${swapped ? 'view-enter' : ''}`}>
      <Card className="flex min-h-0 flex-1 flex-col">
        <Card.Header className="flex-row flex-wrap items-center gap-2">
          <Card.Title>
            {items.length} {items.length === 1 ? 'image' : 'images'}
          </Card.Title>
          {counts.done > 0 && (
            <Chip size="sm" color="success" variant="soft" className={swapped ? 'fade-in' : ''}>
              {counts.done} cleaned
            </Chip>
          )}
          {counts.empty > 0 && (
            <Chip size="sm" color="warning" variant="soft" className={swapped ? 'fade-in' : ''}>
              {counts.empty} nothing found
            </Chip>
          )}
          {counts.error > 0 && (
            <Chip size="sm" color="danger" variant="soft" className={swapped ? 'fade-in' : ''}>
              {counts.error} failed
            </Chip>
          )}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="secondary" onPress={() => void batch.pickImages()}>
              <Picture />
              Add images
            </Button>
            <Button size="sm" variant="secondary" onPress={() => void batch.pickFolder()}>
              <FolderPlus />
              Add folder
            </Button>
            <Button size="sm" variant="ghost" onPress={batch.clear} isDisabled={running}>
              Clear
            </Button>
          </div>
        </Card.Header>
        <ScrollShadow className="-mx-4 -mb-4 min-h-0 flex-1 overflow-y-auto">
          <ul className="flex flex-col">
            {/* Rows rise in (staggered per added set), fade out when removed, and the rest of the
                list glides into place. Motion's reducedMotion="user" keeps only the fades. */}
            <AnimatePresence initial={swapped}>
            {items.map((item) => {
              const thumb = item.resultThumb ?? item.thumb
              const canCompare = (item.state === 'done' || item.state === 'empty') && item.output
              const detail =
                item.state === 'error'
                  ? item.error
                  : item.state === 'running'
                    ? item.stage
                    : `${item.width} × ${item.height} · ${formatBytes(item.bytes)}${item.seconds ? ` · ${item.seconds.toFixed(1)} s` : ''}`
              return (
                <motion.li
                  key={item.id}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT, delay: Math.min(item.enter, 10) * 0.03 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
                  transition={{ layout: { duration: 0.25, ease: EASE_IN_OUT } }}
                  className="flex items-center gap-3 border-t border-border px-4 py-2.5"
                >
                  <img key={thumb} src={thumb} alt="" className={`size-12 shrink-0 rounded-lg object-cover ${swapped ? 'fade-in' : ''}`} draggable={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={item.path}>
                      {item.name}
                    </p>
                    <p className={`truncate text-xs ${item.state === 'error' ? 'text-danger' : 'text-muted'}`}>{detail}</p>
                  </div>
                  <StatusChip item={item} animate={swapped} />
                  <div className="flex w-16 justify-end gap-1">
                    {canCompare && (
                      <Tooltip delay={500}>
                        <Tooltip.Trigger>
                          <Button isIconOnly size="sm" variant="ghost" aria-label="Compare before and after" onPress={() => setComparing(item)}>
                            <Eye />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>Compare</Tooltip.Content>
                      </Tooltip>
                    )}
                    {!running && (
                      <Tooltip delay={500}>
                        <Tooltip.Trigger>
                          <Button isIconOnly size="sm" variant="ghost" aria-label="Remove from list" onPress={() => batch.remove(item.id)}>
                            <Xmark />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>Remove from list</Tooltip.Content>
                      </Tooltip>
                    )}
                  </div>
                </motion.li>
              )
            })}
            </AnimatePresence>
          </ul>
        </ScrollShadow>
      </Card>

      <Card>
        <Card.Content className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <FolderOpen className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{usingDefaultOutput ? 'Save to (an “unmarked” folder next to the images)' : 'Save to'}</p>
              <p className="truncate text-sm" title={batch.outputDir ?? ''}>
                {batch.outputDir}
              </p>
            </div>
            {!usingDefaultOutput && (
              <Button size="sm" variant="ghost" onPress={() => onSettings({ outputDir: null })} isDisabled={running}>
                Use default
              </Button>
            )}
            <Button size="sm" variant="secondary" onPress={() => void chooseOutput()} isDisabled={running}>
              Change…
            </Button>
            {batch.lastOutput && (
              <Button size="sm" variant="secondary" onPress={() => batch.lastOutput && void api.open_path(batch.lastOutput)}>
                Open
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <ProgressBar
              aria-label="Batch progress"
              className="flex-1"
              value={progress.finished}
              maxValue={Math.max(1, progress.total)}
              color={running ? 'accent' : progress.total && progress.finished === progress.total ? 'success' : 'default'}
            >
              <div className="flex justify-between text-sm">
                <Label>
                  {progress.total
                    ? `${progress.finished} of ${progress.total}${running && progress.secondsLeft ? ` · ${formatEta(progress.secondsLeft)}` : ''}`
                    : 'Not started'}
                </Label>
                <ProgressBar.Output className="tabular-nums text-muted" />
              </div>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            {running ? (
              <Button variant="danger-soft" onPress={batch.cancel} isDisabled={batch.cancelling}>
                <StopFill />
                {batch.cancelling ? 'Stopping…' : 'Stop'}
              </Button>
            ) : (
              <Button onPress={() => void batch.start()}>
                <MagicWand />
                {startLabel}
              </Button>
            )}
          </div>
        </Card.Content>
      </Card>

      <DropOverlay visible={dragging} label="Drop to add to the batch" />
      <CompareModal api={api} item={comparing} onClose={() => setComparing(null)} />
    </div>
  )
}
