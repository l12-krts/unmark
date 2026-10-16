import { Alert, Button, Card, Chip, Label, Spinner, Surface, Switch } from '@heroui/react'
import { ArrowRotateRight, FloppyDisk, MagicWand, Picture, Xmark } from '@gravity-ui/icons'
import { useEffect, useState } from 'react'

import { CompareSlider } from '../components/CompareSlider'
import { DropOverlay, DropZone } from '../components/DropZone'
import { formatBytes, type EngineStatus } from '../lib/bridge'
import { useAfterMount } from '../lib/motion'
import type { SingleController } from '../state/useSingle'

// Each result sweeps open once, not again when the tab is revisited.
const revealed = new Set<string>()

interface Props {
  single: SingleController
  engine: EngineStatus | null
  dragging: boolean
  adding: boolean
  batchRunning: boolean
}

export function SingleView({ single, engine, dragging, adding, batchRunning }: Props) {
  const [showMask, setShowMask] = useState(false)
  const swapped = useAfterMount() // content changed after the tab opened: animate it in
  const { item, preview, status, result } = single
  const working = status === 'working'
  const intro = result ? !revealed.has(result.id) : false

  useEffect(() => {
    if (result) revealed.add(result.id)
  }, [result])

  if (!item) {
    return (
      <DropZone
        title="Drop an image here"
        description="Drop an image to remove any watermark."
        dragging={dragging}
        adding={adding}
        animate={swapped}
      >
        <Button onPress={() => void single.pick()}>
          <Picture />
          Choose image
        </Button>
      </DropZone>
    )
  }

  const engineBusy = engine && ['starting', 'loading', 'downloading'].includes(engine.state)
  const stageText = engineBusy ? engine.message : single.stage

  return (
    <Card className={`relative flex min-h-0 flex-1 flex-col ${swapped ? 'view-enter' : ''}`}>
      <Card.Header className="flex-row items-center gap-3">
        <div className="min-w-0 flex-1">
          <Card.Title className="truncate">{item.name}</Card.Title>
          <Card.Description className="truncate">
            {item.width} × {item.height} · {formatBytes(item.bytes)}
          </Card.Description>
        </div>
        <Button isIconOnly variant="ghost" size="sm" aria-label="Close image" onPress={single.clear} isDisabled={working}>
          <Xmark />
        </Button>
      </Card.Header>

      <Card.Content className="stage min-h-0 flex-1">
        {result ? (
          <CompareSlider
            key={result.id}
            before={result.before}
            after={result.after}
            mask={result.mask}
            width={item.width}
            height={item.height}
            showMask={showMask}
            intro={intro}
            className={swapped ? 'fade-in' : ''}
          />
        ) : (
          <div className="stage__fit" data-busy={working} style={{ ['--ar' as string]: item.width / item.height }}>
            <img className="stage__img stage__img--placeholder rounded-lg" src={item.thumb} alt="" draggable={false} />
            {preview && <img className="stage__img fade-in rounded-lg" src={preview} alt={item.name} draggable={false} />}
            {working && (
              <div className="absolute inset-0 grid place-items-center">
                <Surface className="pop-enter flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg">
                  <Spinner size="sm" />
                  <span key={stageText || 'Working'} className="text-swap text-sm font-medium">
                    {stageText || 'Working'}
                  </span>
                </Surface>
              </div>
            )}
          </div>
        )}
      </Card.Content>

      {(single.error || (result && result.regions === 0)) && (
        <div className={`px-4 ${swapped ? 'fade-in' : ''}`}>
          {single.error ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>That didn’t work</Alert.Title>
                <Alert.Description>{single.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>No watermark found</Alert.Title>
                <Alert.Description>
                  Try a different “Look for” word (text, logo, signature) or switch Detection to the other mode.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </div>
      )}

      <Card.Footer className="flex flex-wrap items-center gap-3">
        {result ? (
          <div key="done" className={`flex flex-1 flex-wrap items-center gap-3 ${swapped ? 'fade-in-fast' : ''}`}>
            <Chip variant="soft" color={result.regions ? 'success' : 'warning'}>
              {result.regions ? `${result.regions} ${result.regions === 1 ? 'region' : 'regions'} removed` : 'Nothing removed'}
            </Chip>
            <span className="text-sm tabular-nums text-muted">{result.seconds.toFixed(1)} s</span>
            {result.mask && (
              <Switch isSelected={showMask} onChange={setShowMask} size="sm">
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Label className="text-sm">Show mask</Label>
                </Switch.Content>
              </Switch>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onPress={() => void single.run()} isDisabled={batchRunning}>
                <ArrowRotateRight />
                Run again
              </Button>
              <Button onPress={() => void single.save()} isDisabled={!result.regions}>
                <FloppyDisk />
                Save…
              </Button>
            </div>
          </div>
        ) : (
          <div key="ready" className={`flex flex-1 flex-wrap items-center gap-3 ${swapped ? 'fade-in-fast' : ''}`}>
            <span className="text-sm text-muted">
              {batchRunning ? 'A batch is running. This waits until it’s done.' : 'Uses the settings on the right.'}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onPress={() => void single.pick()} isDisabled={working}>
                Replace
              </Button>
              <Button onPress={() => void single.run()} isDisabled={working || batchRunning}>
                <MagicWand />
                Remove watermark
              </Button>
            </div>
          </div>
        )}
      </Card.Footer>

      <DropOverlay visible={dragging} label="Drop to open this image instead" />
    </Card>
  )
}
