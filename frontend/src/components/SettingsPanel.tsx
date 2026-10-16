import { Card, Description, Input, Label, ListBox, Radio, RadioGroup, Select, Slider, TextField } from '@heroui/react'

import type { Detector, ModelSize, Settings, Strategy } from '../lib/bridge'

const STRATEGIES: { id: Strategy; label: string; hint: string }[] = [
  { id: 'crop', label: 'Detail', hint: 'Best quality.' },
  { id: 'fast', label: 'Fast', hint: 'Soft on big images.' },
  { id: 'original', label: 'Whole image', hint: 'Full resolution, Slowest.' },
]

const MODELS: { id: ModelSize; label: string; hint: string }[] = [
  { id: 'large', label: 'Unmark Detail', hint: 'Most accurate. 1.5 GB.' },
  { id: 'base', label: 'Unmark Lite', hint: 'Lighter and quicker. 0.5 GB.' },
]

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  isDisabled: boolean
}

export function SettingsPanel({ settings, onChange, isDisabled }: Props) {
  return (
    <Card className="h-full min-h-0">
      <Card.Header>
        <Card.Title>Settings</Card.Title>
      </Card.Header>
      <Card.Content className="-mx-1 flex min-h-0 flex-col gap-6 overflow-y-auto px-1 pb-1">
        <TextField
          variant="secondary"
          value={settings.prompt}
          onChange={(prompt) => onChange({ prompt })}
          onBlur={() => !settings.prompt.trim() && onChange({ prompt: 'watermark' })}
          isDisabled={isDisabled}
        >
          <Label>Look for</Label>
          <Input placeholder="watermark" />
          <Description>Describe what the model removes.</Description>
        </TextField>

        <RadioGroup
          variant="secondary"
          className="flex flex-col gap-3"
          value={settings.detector}
          onChange={(value) => onChange({ detector: value as Detector })}
          isDisabled={isDisabled}
        >
          <Label>Detection</Label>
          <Radio value="box">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Label>Boxes</Label>
            </Radio.Content>
            <Description>Fast. Covers the whole mark.</Description>
          </Radio>
          <Radio value="segment">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Label>Outline</Label>
            </Radio.Content>
            <Description>Tighter, slower, can spill.</Description>
          </Radio>
        </RadioGroup>

        <Slider
          minValue={0}
          maxValue={24}
          step={1}
          value={settings.expand}
          onChange={(v) => onChange({ expand: Array.isArray(v) ? (v[0] ?? 0) : v })}
          isDisabled={isDisabled}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <Label>Grow mask</Label>
            <span className="text-sm tabular-nums text-muted">{settings.expand} px</span>
          </div>
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
          <p className="text-xs text-muted">Catches soft edges and shadows around the mark.</p>
        </Slider>

        <Select
          variant="secondary"
          value={settings.strategy}
          onChange={(key) => key != null && onChange({ strategy: String(key) as Strategy })}
          isDisabled={isDisabled}
        >
          <Label>Fill</Label>
          <Select.Trigger>
            <Select.Value>{({ selectedText }) => selectedText}</Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {STRATEGIES.map((s) => (
                <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                  <div className="flex flex-col">
                    <span>{s.label}</span>
                    <span className="text-xs text-muted">{s.hint}</span>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
          <Description>{STRATEGIES.find((s) => s.id === settings.strategy)?.hint}</Description>
        </Select>

        <Select
          variant="secondary"
          value={settings.model}
          onChange={(key) => key != null && onChange({ model: String(key) as ModelSize })}
          isDisabled={isDisabled}
        >
          <Label>Detector model</Label>
          <Select.Trigger>
            <Select.Value>{({ selectedText }) => selectedText}</Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {MODELS.map((m) => (
                <ListBox.Item key={m.id} id={m.id} textValue={m.label}>
                  <div className="flex flex-col">
                    <span>{m.label}</span>
                    <span className="text-xs text-muted">{m.hint}</span>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
          <Description>{MODELS.find((m) => m.id === settings.model)?.hint}</Description>
        </Select>
      </Card.Content>
    </Card>
  )
}
