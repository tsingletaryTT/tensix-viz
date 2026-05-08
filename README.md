# tensix-viz

Tenstorrent hardware topology visualizer. Single-file, zero-dependency Canvas renderer
from a single Tensix chip up to a Galaxy SuperCluster.

## Quick Start

**CDN (no install):**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/tsingletaryTT/tensix-viz@v1/tensix-viz.css">
<script src="https://cdn.jsdelivr.net/gh/tsingletaryTT/tensix-viz@v1/tensix-viz.js"
        integrity="sha384-[computed at first release build]" crossorigin="anonymous"></script>
```

**npm / GitHub:**
```json
"tensix-viz": "github:tsingletaryTT/tensix-viz#v1"
```
```js
import { TensixViz, CardViz, SystemViz, ClusterViz } from 'tensix-viz'
```

## HTML auto-init

```html
<!-- chip: use a <canvas> element -->
<canvas data-viz="chip" data-config="blackhole" data-mode="idle" width="340" height="240"></canvas>

<!-- card/system/cluster: use a <div> container -->
<div data-viz="card"    data-config="bh-p300c" data-mode="inference"></div>
<div data-viz="system"  data-config="qb2"      data-mode="idle"></div>
<div data-viz="cluster" data-config="bh-galaxy" data-mode="explore"></div>
```

## API

All classes share a common interface:

| Method | Description |
|--------|-------------|
| `activate(mode)` | Start continuous animation. Modes: `idle`, `inference`, `diffusion`, `agents`, `explore` |
| `reset()` | Stop animation, clear state |
| `highlight(indices)` | Highlight chips/cards/nodes by index array |
| `transitionTo(level, opts)` | Zoom in/out. Returns `Promise` resolving after 300ms |
| `destroy()` | Clean up DOM and animation frames |

### TensixViz — single chip

```js
const viz = new TensixViz(canvas, { arch: 'blackhole' | 'wormhole' })
viz.activate('inference')
// Legacy lesson API (unchanged)
viz.play([{ step: 'highlight', cores: [[1,1]], color: 'teal', ms: 600 }])
```

### CardViz — 2-chip card (P300c BH or n300 WH)

```js
const viz = new CardViz(container, 'bh-p300c')   // or 'wh-n300'
viz.activate('diffusion')
await viz.transitionTo('chip', { index: 0 })     // zoom into chip 0
await viz.transitionTo('card')                   // zoom back out
```

### SystemViz — multi-card system (QB2, T3000)

```js
const viz = new SystemViz(container, 'qb2')      // or 't3000'
viz.activate('agents')
await viz.transitionTo('card', { index: 0 })
await viz.transitionTo('chip', { card: 0, chip: 1 })
await viz.transitionTo('system')
```

### ClusterViz — server/cluster (Galaxy BH, Galaxy SC)

```js
const viz = new ClusterViz(container, 'bh-galaxy')   // or 'bh-galaxy-sc'
viz.activate('explore')
await viz.transitionTo('server', { index: 0 })
await viz.transitionTo('cluster')
```

## Topology configs

| Name | Description |
|------|-------------|
| `bh-chip` | Blackhole single chip (17×12, 120 Tensix cores) |
| `wh-chip` | Wormhole single chip (10×12, 64 Tensix cores) |
| `bh-p300c` | P300c card (2 BH chips, intra-card ETH links) |
| `wh-n300` | n300 card (2 WH chips, 2 intra-card ETH links) |
| `qb2` | QB2 system (2× P300c = 4 BH chips, Samtec inter-card) |
| `t3000` | T3000 system (4× n300 = 8 WH chips, 2×4 mesh) |
| `bh-galaxy` | Galaxy BH server (32 chips, 4×8 mesh, 56× 800G ETH) |
| `bh-galaxy-sc` | Galaxy SuperCluster (4× Galaxy = 128 chips, 2D torus) |

## Examples

Open `examples/index.html` in a browser — no server required.

## Build

```bash
npm install
npm run build     # produces tensix-viz.js + tensix-viz.esm.js
npm test          # run vitest suite
```

## Migration from tt-vscode-toolkit

If you were using `tensix-viz.js` directly from tt-vscode-toolkit:

1. Replace the file reference with this repo's `tensix-viz.js`
2. All existing `new TensixViz(canvas, {arch})` calls work unchanged
3. Optionally add `CardViz`/`SystemViz`/`ClusterViz` for multi-chip views
