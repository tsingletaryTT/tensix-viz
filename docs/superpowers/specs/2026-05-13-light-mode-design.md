# tensix-viz — Light Mode & Dark Mode Contrast Fix

**Date:** 2026-05-13
**Status:** Approved, ready for implementation

---

## Problem

1. **No light mode.** Widgets are hard-coded dark, making them illegible when embedded in light-background documentation pages (Docusaurus, Mintlify, GitHub Pages, etc.).
2. **Dark mode contrast is blurry.** The idle Tensix cell fill (`#1E4A58`) and its border (`#2D6675`) have too little value delta — cells don't read as distinct from each other at a glance.

---

## Goals

- Add a **light mode** option (Cool Slate palette) and an **auto mode** (follows OS `prefers-color-scheme`).
- Fix the **dark mode border contrast** so cells are crisp and distinct.
- Zero breaking changes — existing dark-mode embeddings continue working with no changes required.
- No changes to any widget JS classes (CardViz, SystemViz, ClusterViz) or animation logic.

---

## Non-Goals

- Runtime theme toggling via JS API (users add/remove the CSS class if needed).
- More than two themes (dark / light).
- Any changes to topology data, animation modes, or the public JS API.

---

## API

Theme is controlled by a CSS class on the widget container element. No constructor changes needed.

| Class | Behavior |
|---|---|
| *(none)* | Dark theme (default, backward-compatible) |
| `tv-light` | Force light (Cool Slate) |
| `tv-auto` | Follows OS `prefers-color-scheme` |

### Examples

```html
<!-- Existing usage — unchanged, still dark -->
<div data-viz="card" data-config="bh-p300c"></div>

<!-- Explicit light -->
<div class="tv-light" data-viz="card" data-config="bh-p300c"></div>

<!-- OS-aware -->
<div class="tv-auto" data-viz="cluster" data-config="bh-galaxy"></div>

<!-- Legacy TensixViz container — same pattern -->
<div class="tensix-viz-container tv-light" data-arch="blackhole" ...></div>
```

---

## Design

### 1. CSS Custom Properties (`tensix-viz.css`)

All hardcoded hex colors are replaced with `var(--tv-*)` references. Color values live in three places:

**`:root` — dark defaults (with improved border contrast)**

```css
:root {
  /* Backgrounds — three depth levels matching the existing CSS hierarchy */
  --tv-bg:             #0B1E28;   /* wrapper (.tensix-viz-wrapper), was #0F2A35 */
  --tv-bg-header:      #0A1820;   /* header/footer strips, was #0D2030 */
  --tv-bg-card:        #0D1F2D;   /* .tv-card inner bg, was #0d1f2d */
  --tv-bg-system:      #0A1820;   /* .tv-system inner bg, was #0a1820 */
  --tv-bg-cluster:     #080F18;   /* .tv-cluster inner bg, was #080f18 */

  /* Borders & structure */
  --tv-border:         #3A7A8C;   /* was #2D6675 — KEY contrast fix */
  --tv-border-subtle:  #1A3C47;

  /* Core types — fill */
  --tv-tensix:         #163848;   /* was #1E4A58 */
  --tv-dram:           #152035;
  --tv-eth:            #221638;
  --tv-pcie:           #2A2010;
  --tv-empty:          #0A1820;

  /* Core types — border */
  --tv-tensix-border:  #3A7A8C;
  --tv-dram-border:    #2D4A6A;
  --tv-eth-border:     #5B3DA0;
  --tv-pcie-border:    #8B6914;

  /* Active / highlight */
  --tv-tensix-active:  #4FD1C5;
  --tv-tensix-pulse:   #81E6D9;

  /* Text */
  --tv-text:           #E8F0F2;
  --tv-text-muted:     #607D8B;

  /* Accent */
  --tv-teal:           #4FD1C5;
  --tv-teal-light:     #81E6D9;
  --tv-pink:           #EC96B8;
  --tv-gold:           #F4C471;
  --tv-green:          #27AE60;
  --tv-red:            #FF6B6B;

  /* Canvas-specific */
  --tv-particle:       #4FD1C5;
  --tv-heat-low:       #1E4A58;
  --tv-heat-mid:       #F4C471;
  --tv-heat-high:      #FF6B6B;
  --tv-noc-line:       rgba(45,102,117,0.25);
  --tv-float-label-bg: rgba(13,31,45,0.88);
  --tv-float-label-fg: #81E6D9;
  --tv-breadcrumb-bg:  rgba(10,24,32,0.85);
}
```

**`.tv-light` — Cool Slate palette**

```css
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
  --tv-tensix-pulse:   #0A7A70;

  --tv-text:           #1A2C38;
  --tv-text-muted:     #4A6878;

  --tv-teal:           #0D9488;
  --tv-teal-light:     #0A7A70;
  --tv-pink:           #B01060;
  --tv-gold:           #B45309;
  --tv-green:          #15803D;
  --tv-red:            #DC2626;

  --tv-particle:       #0D9488;
  --tv-heat-low:       #CCDDE8;
  --tv-heat-mid:       #D97706;
  --tv-heat-high:      #DC2626;
  --tv-noc-line:       rgba(70,140,160,0.35);
  --tv-float-label-bg: rgba(238,244,248,0.92);
  --tv-float-label-fg: #0A4A58;
  --tv-breadcrumb-bg:  rgba(238,244,248,0.90);
}
```

**`.tv-auto` — defers to OS preference**

The `.tv-auto` block is a full copy of the `.tv-light` variable declarations, wrapped in a media query. No deduplication mechanism (no SCSS/PostCSS in this project), so the variables are written out twice — once for `.tv-light` (explicit override) and once for `.tv-auto` inside the media query. This is intentional and keeps the CSS self-contained.

```css
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
    --tv-tensix-pulse:   #0A7A70;
    --tv-text:           #1A2C38;
    --tv-text-muted:     #4A6878;
    --tv-teal:           #0D9488;
    --tv-teal-light:     #0A7A70;
    --tv-pink:           #B01060;
    --tv-gold:           #B45309;
    --tv-green:          #15803D;
    --tv-red:            #DC2626;
    --tv-particle:       #0D9488;
    --tv-heat-low:       #CCDDE8;
    --tv-heat-mid:       #D97706;
    --tv-heat-high:      #DC2626;
    --tv-noc-line:       rgba(70,140,160,0.35);
    --tv-float-label-bg: rgba(238,244,248,0.92);
    --tv-float-label-fg: #0A4A58;
    --tv-breadcrumb-bg:  rgba(238,244,248,0.90);
  }
}
```

---

### 2. TensixViz Canvas Theme Resolution (`src/chip.js`)

The canvas widget can't use CSS variables — all colors are drawn in JS. Two parallel THEME objects replace the single `THEME` const:

- `THEME_DARK` — existing values, adjusted to match the improved `:root` variables
- `THEME_LIGHT` — Cool Slate values matching `.tv-light` variables

A new helper walks up the DOM from the canvas element to find the active theme class:

```js
TensixViz.prototype._resolveTheme = function () {
  let node = this.canvas.parentElement
  while (node) {
    if (node.classList.contains('tv-light')) return THEME_LIGHT
    if (node.classList.contains('tv-auto')) {
      return window.matchMedia('(prefers-color-scheme: light)').matches
        ? THEME_LIGHT : THEME_DARK
    }
    node = node.parentElement
  }
  return THEME_DARK
}
```

`render()` calls `_resolveTheme()` once per frame and passes the result through all drawing methods:

```js
TensixViz.prototype.render = function () {
  const T = this._resolveTheme()
  // All drawing: T.bg, T.tensix, T.text, T.particle, etc.
}
```

The float label pill (rendered in the `render` override at the bottom of chip.js) reads `T.floatLabelBg` and `T.floatLabelFg` from the resolved theme.

The NOC grid lines use `T.nocLine` (a full `rgba(...)` string) instead of a hardcoded value.

**Complete THEME object shape** (both `THEME_DARK` and `THEME_LIGHT` must have all keys):

```js
// Keys match existing THEME usage + three new keys: floatLabelBg, floatLabelFg, nocLine
{
  bg, grid,
  tensix, tensixBorder, tensixActive, tensixPulse,
  dram, dramBorder,
  eth, ethBorder,
  pcie, pcieBorder,
  empty,
  text, textMuted,
  teal, tealLight,
  pink, gold, green, red,
  particle,
  heatLow, heatMid, heatHigh,
  // New keys:
  nocLine,        // full rgba() string for NOC grid lines
  floatLabelBg,   // background of the float label pill
  floatLabelFg,   // text color of the float label pill
}
```

---

### 3. Backward Compatibility

- **No constructor API changes.** Existing `new TensixViz(canvas, { arch })`, `new CardViz(el, config)`, etc. are unchanged.
- **No data-attribute changes.** `data-viz`, `data-config`, `data-mode` are unchanged.
- **Default is dark.** `:root` defines dark, so any existing embedding without a theme class continues to look exactly as before (modulo the contrast improvement).
- **DOM widgets need zero JS changes.** CardViz, SystemViz, ClusterViz and their CSS classes inherit the theme purely through CSS cascade.

---

### 4. Demo Updates

`docs/index.html` and `examples/index.html` each get a small side-by-side or toggle demo showing the light and dark themes, so library users can see both options immediately.

---

## Files Changed

| File | Change |
|---|---|
| `tensix-viz.css` | Full CSS variable refactor; add `.tv-light` and `.tv-auto @media` blocks |
| `src/chip.js` | Rename `THEME` → `THEME_DARK`; add `THEME_LIGHT`; add `_resolveTheme()`; update `render()` and float label to use resolved theme |
| `docs/index.html` | Add light/dark theme toggle demo |
| `examples/index.html` | Add light/dark theme toggle demo |
| `tensix-viz.js` | Rebuilt output |
| `tensix-viz.esm.js` | Rebuilt output |

## Files Unchanged

`src/card.js`, `src/system.js`, `src/cluster.js`, `src/topology.js`, `src/index.js`, all tests, all topology JSONs.
