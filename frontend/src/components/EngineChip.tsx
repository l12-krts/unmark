import { Chip, Spinner, Tooltip } from '@heroui/react'

import type { EngineStatus } from '../lib/bridge'

export function EngineChip({ engine }: { engine: EngineStatus | null }) {
  if (!engine) return null
  const busy = engine.state === 'starting' || engine.state === 'loading' || engine.state === 'downloading'

  const label = busy
    ? engine.state === 'downloading'
      ? 'Downloading models'
      : engine.message || 'Starting'
    : engine.state === 'error'
      ? 'Engine error'
      : engine.state === 'ready'
        ? `Models Ready`
        : `Idle`

  const color = engine.state === 'ready' ? (engine.device === 'cpu' ? 'warning' : 'success') : engine.state === 'error' ? 'danger' : 'default'

  const detail =
    engine.state === 'error'
      ? engine.message
      : engine.state === 'downloading'
        ? `${engine.message}`
        : engine.device === 'cpu'
          ? 'Running on CPU (slow)'
          : engine.gpu
            ? `Running on ${engine.gpu} (CUDA)`
            : engine.message

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>
        <Chip color={color} variant="soft" className="chip-tint gap-1.5">
          {busy ? <Spinner size="sm" color="current" /> : <span className="size-1.5 rounded-full bg-current" />}
          <Chip.Label key={label} className="text-swap">
            {label}
          </Chip.Label>
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content>{detail}</Tooltip.Content>
    </Tooltip>
  )
}
