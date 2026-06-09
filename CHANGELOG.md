# Changelog

All notable changes to tensix-viz are documented here.

## [1.1.0] - 2026-06-09

### Fixed

- **Heatmap: non-tensix cells no longer painted by heat overlay** (`src/chip.js` `_drawHeatmap`)
  Commit 76dca80 added `coreType !== 'tensix'` guards to the pre-built artifacts but never to
  the source. The guards are now in `src/chip.js` so the next build preserves them. Without this
  fix, DRAM (col 5 on Wormhole), ETH (row 6 on Wormhole), and PCIe (col 8 on Blackhole) cells
  were colored by the heatmap overlay and could inflate `maxVal`, compressing the visible range
  for all tensix cells.

- **Memory overlay: stale phase not rendered after `reset()` on `showMemory: true` instances**
  (`src/chip.js` `reset()` and constructor)
  After calling `viz.activate(mode)` followed by `viz.reset()` on a canvas created with
  `showMemory: true`, `_memPhase` retained the frozen `_mem` object from the animation closure.
  `reset()` calls `render()` at the end, which caused `_drawMemoryLayer()` to run with stale data,
  producing a faint DRAM glow and L1 fill bars on an otherwise blank chip. `reset()` now sets
  `this._memPhase = null`; the field is also explicitly initialized to `null` in the constructor.

- **Canvas context: `getContext('2d')` moved to after canvas sizing**
  (`src/chip.js` constructor)
  The 2D context was obtained before `canvas.width`/`canvas.height` were assigned. Assigning to
  `canvas.width` resets all context state per spec, making the early `getContext` call redundant
  and inconsistent with the intent. `this.ctx` is now assigned after the sizing block so the
  obtained context reflects the final dimensions.

### Added

- **Responsive canvas sizing** (`src/chip.js` constructor)
  If `canvas.parentElement` exists and `clientWidth` is smaller than the canvas's intrinsic
  `width` attribute, logical dimensions are capped to the container width and height is scaled
  proportionally. Applies at construction time; re-create the instance for later resizes.

- **Float label boundary clamping** (overridden `render()`)
  The floating tooltip label is now clamped so its pill box never overflows any canvas edge.
  `rawCx`/`rawCy` are constrained by `Math.max(w/2+margin, Math.min(logicalW-w/2-margin, raw*))`.

## [1.0.0] - 2026-05-18

Initial public release.
