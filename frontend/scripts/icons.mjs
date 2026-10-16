// Renders assets/icon.svg (and icon-small.svg for <= 32 px) to PNGs: assets/icons/icon-<size>.png and frontend/public/icon.svg.
// Run: npm --prefix frontend run icons   (build.py packs the PNGs into the .ico)
import { Resvg } from '@resvg/resvg-js'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const svg = readFileSync(join(root, 'assets', 'icon.svg'))
// 16-32 px use a simplified drawing: the watermark detail turns to noise that small.
const small = readFileSync(join(root, 'assets', 'icon-small.svg'))
const out = join(root, 'assets', 'icons')
mkdirSync(out, { recursive: true })

for (const size of [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512]) {
  const png = new Resvg(size <= 32 ? small : svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(join(out, `icon-${size}.png`), png)
}
copyFileSync(join(root, 'assets', 'icon.svg'), join(root, 'frontend', 'public', 'icon.svg'))
console.log(`icons written to ${out}`)
