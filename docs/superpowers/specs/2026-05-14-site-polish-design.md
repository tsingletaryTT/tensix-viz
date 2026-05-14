# Site Polish — Design Spec

**Date:** 2026-05-14
**Status:** Approved
**Feature branch target:** `main` (no new branch needed — pure HTML/CSS, no JS library changes)

---

## Goal

Make `docs/index.html` and `examples/index.html` feel like the same site: unified nav, correct cross-page links, interlinked content, and the memory visualization feature surfaced on the examples page.

---

## Scope

**In scope:**

- New `site.css` at repo root — shared CSS vars and nav styles
- Unified nav HTML on both pages (Option A: same links, active page teal-highlighted)
- Fix all broken cross-page `href` values
- Add `kernel_dispatch` to examples chip demo (button + text update)
- Add memory visualization section (#7) to examples page with live sliders

**Out of scope:**

- `src/chip.js` / bundles — no JS library changes
- Light mode support for examples — deferred
- Responsive / mobile nav — deferred

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `site.css` | **Create** | Shared CSS vars + nav styles |
| `docs/index.html` | **Modify** | Link site.css, replace nav HTML, fix 3 broken example hrefs |
| `examples/index.html` | **Modify** | Link site.css, replace nav styles + HTML, add kernel_dispatch, add §7 memory viz |

---

## 1. Shared CSS (`site.css`)

New file at repo root, linked by both pages as `../site.css`.

### 1a. CSS custom properties

Moved from `docs/index.html` inline `<style>` into the shared file. Examples page currently hardcodes the same hex values — after this change it uses the vars.

```css
:root {
  --bg0:        #080f14;
  --bg1:        #0d1b24;
  --card:       #162838;
  --card2:      #1a3040;
  --teal:       #4fd1c5;
  --teal-dim:   #3aada2;
  --teal-glow:  rgba(79,209,197,.15);
  --pink:       #ec96b8;
  --gold:       #f4c471;
  --green:      #27ae60;
  --text:       #e8f0f2;
  --text2:      #b0c4d0;
  --muted:      #607d8b;
  --border:     rgba(79,209,197,.18);
}
```

### 1b. Shared nav styles

Class naming convention: `.site-nav`, `.site-nav-brand`, `.site-nav-anchors`, `.site-nav-links`, `.site-nav-link`, `.site-nav-link--active`.

```css
.site-nav {
  position: sticky; top: 0; z-index: 100;
  background: rgba(8,15,20,.92);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  padding: 0 clamp(1.25rem, 5vw, 5rem);
  display: flex; align-items: center; gap: 2rem;
  height: 56px;
  font-family: system-ui, -apple-system, sans-serif;
}
.site-nav-brand {
  color: var(--teal); font-weight: 600; font-size: 1rem;
  text-decoration: none; letter-spacing: -.01em;
}
.site-nav-anchors {
  display: flex; gap: 1.5rem;
}
.site-nav-anchors a {
  color: var(--text2); text-decoration: none; font-size: 0.875rem;
  transition: color .15s;
}
.site-nav-anchors a:hover { color: var(--teal); }
.site-nav-links {
  display: flex; gap: 1.5rem; margin-left: auto;
}
.site-nav-link {
  color: var(--text2); text-decoration: none; font-size: 0.875rem;
  transition: color .15s;
}
.site-nav-link:hover { color: var(--teal); }
.site-nav-link--active {
  color: var(--teal); font-weight: 500;
}
```

---

## 2. Nav HTML

### docs/index.html

The old `<nav>` block (using `.nav-title` / `.nav-links`) is replaced:

```html
<nav class="site-nav">
  <a class="site-nav-brand" href="#">tensix-viz</a>
  <div class="site-nav-anchors">
    <a href="#the-grid">The Grid</a>
    <a href="#animation-modes">Animation Modes</a>
    <a href="#api">API</a>
  </div>
  <div class="site-nav-links">
    <a class="site-nav-link site-nav-link--active" href="#">Docs</a>
    <a class="site-nav-link" href="../examples/index.html">Examples</a>
    <a class="site-nav-link" href="https://github.com/tsingletaryTT/tensix-viz" target="_blank">GitHub ↗</a>
  </div>
</nav>
```

Old inline nav styles (`.nav-title`, `.nav-links`) are removed from the page `<style>` block. The `:root` vars block is also removed (moved to `site.css`).

### examples/index.html

The old `<nav>` block (with breadcrumb `/ examples`) is replaced:

```html
<nav class="site-nav">
  <a class="site-nav-brand" href="../docs/index.html">tensix-viz</a>
  <div class="site-nav-links">
    <a class="site-nav-link" href="../docs/index.html">Docs</a>
    <a class="site-nav-link site-nav-link--active" href="#">Examples</a>
    <a class="site-nav-link" href="https://github.com/tsingletaryTT/tensix-viz" target="_blank">GitHub ↗</a>
  </div>
</nav>
```

Old inline nav styles (`.nav-brand`, `.nav-sub`, `.nav-links`) are removed from the page `<style>` block.

---

## 3. Broken Link Fixes (`docs/index.html`)

Three occurrences of `./examples.html` → `../examples/index.html`:

1. Nav `<a>` for Examples — handled by new nav HTML in §2
2. "Open examples" CTA button inside the examples showcase section
3. Footer link

---

## 4. Examples Page — `kernel_dispatch` Addition

**Button:** Add `<button>` for `kernel_dispatch` alongside the existing nine mode buttons in the chip demo section.

**Text:** Update the section description from "all nine animation modes" → "all ten animation modes".

No other changes to the existing chip demo section.

---

## 5. Examples Page — Memory Visualization Section (§7)

New section appended after the existing numbered sections. Title: `#7 — Memory visualization`.

### Canvas

- `arch: 'blackhole'`, `showMemory: true`
- Initial mode: `'inference'`
- Size: 340 × 240 (matches other chip canvases on the page)

### Controls

Two range sliders and a mode dropdown below the canvas:

| Control | Initial value | Range | On change |
|---------|--------------|-------|-----------|
| DRAM bandwidth | 0.55 | 0–1, step 0.01 | `viz.setMemoryStats({ dram_bw: val })` |
| L1 fill | 0.45 | 0–1, step 0.01 | `viz.setMemoryStats({ l1_fill: val })` |
| Mode dropdown | `inference` | `idle`, `inference`, `prefill`, `thinking`, `agents`, `diffusion`, `video`, `batch`, `explore`, `kernel_dispatch` | `viz.activate(mode)` — clears override, returns to preset |

Slider labels show the current numeric value (updated live on `input`).

### Accuracy note

Small muted text below the controls:

> Values are normalized (0–1 maps to 0–peak bandwidth). All are visual metaphors unless overridden via `setMemoryStats()` with real telemetry.

### Code snippet

After the controls, a short collapsed `<details>` code block showing the API:

```js
const viz = new TensixViz(canvas, { arch: 'blackhole', showMemory: true })
viz.activate('inference')

// override with real telemetry
viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })

// partial override — only dram_bw changes; l1_fill stays on preset
viz.setMemoryStats({ dram_bw: 0.90 })
```

---

## Accuracy and Correctness Notes

- `setMemoryStats()` partial override semantics: each call to `setMemoryStats()` sets only the provided keys; unprovided keys fall back to the current mode preset. The override is sticky until `viz.activate()` or `viz.reset()` is called.
- `viz.activate(mode)` clears any `setMemoryStats()` override and restores preset-driven behavior. The mode dropdown demonstrates this clearly — moving the sliders then changing the mode shows the override being cleared.

---

## Testing

- Manual: load `docs/index.html` and `examples/index.html` in a browser; verify nav, links, memory section
- All existing 71 unit tests must continue to pass (no JS library changes)
