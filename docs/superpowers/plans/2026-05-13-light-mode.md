# Light Mode & Dark Contrast Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.tv-light` / `.tv-auto` CSS class theming and fix the dark-mode cell border contrast, without breaking any existing embeddings.

**Architecture:** All CSS colors become `var(--tv-*)` custom properties; dark values live on `:root` (default), light values override in `.tv-light` and a `@media (prefers-color-scheme: light)` block for `.tv-auto`. The canvas widget (`TensixViz`) picks its colors by walking up the DOM from its canvas element to find a theme class, then selects `THEME_DARK` or `THEME_LIGHT` accordingly at the start of each `render()` call.

**Tech Stack:** Vanilla JS, Canvas 2D API, plain CSS (no preprocessor), Vitest + jsdom-stub test harness.

---

## File Map

| File | What changes |
|---|---|
| `tests/setup.js` | Add `parentElement` tracking to mock DOM, add `window.matchMedia` stub |
| `tests/chip.test.js` | Add `_resolveTheme()` tests |
| `src/chip.js` | Rename `THEME`→`THEME_DARK`; add `THEME_LIGHT`; add `_resolveTheme()`; update `render()` and all draw methods to use `this._theme` |
| `tensix-viz.css` | Full CSS variable refactor + `.tv-light` + `.tv-auto @media` blocks |
| `tensix-viz.js` | Rebuilt output (run `node build.js`) |
| `tensix-viz.esm.js` | Rebuilt output (run `node build.js`) |
| `examples/index.html` | Add light/dark toggle demo section |
| `docs/index.html` | Add light/dark toggle demo section |

**Unchanged:** `src/card.js`, `src/system.js`, `src/cluster.js`, `src/topology.js`, `src/index.js`, all topology JSONs, `vitest.config.js`.

---

## Task 1: Extend test mock to support DOM parent traversal

`_resolveTheme()` walks `node.parentElement`. The current mock elements don't track parentage. Fix that first so tests work.

**Files:**
- Modify: `tests/setup.js`

- [ ] **Step 1: Update `MockElement.appendChild` to set `parentElement`**

In `tests/setup.js`, change `MockElement.appendChild` and `MockCanvasElement.appendChild`:

```js
// MockElement — replace the appendChild method
appendChild(child) {
  this._children.push(child)
  child.parentElement = this   // ← add this line
  return child
}

// MockCanvasElement — same change
appendChild(child) {
  this._children.push(child)
  child.parentElement = this   // ← add this line
  return child
}
```

Also add `parentElement: null` as a default property on both classes (in their constructors):

```js
// MockCanvasElement constructor — add after `this._children = []`
this.parentElement = null

// MockElement constructor — add after `this._children = []`
this.parentElement = null
```

- [ ] **Step 2: Add `window.matchMedia` stub**

In `tests/setup.js`, inside the `globalThis.window = { ... }` block, add:

```js
matchMedia: (query) => ({ matches: false }),
```

So the full `globalThis.window` block looks like:

```js
globalThis.window = {
  devicePixelRatio: 1,
  TensixViz: undefined, CardViz: undefined,
  SystemViz: undefined, ClusterViz: undefined,
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: (query) => ({ matches: false }),
}
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

```bash
npx vitest run
```

Expected: all existing tests pass. Zero failures.

- [ ] **Step 4: Commit**

```bash
git add tests/setup.js
git commit -m "test: add parentElement tracking and matchMedia stub to mock DOM"
```

---

## Task 2: Write failing tests for `_resolveTheme()`

**Files:**
- Modify: `tests/chip.test.js`

- [ ] **Step 1: Add the failing test block**

Append this `describe` block to `tests/chip.test.js` (after all existing tests):

```js
describe('TensixViz._resolveTheme', () => {
  function makeCanvasInContainer(themeClass) {
    const canvas = document.createElement('canvas')
    canvas.width = 340; canvas.height = 240
    const container = document.createElement('div')
    if (themeClass) container.classList.add(themeClass)
    container.appendChild(canvas)
    return { canvas, container }
  }

  it('returns THEME_DARK by default (no theme class on any ancestor)', () => {
    const { canvas } = makeCanvasInContainer(null)
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#0B1E28')
  })

  it('returns THEME_LIGHT when direct parent has tv-light', () => {
    const { canvas } = makeCanvasInContainer('tv-light')
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#EEF4F8')
  })

  it('returns THEME_LIGHT when grandparent has tv-light', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 340; canvas.height = 240
    const inner = document.createElement('div')
    const outer = document.createElement('div')
    outer.classList.add('tv-light')
    inner.appendChild(canvas)
    outer.appendChild(inner)
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#EEF4F8')
  })

  it('returns THEME_DARK when tv-auto and OS is dark (matchMedia returns false)', () => {
    globalThis.window.matchMedia = () => ({ matches: false })
    const { canvas } = makeCanvasInContainer('tv-auto')
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#0B1E28')
  })

  it('returns THEME_LIGHT when tv-auto and OS is light (matchMedia returns true)', () => {
    globalThis.window.matchMedia = () => ({ matches: true })
    const { canvas } = makeCanvasInContainer('tv-auto')
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#EEF4F8')
    // Restore default stub
    globalThis.window.matchMedia = () => ({ matches: false })
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
npx vitest run tests/chip.test.js
```

Expected: the five new `_resolveTheme` tests fail with errors like `viz._resolveTheme is not a function` or `Cannot read properties of undefined`.

---

## Task 3: Add `THEME_DARK`, `THEME_LIGHT`, and `_resolveTheme()` to `src/chip.js`

**Files:**
- Modify: `src/chip.js`

- [ ] **Step 1: Replace `THEME` with `THEME_DARK` and add `THEME_LIGHT`**

Find the `// ─── Theme` block (around line 47) and replace the entire `const THEME = { ... }` with:

```js
// ─── Theme ─────────────────────────────────────────────────────────────────
// THEME_DARK — improved contrast (border #3A7A8C gives clear delta from fill #163848)
const THEME_DARK = {
  bg:            '#0B1E28',
  grid:          '#1A3C47',
  tensix:        '#163848',
  tensixBorder:  '#3A7A8C',
  tensixActive:  '#4FD1C5',
  tensixPulse:   '#81E6D9',
  dram:          '#152035',
  dramBorder:    '#2D4A6A',
  eth:           '#221638',
  ethBorder:     '#5B3DA0',
  pcie:          '#2A2010',
  pcieBorder:    '#8B6914',
  empty:         '#0A1820',
  text:          '#E8F0F2',
  textMuted:     '#607D8B',
  teal:          '#4FD1C5',
  tealLight:     '#81E6D9',
  pink:          '#EC96B8',
  gold:          '#F4C471',
  green:         '#27AE60',
  red:           '#FF6B6B',
  particle:      '#4FD1C5',
  heatLow:       '#163848',
  heatMid:       '#F4C471',
  heatHigh:      '#FF6B6B',
  heatLowRgb:    [22,  56,  72],
  heatMidRgb:    [244, 196, 113],
  heatHighRgb:   [255, 107, 107],
  nocLine:       'rgba(45,102,117,0.25)',
  floatLabelBg:  'rgba(13,31,45,0.88)',
  floatLabelFg:  '#81E6D9',
};

// THEME_LIGHT — Cool Slate palette (legible on light-background pages)
const THEME_LIGHT = {
  bg:            '#EEF4F8',
  grid:          '#B8D4E0',
  tensix:        '#CCDDE8',
  tensixBorder:  '#6AACBE',
  tensixActive:  '#0D9488',
  tensixPulse:   '#0A7A70',
  dram:          '#C5D8E8',
  dramBorder:    '#5A9AB8',
  eth:           '#C5C5E0',
  ethBorder:     '#7070B8',
  pcie:          '#E0D8C8',
  pcieBorder:    '#A0906A',
  empty:         '#E4EDF4',
  text:          '#1A2C38',
  textMuted:     '#4A6878',
  teal:          '#0D9488',
  tealLight:     '#0A7A70',
  pink:          '#B01060',
  gold:          '#B45309',
  green:         '#15803D',
  red:           '#DC2626',
  particle:      '#0D9488',
  heatLow:       '#CCDDE8',
  heatMid:       '#D97706',
  heatHigh:      '#DC2626',
  heatLowRgb:    [204, 221, 232],
  heatMidRgb:    [217, 119,   6],
  heatHighRgb:   [220,  38,  38],
  nocLine:       'rgba(70,140,160,0.35)',
  floatLabelBg:  'rgba(238,244,248,0.92)',
  floatLabelFg:  '#0A4A58',
};
```

- [ ] **Step 2: Add `_resolveTheme()` method**

Add this method right after the `TensixViz` constructor function (around line 122, after the `this._computeLayout(); this.render();` lines):

```js
// ─── Theme resolution ──────────────────────────────────────────────────────
// Walk up the DOM from the canvas to find the active theme class.
// Returns THEME_DARK (default) or THEME_LIGHT.
TensixViz.prototype._resolveTheme = function () {
  var node = this.canvas.parentElement;
  while (node) {
    if (node.classList && node.classList.contains('tv-light')) return THEME_LIGHT;
    if (node.classList && node.classList.contains('tv-auto')) {
      return (typeof window !== 'undefined' && window.matchMedia &&
              window.matchMedia('(prefers-color-scheme: light)').matches)
        ? THEME_LIGHT : THEME_DARK;
    }
    node = node.parentElement;
  }
  return THEME_DARK;
};
```

- [ ] **Step 3: Run the theme tests**

```bash
npx vitest run tests/chip.test.js
```

Expected: all five `_resolveTheme` tests pass. All other existing chip tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/chip.js tests/chip.test.js
git commit -m "feat: add THEME_DARK, THEME_LIGHT, and _resolveTheme() to TensixViz"
```

---

## Task 4: Update all drawing methods to use the resolved theme

Every reference to the old `THEME` const must become `this._theme` (set once per `render()` call). `_heatColor` gains a `T` parameter for the RGB tuples.

**Files:**
- Modify: `src/chip.js`

- [ ] **Step 1: Update `render()` to set `this._theme` and use it for the background**

Find `TensixViz.prototype.render = function ()` (first definition, around line 138). Replace:

```js
TensixViz.prototype.render = function () {
  const ctx  = this.ctx;
  const chip = this.chip;
  const lw   = this._logicalW;
  const lh   = this._logicalH;
  ctx.clearRect(0, 0, lw, lh);

  // Background
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, lw, lh);
```

with:

```js
TensixViz.prototype.render = function () {
  this._theme = this._resolveTheme();  // cache for this render call
  const ctx  = this.ctx;
  const chip = this.chip;
  const lw   = this._logicalW;
  const lh   = this._logicalH;
  ctx.clearRect(0, 0, lw, lh);

  // Background
  ctx.fillStyle = this._theme.bg;
  ctx.fillRect(0, 0, lw, lh);
```

- [ ] **Step 2: Update `_drawCell()` to use `this._theme`**

Find `TensixViz.prototype._drawCell = function (col, row)`. Replace the three `THEME` references:

```js
// Before:
let fill   = THEME[type]       || THEME.empty;
let border = THEME[type + 'Border'] || fill;
// ...
ctx.fillStyle = THEME.textMuted;

// After:
const T    = this._theme;
let fill   = T[type]            || T.empty;
let border = T[type + 'Border'] || fill;
// ...
ctx.fillStyle = T.textMuted;
```

- [ ] **Step 3: Update `_drawNocLines()` to use `this._theme`**

Find `TensixViz.prototype._drawNocLines`. Replace:

```js
// Before:
ctx.strokeStyle = 'rgba(45,102,117,0.25)';

// After:
ctx.strokeStyle = this._theme.nocLine;
```

- [ ] **Step 4: Update `_drawHighlight()` to use `this._theme`**

Find `TensixViz.prototype._drawHighlight`. Replace:

```js
// Before:
const color  = THEME[hl.color] || hl.color || THEME.tensixActive;
const bright = hl.color === 'pink' ? THEME.pink : THEME.tensixPulse;

// After:
const T      = this._theme;
const color  = T[hl.color] || hl.color || T.tensixActive;
const bright = hl.color === 'pink' ? T.pink : T.tensixPulse;
```

- [ ] **Step 5: Update `_drawCellLabel()` to use `this._theme`**

Find `TensixViz.prototype._drawCellLabel`. Replace:

```js
// Before:
ctx.fillStyle = THEME.text;

// After:
ctx.fillStyle = this._theme.text;
```

- [ ] **Step 6: Update `_drawParticle()` to use `this._theme`**

Find `TensixViz.prototype._drawParticle`. Replace:

```js
// Before:
const color = p.color || THEME.particle;

// After:
const color = p.color || this._theme.particle;
```

- [ ] **Step 7: Update `_heatColor()` to accept a theme parameter**

Find `TensixViz.prototype._heatColor = function (t)`. Replace the entire function:

```js
TensixViz.prototype._heatColor = function (t, T) {
  // 0 → cool, 0.5 → warm, 1 → hot
  function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
  function hex(r, g, b) { return 'rgb(' + r + ',' + g + ',' + b + ')'; }
  const low  = T.heatLowRgb;
  const mid  = T.heatMidRgb;
  const high = T.heatHighRgb;
  if (t < 0.5) {
    const s = t * 2;
    return hex(lerp(low[0], mid[0], s), lerp(low[1], mid[1], s), lerp(low[2], mid[2], s));
  } else {
    const s = (t - 0.5) * 2;
    return hex(lerp(mid[0], high[0], s), lerp(mid[1], high[1], s), lerp(mid[2], high[2], s));
  }
};
```

- [ ] **Step 8: Update `_drawHeatmap()` to pass theme to `_heatColor`**

Find `TensixViz.prototype._drawHeatmap`. Replace the `_heatColor` call:

```js
// Before:
const color = this._heatColor(v);

// After:
const color = this._heatColor(v, this._theme);
```

- [ ] **Step 9: Update `_stepTransfer()` to resolve theme for particle color**

Find `TensixViz.prototype._stepTransfer`. Replace:

```js
// Before:
const color = THEME[step.color] || THEME.particle;

// After:
const T     = this._resolveTheme();
const color = T[step.color] || T.particle;
```

- [ ] **Step 10: Update the float label render override to use resolved theme**

Near the bottom of `src/chip.js` there is a second `render` definition that wraps the first (the float label override). Find the section that reads:

```js
TensixViz.prototype.render = function () {
  _origRender.call(this);
  if (this._floatLabelData) {
    const ctx  = this.ctx;
    const { cx, cy, text } = this._floatLabelData;
    const pad  = 6;
    ctx.font   = 'bold 11px sans-serif';
    const w    = ctx.measureText(text).width + pad * 2;
    const h    = 18;
    ctx.fillStyle   = 'rgba(15,42,53,0.88)';
    ctx.strokeStyle = THEME.teal;
    ctx.lineWidth   = 1;
    this._roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle    = THEME.tealLight;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
  }
};
```

Replace with:

```js
TensixViz.prototype.render = function () {
  _origRender.call(this);
  if (this._floatLabelData) {
    const T    = this._theme;   // set by _origRender → render() → _resolveTheme()
    const ctx  = this.ctx;
    const { cx, cy, text } = this._floatLabelData;
    const pad  = 6;
    ctx.font   = 'bold 11px sans-serif';
    const w    = ctx.measureText(text).width + pad * 2;
    const h    = 18;
    ctx.fillStyle   = T.floatLabelBg;
    ctx.strokeStyle = T.teal;
    ctx.lineWidth   = 1;
    this._roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle    = T.floatLabelFg;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
  }
};
```

- [ ] **Step 11: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Zero failures.

- [ ] **Step 12: Commit**

```bash
git add src/chip.js
git commit -m "feat: use resolved theme in all TensixViz render and draw methods"
```

---

## Task 5: Refactor `tensix-viz.css` to CSS custom properties

Replace every hardcoded hex color with a `var(--tv-*)` reference. Add the dark defaults on `:root`, improved contrast values, the `.tv-light` block, and the `.tv-auto` media query block.

**Files:**
- Modify: `tensix-viz.css`

- [ ] **Step 1: Replace the entire file contents**

Overwrite `tensix-viz.css` with the following (this is the complete file — all existing rules preserved, all colors tokenized):

```css
/* tensix-viz.css — theming via CSS custom properties
 *
 * Theme classes go on the widget container element:
 *   (none)     dark mode — default, backward-compatible
 *   .tv-light  force light (Cool Slate palette)
 *   .tv-auto   follow OS prefers-color-scheme
 */

/* ─── Dark defaults ─────────────────────────────────────────────────────── */
:root {
  /* Backgrounds — three depth levels matching widget hierarchy */
  --tv-bg:             #0B1E28;   /* .tensix-viz-wrapper outer bg */
  --tv-bg-header:      #0A1820;   /* header/footer/legend strips */
  --tv-bg-card:        #0D1F2D;   /* .tv-card inner bg */
  --tv-bg-system:      #0A1820;   /* .tv-system inner bg */
  --tv-bg-cluster:     #080F18;   /* .tv-cluster inner bg */

  /* Borders */
  --tv-border:         #3A7A8C;   /* main widget border (improved from #2D6675) */
  --tv-border-subtle:  #1A3C47;   /* inner dividers */

  /* Core-type fills */
  --tv-tensix:         #163848;
  --tv-dram:           #152035;
  --tv-eth:            #221638;
  --tv-pcie:           #2A2010;
  --tv-empty:          #0A1820;

  /* Core-type borders */
  --tv-tensix-border:  #3A7A8C;
  --tv-dram-border:    #2D4A6A;
  --tv-eth-border:     #5B3DA0;
  --tv-pcie-border:    #8B6914;

  /* Active / highlight */
  --tv-tensix-active:  #4FD1C5;

  /* Text */
  --tv-text:           #E8F0F2;
  --tv-text-muted:     #607D8B;

  /* Accents */
  --tv-teal:           #4FD1C5;

  /* Controls */
  --tv-btn-bg:         #1A3C47;
  --tv-btn-bg-hover:   #2D6675;
  --tv-btn-active-bg:  #4FD1C5;
  --tv-btn-active-fg:  #0B1E28;

  /* Cluster tile */
  --tv-tile:           #1e4a58;
  --tv-tile-outline:   #4fd1c5;

  /* Breadcrumb */
  --tv-breadcrumb-fg:  #4fd1c5;
  --tv-breadcrumb-bg:  rgba(10,24,32,0.85);

  /* Card ETH link */
  --tv-eth-link:       #5b3da0;
}

/* ─── Light theme — Cool Slate ──────────────────────────────────────────── */
.tv-light {
  --tv-bg:             #EEF4F8;
  --tv-bg-header:      #E4EDF4;
  --tv-bg-card:        #E8F1F6;
  --tv-bg-system:      #E4EDF4;
  --tv-bg-cluster:     #DDE8F0;
  --tv-border:         #6AACBE;
  --tv-border-subtle:  #B8D4E0;
  --tv-tensix:         #CCDDE8;
  --tv-dram:           #C5D8E8;
  --tv-eth:            #C5C5E0;
  --tv-pcie:           #E0D8C8;
  --tv-empty:          #E4EDF4;
  --tv-tensix-border:  #6AACBE;
  --tv-dram-border:    #5A9AB8;
  --tv-eth-border:     #7070B8;
  --tv-pcie-border:    #A0906A;
  --tv-tensix-active:  #0D9488;
  --tv-text:           #1A2C38;
  --tv-text-muted:     #4A6878;
  --tv-teal:           #0D9488;
  --tv-btn-bg:         #D8EBF2;
  --tv-btn-bg-hover:   #B8D4E0;
  --tv-btn-active-bg:  #0D9488;
  --tv-btn-active-fg:  #EEF4F8;
  --tv-tile:           #CCDDE8;
  --tv-tile-outline:   #0D9488;
  --tv-breadcrumb-fg:  #0D9488;
  --tv-breadcrumb-bg:  rgba(238,244,248,0.90);
  --tv-eth-link:       #7070B8;
}

/* ─── Auto theme — follows OS preference ────────────────────────────────── */
@media (prefers-color-scheme: light) {
  .tv-auto {
    --tv-bg:             #EEF4F8;
    --tv-bg-header:      #E4EDF4;
    --tv-bg-card:        #E8F1F6;
    --tv-bg-system:      #E4EDF4;
    --tv-bg-cluster:     #DDE8F0;
    --tv-border:         #6AACBE;
    --tv-border-subtle:  #B8D4E0;
    --tv-tensix:         #CCDDE8;
    --tv-dram:           #C5D8E8;
    --tv-eth:            #C5C5E0;
    --tv-pcie:           #E0D8C8;
    --tv-empty:          #E4EDF4;
    --tv-tensix-border:  #6AACBE;
    --tv-dram-border:    #5A9AB8;
    --tv-eth-border:     #7070B8;
    --tv-pcie-border:    #A0906A;
    --tv-tensix-active:  #0D9488;
    --tv-text:           #1A2C38;
    --tv-text-muted:     #4A6878;
    --tv-teal:           #0D9488;
    --tv-btn-bg:         #D8EBF2;
    --tv-btn-bg-hover:   #B8D4E0;
    --tv-btn-active-bg:  #0D9488;
    --tv-btn-active-fg:  #EEF4F8;
    --tv-tile:           #CCDDE8;
    --tv-tile-outline:   #0D9488;
    --tv-breadcrumb-fg:  #0D9488;
    --tv-breadcrumb-bg:  rgba(238,244,248,0.90);
    --tv-eth-link:       #7070B8;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEGACY TensixViz container (chip.js auto-init path)
   ═════════════════════════════════════════════════════════════════════════ */

.tensix-viz-wrapper {
  margin: 24px 0;
  background: var(--tv-bg);
  border: 1px solid var(--tv-border);
  border-radius: 8px;
  overflow: hidden;
}

.tensix-viz-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--tv-bg-header);
  border-bottom: 1px solid var(--tv-border-subtle);
}

.tensix-viz-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--tv-teal);
  font-family: monospace;
  letter-spacing: 0.05em;
}

.tensix-viz-arch-badge {
  font-size: 10px;
  color: var(--tv-text-muted);
  padding: 1px 6px;
  border: 1px solid var(--tv-border-subtle);
  border-radius: 10px;
}

.tensix-viz-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  gap: 8px;
}

.tensix-viz-canvas {
  display: block;
  border-radius: 4px;
  max-width: 100%;
}

.tensix-viz-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tv-play,
.tv-step {
  background: var(--tv-btn-bg);
  border: 1px solid var(--tv-border);
  border-radius: 4px;
  color: var(--tv-teal);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 4px 10px;
  transition: background 0.15s, border-color 0.15s;
}

.tv-play:hover,
.tv-step:hover {
  background: var(--tv-btn-bg-hover);
  border-color: var(--tv-teal);
}

.tv-play:active,
.tv-step:active {
  background: var(--tv-btn-active-bg);
  color: var(--tv-btn-active-fg);
}

.tv-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 6px 14px;
  border-top: 1px solid var(--tv-border-subtle);
  background: var(--tv-bg-header);
}

.tv-legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--tv-text-muted);
}

.tv-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CardViz, SystemViz, ClusterViz containers
   ═════════════════════════════════════════════════════════════════════════ */

/* ─── Card ─────────────────────────────────────────────────────────────── */

.tv-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--tv-bg-card);
  border-radius: 8px;
  padding: 12px;
  position: relative;
  overflow: hidden;
}

.tv-chip-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.tv-chip-wrapper.tv-hidden   { opacity: 0; pointer-events: none; }
.tv-chip-wrapper.tv-active   { transform: scale(1.1); }
.tv-chip-wrapper.tv-highlighted { outline: 2px solid var(--tv-tensix-active); border-radius: 4px; }

.tv-chip-label {
  color: var(--tv-text-muted);
  font-size: 0.7rem;
  font-family: monospace;
  text-align: center;
}

.tv-card-link {
  width: 24px;
  height: 40px;
  border-top: 2px dashed var(--tv-eth-link);
  border-bottom: 2px dashed var(--tv-eth-link);
  position: relative;
  flex-shrink: 0;
}

.tv-card-link::after {
  content: 'ETH';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--tv-eth-link);
  font-size: 0.55rem;
  font-family: monospace;
  white-space: nowrap;
}

/* ─── System ────────────────────────────────────────────────────────────── */

.tv-system {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: var(--tv-bg-system);
  border-radius: 8px;
  padding: 16px;
  position: relative;
}

.tv-card-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.tv-card-wrapper.tv-hidden   { opacity: 0; pointer-events: none; }
.tv-card-wrapper.tv-active   { transform: scale(1.05); }
.tv-card-wrapper.tv-highlighted { outline: 2px solid var(--tv-tensix-active); border-radius: 6px; }

.tv-system-card-label {
  color: var(--tv-text-muted);
  font-size: 0.75rem;
  font-family: monospace;
  letter-spacing: 0.05em;
}

.tv-system-link {
  color: var(--tv-eth-link);
  font-size: 0.65rem;
  font-family: monospace;
  text-align: center;
  padding: 2px 8px;
  border-left: 2px dashed var(--tv-eth-link);
  border-right: 2px dashed var(--tv-eth-link);
  white-space: nowrap;
}

/* ─── Cluster ───────────────────────────────────────────────────────────── */

.tv-cluster {
  background: var(--tv-bg-cluster);
  border-radius: 8px;
  padding: 16px;
  position: relative;
}

.tv-cluster-spec {
  color: var(--tv-text-muted);
  font-size: 0.7rem;
  font-family: monospace;
  margin-bottom: 12px;
  text-align: center;
}

.tv-cluster-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
}

.tv-cluster-dot-mode .tv-cluster-grid {
  grid-template-columns: repeat(16, 1fr);
  gap: 2px;
}

.tv-cluster-tile {
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--tv-tile);
  cursor: pointer;
  transition: background 0.1s ease;
}

.tv-cluster-tile.tv-highlighted { outline: 2px solid var(--tv-tile-outline); }
.tv-cluster-tile.tv-hidden      { opacity: 0.1; pointer-events: none; }
.tv-cluster-tile.tv-active      { outline: 2px solid var(--tv-tile-outline); }

/* ─── Breadcrumb ────────────────────────────────────────────────────────── */

.tv-breadcrumb {
  position: absolute;
  top: 6px;
  left: 8px;
  font-size: 0.7rem;
  font-family: monospace;
  color: var(--tv-breadcrumb-fg);
  z-index: 10;
  background: var(--tv-breadcrumb-bg);
  padding: 2px 8px;
  border-radius: 4px;
}

/* ─── Zoom state ────────────────────────────────────────────────────────── */

.tv-zoomed-in { overflow: visible; }
```

- [ ] **Step 2: Visually verify dark mode unchanged**

Open `examples/index.html` in a browser (e.g. `npx serve .` then navigate to `/examples/`). Confirm the existing dark widgets look the same as before (the contrast on cell borders should look slightly crisper — this is the intentional fix).

- [ ] **Step 3: Visually verify light mode works**

In the browser console on the examples page, run:

```js
document.querySelector('[data-viz="card"]').classList.add('tv-light')
```

The CardViz widget should immediately switch to the Cool Slate light palette.

- [ ] **Step 4: Commit**

```bash
git add tensix-viz.css
git commit -m "feat: refactor tensix-viz.css to CSS custom properties; add .tv-light and .tv-auto themes"
```

---

## Task 6: Rebuild the bundle

**Files:**
- Modify: `tensix-viz.js`, `tensix-viz.esm.js` (generated)

- [ ] **Step 1: Run the build**

```bash
node build.js
```

Expected output (no errors):

```
tensix-viz.js   built
tensix-viz.esm.js   built
tensix-viz.css  copied
```

- [ ] **Step 2: Commit the rebuilt bundle**

```bash
git add tensix-viz.js tensix-viz.esm.js
git commit -m "build: rebuild bundle with light mode and contrast fix"
```

---

## Task 7: Add theme demo to `examples/index.html`

Add a live toggle so users can see both themes side by side.

**Files:**
- Modify: `examples/index.html`

- [ ] **Step 1: Add the theme toggle section**

After the opening `<div class="page-body">` tag and before the first `<h2>`, add:

```html
<!-- ── Theme toggle ───────────────────────────────────────────────────── -->
<div style="margin-bottom:24px;display:flex;align-items:center;gap:12px">
  <span style="font-size:0.8rem;color:#607d8b">Theme:</span>
  <button class="mode-btn active" id="btn-dark"  onclick="setTheme('dark')">Dark</button>
  <button class="mode-btn"        id="btn-light" onclick="setTheme('light')">Light</button>
  <button class="mode-btn"        id="btn-auto"  onclick="setTheme('auto')">Auto (OS)</button>
</div>
```

- [ ] **Step 2: Add the `setTheme` script**

Before the closing `</body>` tag, add:

```html
<script>
function setTheme(mode) {
  // Apply theme class to every widget container
  document.querySelectorAll('[data-viz], .tensix-viz-container').forEach(function(el) {
    el.classList.remove('tv-light', 'tv-auto')
    if (mode === 'light') el.classList.add('tv-light')
    if (mode === 'auto')  el.classList.add('tv-auto')
  })
  // Update button states
  document.querySelectorAll('#btn-dark,#btn-light,#btn-auto').forEach(function(b) {
    b.classList.remove('active')
  })
  document.getElementById('btn-' + mode).classList.add('active')
}
</script>
```

- [ ] **Step 3: Visually verify in browser**

Open `examples/index.html`. Click "Light" — all four widget types (TensixViz, CardViz, SystemViz, ClusterViz) should switch to the Cool Slate palette. Click "Dark" to restore. Click "Auto" to follow OS preference.

- [ ] **Step 4: Commit**

```bash
git add examples/index.html
git commit -m "feat(examples): add dark/light/auto theme toggle"
```

---

## Task 8: Add theme demo to `docs/index.html`

**Files:**
- Modify: `docs/index.html`

- [ ] **Step 1: Find the hero widget container**

In `docs/index.html`, locate the element that renders the hero chip visualization (it will have `data-viz="chip"` or similar). Note its `id` or unique attributes.

- [ ] **Step 2: Add theme switcher near the hero widget**

Immediately after the hero canvas/widget element, add:

```html
<div style="display:flex;gap:8px;margin-top:10px;align-items:center">
  <span style="font-size:0.75rem;color:var(--muted)">Theme:</span>
  <button onclick="setDocsTheme('dark')"  id="docs-btn-dark"  style="background:none;border:1px solid var(--border);color:var(--teal);border-radius:4px;padding:2px 10px;font-size:0.75rem;cursor:pointer">Dark</button>
  <button onclick="setDocsTheme('light')" id="docs-btn-light" style="background:none;border:1px solid var(--border);color:var(--teal);border-radius:4px;padding:2px 10px;font-size:0.75rem;cursor:pointer">Light</button>
  <button onclick="setDocsTheme('auto')"  id="docs-btn-auto"  style="background:none;border:1px solid var(--border);color:var(--teal);border-radius:4px;padding:2px 10px;font-size:0.75rem;cursor:pointer">Auto</button>
</div>
```

- [ ] **Step 3: Add the script**

Before the closing `</body>` tag in `docs/index.html`, add:

```html
<script>
function setDocsTheme(mode) {
  document.querySelectorAll('[data-viz], .tensix-viz-container').forEach(function(el) {
    el.classList.remove('tv-light', 'tv-auto')
    if (mode === 'light') el.classList.add('tv-light')
    if (mode === 'auto')  el.classList.add('tv-auto')
  })
}
</script>
```

- [ ] **Step 4: Verify in browser and commit**

```bash
git add docs/index.html
git commit -m "feat(docs): add theme switcher to hero widget demo"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `.tv-light` CSS class → Task 5
- ✅ `.tv-auto` media query → Task 5
- ✅ Dark mode border contrast fix → Task 5 (`:root` `--tv-border: #3A7A8C`)
- ✅ `THEME_DARK` / `THEME_LIGHT` in chip.js → Task 3
- ✅ `_resolveTheme()` walks DOM → Task 3
- ✅ `render()` uses `this._theme` → Task 4
- ✅ Float label pill uses resolved theme → Task 4 step 10
- ✅ NOC lines use `T.nocLine` → Task 4 step 3
- ✅ `_heatColor` uses theme RGB tuples → Task 4 steps 7-8
- ✅ `_stepTransfer` resolves theme for particle color → Task 4 step 9
- ✅ Backward compat — no constructor changes → (no task needed, ensured by `:root` dark defaults)
- ✅ Bundle rebuild → Task 6
- ✅ Demo in examples page → Task 7
- ✅ Demo in docs page → Task 8

**Placeholder scan:** None found.

**Type/name consistency:**
- `THEME_DARK` / `THEME_LIGHT` used in Task 3, referenced in Task 2 tests — consistent.
- `_resolveTheme()` defined Task 3, called in Task 4 — consistent.
- `this._theme` set in `render()` Task 4 step 1, read in all draw methods and the float label override — consistent.
- `heatLowRgb` / `heatMidRgb` / `heatHighRgb` defined in Task 3 THEME objects, consumed in `_heatColor` Task 4 step 7 — consistent.
- `floatLabelBg` / `floatLabelFg` defined in Task 3 THEME objects, consumed in Task 4 step 10 — consistent.
- `nocLine` defined in Task 3 THEME objects, consumed in Task 4 step 3 — consistent.
