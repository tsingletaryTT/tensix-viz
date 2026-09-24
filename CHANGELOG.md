# Changelog

All notable changes to tensix-viz are documented here.

## [1.3.0] - 2026-09-24

### Added

- **`setActivity(value)` and `setProgress(value)`** (`src/chip.js`). Every
  animation mode's brightness/pop-rate now scales with a live 0..1
  `activity` signal via a shared `activityGain()` multiplier (floored at
  0.12 so a resting chip never reads as dead), and `diffusion`/`video`/
  `prefill`'s ring/sweep position can be driven by real structural progress
  instead of wall-clock time via `setProgress()`. Both default to
  reproducing the exact pre-1.3.0 output when never called — no existing
  caller changes. This is the library-side half of a fix for a gap
  `tt-bio-demo`'s `ui/chipviz.py` docstring had measured and documented
  (feeding a chip's canvas 0.0 vs. 1.0 activity produced pixel statistics
  indistinguishable from frame noise, because the only prior telemetry
  input, `setMemoryStats`, never touched the per-core heatmap itself) —
  closing it in practice also requires a consumer to call these new
  setters, which is `tt-bio-demo`'s own change (its `ui/chipviz.py` and
  `ui/app.py`, in that repo, not this checkout).

### Fixed

- **`activityGain` now applies at the render layer, not the pre-normalisation
  heatmap value** (`src/chip.js`, `_drawHeatmap`). The initial cut of the
  above baked `activityGain` into each mode's own simulated value, which
  `_drawHeatmap`'s per-frame renormalisation (to its own floored, decaying
  maximum) canceled straight back out for any mode whose peak stayed above
  `HEAT_FLOOR` (0.35) — every mode except `idle` at rest. `activity=0.5` and
  `activity=1.0` rendered pixel-identical for `diffusion`/`thinking`/
  `inference`/etc. Found by review before this version was consumed
  anywhere. `activityGain` is now applied to `ctx.globalAlpha` at the point
  a cell is actually filled — the one quantity nothing upstream rescales —
  producing a real, uncancellable 8.33x swing in rendered opacity between
  activity 0 and 1, uniformly across every mode. `tests/chip.test.js`'s
  brightness tests now assert on that rendered alpha rather than the
  pre-normalisation heatmap, which could not distinguish "gained but
  canceled" from "not gained at all."

- **`kernel_dispatch` no longer double-applies `activityGain`** (`src/chip.js`).
  A leftover `* activityGain(...)` from before the render-layer fix above was
  still multiplying this mode's own pre-normalisation value, on top of the
  now-correct alpha-layer application — dimming it twice at low activity,
  unlike every other mode. Found in GitHub Copilot's review of the PR.
  Pinned with a source-level invariant test (no mode body may reference
  `activityGain`) rather than a behavioral one, since `kernel_dispatch`'s
  stochastic multi-kernel simulation makes timing-based assertions
  unreliable.

- **`setProgress(null)` now clears a stale progress override** (`src/chip.js`).
  Previously there was no way to return to the wall-clock fallback once
  `setProgress` had been called with a real value — a caller that simply
  stopped sending progress (a chip whose stage no longer has one, or whose
  telemetry becomes momentarily unavailable) left the ring permanently
  pinned at its last value instead of resuming motion, contradicting the
  documented fallback behavior. Also found in review.

## [1.2.1] - 2026-08-20

### Fixed

- **The chip grid is centered within its canvas** (`src/chip.js`, `_computeLayout`).
  `_cellW`/`_cellH` are floored, so `cols * _cellW` is usually smaller than the
  drawable width; drawing from a fixed top-left `pad` piled all that leftover on
  the right and bottom, making the grid look shoved toward the top-left corner
  (visible in small multi-chip layouts). `_padX`/`_padY` now split the leftover
  slack evenly — `max(pad, floor((w - cellW*cols) / 2))` — so the grid sits
  centered, never narrower than the base pad on any edge. 86 tests green.

- **Idle rendering no longer flickers and is frame-rate independent** (`src/chip.js`, `_drawHeatmap`, `activate()` idle).
  Heatmap normalization now uses a floored, slowly-decaying reference scale, and the idle decay/pop maths use elapsed time so behavior is consistent across refresh rates.
  slack evenly — `max(pad, floor((w - cellW*cols) / 2))` — so the grid sits
  centered, never narrower than the base pad on any edge. 86 tests green.

## [1.1.2] - 2026-06-29

### Fixed

- **`TensixViz.autoInit()` is idempotent for `.tensix-viz-container` elements** (`src/chip.js`)
  1.1.1 made the `[data-viz]` path idempotent but left the legacy single-chip path unguarded. When
  `autoInit()` ran twice (the bundle's self-init plus an explicit host-page call), each
  `.tensix-viz-container` canvas received a second `TensixViz` instance — two animation loops drawing
  on one canvas, which renders as a doubled/overlapping grid. `TensixViz.autoInit()` now skips any
  container already initialized (`container._tensixViz`) and records the instance on it.

### Added

- **Responsive multi-chip canvas** (`tensix-viz.css`)
  `.tv-chip-wrapper canvas { max-width: 100%; height: auto; }` — card/system canvases (created
  without the `.tensix-viz-canvas` class) now scale to fit a narrow column instead of being clipped
  by `.tv-card`'s overflow. Previously this rule had to be patched in by downstream consumers.

## [1.1.1] - 2026-06-25

### Fixed

- **Animation player accepts both script schemas** (`src/chip.js` `_execStep`)
  The player dispatched on `step.step` and read `step.cores` only, so scripts authored with the
  alternate `{ action, coords }` schema ran zero steps — the Play button (and auto-play) appeared
  dead. `_execStep` now dispatches on `step.step || step.action` and falls back `coords → cores`,
  so blocks written in either schema animate.

- **`autoInit()` is idempotent for `[data-viz]` elements** (`src/index.js`)
  `autoInit()` can run more than once (the bundle's self-init plus an explicit call). For `card`
  and `system` vizzes — which append their render into the host element — the second run appended
  a duplicate set of chips. `autoInit()` now skips any element already initialized (`el._tensixViz`).

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
