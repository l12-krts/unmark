import { Alert, Button, Chip, Spinner, Tabs, toast } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'

import { EngineChip } from './components/EngineChip'
import { SettingsPanel } from './components/SettingsPanel'
import { BatchView } from './features/BatchView'
import { SingleView } from './features/SingleView'
import { connect, useUnmarkEvents, type EngineStatus, type PyApi } from './lib/bridge'
import { useBatch } from './state/useBatch'
import { useSettings } from './state/useSettings'
import { useSingle } from './state/useSingle'

type Tab = 'single' | 'batch'

/** True while files are dragged over the window. The drop itself is caught by Python (it needs real paths). */
function useFileDrag(onDrop: () => void) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current += 1
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault() // allow the drop instead of navigating to the file
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      dropRef.current()
    }
    // Capture phase: pywebview's own document-level handler may stop propagation.
    window.addEventListener('dragenter', enter, true)
    window.addEventListener('dragleave', leave, true)
    window.addEventListener('dragover', over, true)
    window.addEventListener('drop', drop, true)
    return () => {
      window.removeEventListener('dragenter', enter, true)
      window.removeEventListener('dragleave', leave, true)
      window.removeEventListener('dragover', over, true)
      window.removeEventListener('drop', drop, true)
    }
  }, [])

  return dragging
}

export default function App() {
  const [api, setApi] = useState<PyApi | null | undefined>(undefined)
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [tab, setTab] = useState<Tab>('single')
  const [adding, setAdding] = useState(false)
  const addingTimer = useRef<number | undefined>(undefined)
  const [settings, updateSettings] = useSettings(api)
  const single = useSingle(api, settings)
  const batch = useBatch(api, settings)

  const dragging = useFileDrag(() => {
    setAdding(true)
    window.clearTimeout(addingTimer.current)
    addingTimer.current = window.setTimeout(() => setAdding(false), 30_000)
  })

  useEffect(() => {
    void connect().then(async (connected) => {
      setApi(connected)
      if (connected) setEngine(await connected.status())
    })
  }, [])

  useUnmarkEvents((event) => {
    switch (event.type) {
      case 'engine':
        setEngine(event)
        break
      case 'stage':
        if (event.job === 'single') single.onStage(event.stage)
        else batch.onStage(event.id, event.stage)
        break
      case 'dropped': {
        setAdding(false)
        window.clearTimeout(addingTimer.current)
        const { items } = event
        if (!items.length) {
          toast('No images in what you dropped')
        } else if (tab === 'single' && items.length === 1 && single.status !== 'working') {
          void single.open(items[0])
        } else {
          batch.add(items)
          if (tab === 'single') {
            setTab('batch')
            toast(`Added ${items.length} images to the batch`)
          }
        }
        break
      }
      case 'batch':
      case 'batch-item':
        batch.onEvent(event)
        break
    }
  })

  // Ctrl+O opens, Ctrl+S saves. No animation on purpose: keyboard actions should feel instant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'o') {
        e.preventDefault()
        if (tab === 'single') void single.pick()
        else void batch.pickImages()
      } else if (e.key === 's' && tab === 'single' && single.result?.regions) {
        e.preventDefault()
        void single.save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (api === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    )
  }

  if (api === null) {
    return (
      <div className="grid h-full place-items-center p-8">
        <Alert status="warning" className="shell-enter max-w-lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Open Unmark from the desktop app</Alert.Title>
            <Alert.Description>
              This UI talks to Python through pywebview. Start it with <code>run.bat</code> (or <code>run.bat --dev</code> while
              developing).
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </div>
    )
  }

  const locked = batch.running || single.status === 'working'

  return (
    <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key) as Tab)} className="flex h-full flex-col gap-0">
      {/* Launch: the shell rises in once, header first. */}
      <header className="shell-enter flex items-center gap-6 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <img src="./icon.svg" alt="" className="size-6" draggable={false} />
          <span className="text-base font-semibold">Unmark</span>
        </div>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Mode" className="w-56">
            <Tabs.Tab id="single">
              Single
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="batch">
              <span className="flex items-center gap-1.5">
                Batch
                {batch.items.length > 0 && (
                  <Chip size="sm" className="tabular-nums">
                    {batch.items.length}
                  </Chip>
                )}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <div className="ml-auto">
          <EngineChip engine={engine} />
        </div>
      </header>

      {engine?.state === 'error' && (
        <div className="px-5 pt-4">
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>The engine couldn’t load its models</Alert.Title>
              <Alert.Description>{engine.message}</Alert.Description>
            </Alert.Content>
            <Button size="sm" variant="secondary" onPress={() => void api.warmup(settings)}>
              Try again
            </Button>
          </Alert>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <main className="shell-enter flex min-w-0 flex-1 flex-col" style={{ ['--d' as string]: 1 }}>
          <Tabs.Panel id="single" className="flex min-h-0 flex-1 flex-col p-0">
            <SingleView single={single} engine={engine} dragging={dragging} adding={adding} batchRunning={batch.running} />
          </Tabs.Panel>
          <Tabs.Panel id="batch" className="flex min-h-0 flex-1 flex-col p-0">
            <BatchView
              api={api}
              batch={batch}
              onSettings={updateSettings}
              usingDefaultOutput={!settings.outputDir}
              dragging={dragging}
              adding={adding}
            />
          </Tabs.Panel>
        </main>
        <aside className="shell-enter w-80 shrink-0" style={{ ['--d' as string]: 2 }}>
          <SettingsPanel settings={settings} onChange={updateSettings} isDisabled={locked} />
        </aside>
      </div>
    </Tabs>
  )
}
