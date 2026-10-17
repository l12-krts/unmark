import { Button, Slider, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react'
import { ArrowUturnCcwLeft, Brush, SquareDashed, TrashBin } from '@gravity-ui/icons'

import { regionCount, type Tool } from '../lib/regions'

interface Props {
  tool: Tool
  onTool: (tool: Tool) => void
  /** Brush size step, 1..12 (see brushRadius). */
  brushStep: number
  onBrushStep: (step: number) => void
  count: number
  onUndo: () => void
  onClear: () => void
  isDisabled?: boolean
}

export function RegionToolbar({ tool, onTool, brushStep, onBrushStep, count, onUndo, onClear, isDisabled }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleButtonGroup
        size="sm"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={new Set([tool])}
        onSelectionChange={(keys) => {
          const [next] = [...keys]
          if (next) onTool(next as Tool)
        }}
        isDisabled={isDisabled}
        aria-label="Drawing tool"
      >
        <ToggleButton id="box">
          <SquareDashed />
          Box
        </ToggleButton>
        <ToggleButton id="brush">
          <Brush />
          Brush
        </ToggleButton>
      </ToggleButtonGroup>
      {tool === 'brush' && (
        <Slider
          aria-label="Brush size"
          className="w-28"
          minValue={1}
          maxValue={12}
          step={1}
          value={brushStep}
          onChange={(v) => onBrushStep(Array.isArray(v) ? (v[0] ?? 1) : v)}
          isDisabled={isDisabled}
        >
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
      )}
      <span className="text-sm text-muted">
        {count ? regionCount(count) : tool === 'box' ? 'Drag over a watermark to mark it.' : 'Paint over a watermark to mark it.'}
      </span>
      {count > 0 && (
        <div className="ml-auto flex gap-1">
          <Tooltip delay={500}>
            <Tooltip.Trigger>
              <Button isIconOnly size="sm" variant="ghost" aria-label="Undo last region" onPress={onUndo} isDisabled={isDisabled}>
                <ArrowUturnCcwLeft />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>Undo (Ctrl+Z)</Tooltip.Content>
          </Tooltip>
          <Button size="sm" variant="ghost" onPress={onClear} isDisabled={isDisabled}>
            <TrashBin />
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}
