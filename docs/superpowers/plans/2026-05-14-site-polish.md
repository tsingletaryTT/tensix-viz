# Site Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the nav across docs and examples, fix all broken cross-page links, add `kernel_dispatch` to the examples chip demo, and add a §7 memory visualization section with live sliders.

**Architecture:** New `site.css` at repo root holds shared CSS tokens and nav styles; both pages link to it and replace their inline nav markup with the shared `.site-nav` class hierarchy. No JS library changes — all edits are HTML/CSS/inline JS.

**Tech Stack:** Vanilla HTML/CSS/JS. No build step needed. Tests run via `npm test` (vitest).

---

## File Structure

| File | Action |
|------|--------|
| `site.css` | **Create** — shared `:root` CSS vars + `.site-nav*` styles |
| `docs/index.html` | **Modify** — link site.css, replace nav, fix 3 links, fix hero copy |
| `examples/index.html` | **Modify** — link site.css, replace nav, add kernel_dispatch, add §7 |

---

## Context for implementers

### Section IDs in docs/index.html
- `<section id="grid">` — "The Grid"
- `<section id="modes">` — "Animation Modes"
- `<section id="api">` — "API"

### CSS class changes
| Old class | New class | Used in |
|-----------|-----------|---------|
| `nav` (element) | `.site-nav` | both pages |
| `.nav-title` | `.site-nav-brand` | docs |
| `.nav-links` | `.site-nav-links` | both |
| `.nav-brand` | `.site-nav-brand` | examples |
| `.nav-sub` | *(removed — no breadcrumb in new nav)* | examples |
| *(new)* | `.site-nav-anchors` | docs |
| *(new)* | `.site-nav-link` | both |
| *(new)* | `.site-nav-link--active` | both |

### Cross-page link paths (from repo root)
- `docs/index.html` → examples: `../examples/index.html`
- `examples/index.html` → docs: `../docs/index.html`
- Both link to `site.css` as: `../site.css`

---

## Task 1: Create `site.css`

**Files:**
- Create: `site.css`

- [ ] **Step 1: Create `site.css` with shared tokens and nav styles**

```css
/* ── Site-wide design tokens ───────────────────────────────────────────────
   Shared between docs/index.html and examples/index.html.
   Link as: <link rel="stylesheet" href="../site.css">                      */

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

/* ── Shared nav ─────────────────────────────────────────────────────────── */
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

@media (max-width: 640px) {
  .site-nav-anchors { display: none; }
  .site-nav-links   { gap: 1rem; }
}
```

- [ ] **Step 2: Run tests — confirm no regressions**

```bash
npm test
```
Expected: `71 passed (71)`

- [ ] **Step 3: Commit**

```bash
git add site.css
git commit -m "feat: add shared site.css with CSS tokens and nav styles"
```

---

## Task 2: Update `docs/index.html`

**Files:**
- Modify: `docs/index.html`

Six separate edits. Make them all, verify in browser, then commit once.

- [ ] **Step 1: Add `<link>` to `site.css` (line 8)**

Find:
```html
  <link rel="stylesheet" href="../tensix-viz.css">
  <style>
```

Replace with:
```html
  <link rel="stylesheet" href="../tensix-viz.css">
  <link rel="stylesheet" href="../site.css">
  <style>
```

- [ ] **Step 2: Remove the inline `:root` vars block**

Find and delete the entire block (lines 9–25 inclusive — from `    :root {` through the closing `    }` and the blank line after it):

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

After deletion the `<style>` tag is followed directly by `    *, *::before, *::after ...`.

- [ ] **Step 3: Remove the old inline nav styles**

Find and delete this block (lines 36–50, from the `/* ── Nav */` comment through the blank line after `.nav-links a:hover`):

```css
    /* ── Nav ────────────────────────────────────────────────────────────── */
    nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(8,15,20,.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0 clamp(1.25rem, 5vw, 5rem);
      display: flex; align-items: center; gap: 2rem;
      height: 56px;
    }
    .nav-title { color: var(--teal); font-weight: 600; font-size: 1rem; text-decoration: none; letter-spacing: -.01em; }
    .nav-links  { display: flex; gap: 1.5rem; margin-left: auto; }
    .nav-links a { color: var(--text2); text-decoration: none; font-size: 0.875rem; transition: color .15s; }
    .nav-links a:hover { color: var(--teal); }

```

- [ ] **Step 4: Remove the 640 px responsive rule that references the old `.nav-links`**

Find and delete:
```css
    @media (max-width: 640px) {
      .nav-links { display: none; }
    }
```

The 900 px media query above it (`@media (max-width: 900px) { ... }`) is page-specific and stays.

- [ ] **Step 5: Replace the `<nav>` block with the unified site-nav**

Find:
```html
  <nav>
    <a class="nav-title" href="#">tensix-viz</a>
    <div class="nav-links">
      <a href="#grid">The Grid</a>
      <a href="#modes">Animation Modes</a>
      <a href="#api">API</a>
      <a href="./examples.html">Examples</a>
      <a href="https://github.com/tsingletaryTT/tensix-viz">GitHub ↗</a>
    </div>
  </nav>
```

Replace with:
```html
  <nav class="site-nav">
    <a class="site-nav-brand" href="#">tensix-viz</a>
    <div class="site-nav-anchors">
      <a href="#grid">The Grid</a>
      <a href="#modes">Animation Modes</a>
      <a href="#api">API</a>
    </div>
    <div class="site-nav-links">
      <a class="site-nav-link site-nav-link--active" href="#">Docs</a>
      <a class="site-nav-link" href="../examples/index.html">Examples</a>
      <a class="site-nav-link" href="https://github.com/tsingletaryTT/tensix-viz" target="_blank">GitHub ↗</a>
    </div>
  </nav>
```

- [ ] **Step 6: Fix three stale `./examples.html` occurrences and hero copy**

**6a.** Fix the hero paragraph (says "Nine animation modes" — already added `kernel_dispatch`):

Find:
```html
        <p>tensix-viz renders Tenstorrent hardware — from a single Tensix core up to a Galaxy SuperCluster — in a zero-dependency Canvas file. Nine animation modes make each workload visible on the chip.</p>
```
Replace with:
```html
        <p>tensix-viz renders Tenstorrent hardware — from a single Tensix core up to a Galaxy SuperCluster — in a zero-dependency Canvas file. Ten animation modes make each workload visible on the chip.</p>
```

**6b.** Fix the "Open examples" CTA button:

Find:
```html
          <a class="btn-primary" href="./examples.html">Open examples</a>
```
Replace with:
```html
          <a class="btn-primary" href="../examples/index.html">Open examples</a>
```

**6c.** Fix the footer link:

Find:
```html
    <a href="./examples.html">Examples</a>
```
Replace with:
```html
    <a href="../examples/index.html">Examples</a>
```

- [ ] **Step 7: Run tests — confirm no regressions**

```bash
npm test
```
Expected: `71 passed (71)`

- [ ] **Step 8: Open `docs/index.html` in a browser and verify**

Open: `open docs/index.html`

Check:
- Nav shows: `tensix-viz | The Grid | Animation Modes | API | Docs (teal) | Examples | GitHub ↗`
- "Docs" link is teal (active)
- "Examples" link navigates to `../examples/index.html`
- "Open examples" button works
- Footer Examples link works
- All CSS vars still render correctly (teal, dark background, etc.)
- Section anchors (The Grid, Animation Modes, API) scroll to correct sections

- [ ] **Step 9: Commit**

```bash
git add docs/index.html
git commit -m "feat(docs): unified nav, fix broken examples links, update hero copy"
```

---

## Task 3: Update `examples/index.html` — nav and kernel_dispatch

**Files:**
- Modify: `examples/index.html`

- [ ] **Step 1: Add `<link>` to `site.css`**

Find:
```html
  <link rel="stylesheet" href="../tensix-viz.css">
  <style>
```

Replace with:
```html
  <link rel="stylesheet" href="../tensix-viz.css">
  <link rel="stylesheet" href="../site.css">
  <style>
```

- [ ] **Step 2: Remove old inline nav styles from the `<style>` block**

Find and delete these six lines (they are contiguous inside the `<style>` block):

```css
    nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(8,15,20,.94); backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(79,209,197,.18);
      padding: 0 2rem; display: flex; align-items: center; gap: 1.5rem; height: 52px;
    }
    .nav-brand { color: #4fd1c5; font-weight: 600; font-size: 0.95rem; text-decoration: none; }
    .nav-sub   { color: #607d8b; font-size: 0.875rem; }
    .nav-links { display: flex; gap: 1.5rem; margin-left: auto; }
    .nav-links a { color: #b0c4d0; text-decoration: none; font-size: 0.875rem; }
    .nav-links a:hover { color: #4fd1c5; }
```

After deletion the `<style>` block starts directly with `    body { ... }`.

- [ ] **Step 3: Replace the `<nav>` block with the unified site-nav**

Find:
```html
  <nav>
    <a class="nav-brand" href="./index.html">tensix-viz</a>
    <span class="nav-sub">/ examples</span>
    <div class="nav-links">
      <a href="./index.html">Docs</a>
      <a href="https://github.com/tsingletaryTT/tensix-viz">GitHub ↗</a>
    </div>
  </nav>
```

Replace with:
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

- [ ] **Step 4: Update the intro paragraph ("all nine" → "all ten")**

Find:
```html
  <p>All four renderer classes, all nine animation modes, and all three themes. Use the controls to switch modes and palettes live.</p>
```

Replace with:
```html
  <p>All four renderer classes, all ten animation modes, and all three themes. Use the controls to switch modes and palettes live.</p>
```

- [ ] **Step 5: Add `kernel_dispatch` button to the chip demo**

Find (the `batch` button line followed by the closing `</div>`):
```html
        <button class="mode-btn" onclick="setChipMode('batch',this)">batch</button>
      </div>
    </div>
```

Replace with:
```html
        <button class="mode-btn" onclick="setChipMode('batch',this)">batch</button>
        <button class="mode-btn" onclick="setChipMode('kernel_dispatch',this)">kernel_dispatch</button>
      </div>
    </div>
```

- [ ] **Step 6: Run tests — confirm no regressions**

```bash
npm test
```
Expected: `71 passed (71)`

- [ ] **Step 7: Open `examples/index.html` in a browser and verify**

Open: `open examples/index.html`

Check:
- Nav shows: `tensix-viz | Docs | Examples (teal) | GitHub ↗`
- "Examples" link is teal (active)
- "Docs" link navigates to `../docs/index.html`
- No breadcrumb "/ examples" remnant
- `kernel_dispatch` button appears in the chip section, activates the mode
- Intro text says "all ten animation modes"
- Existing chip/card/system/cluster demos still work
- Theme toggle still works

- [ ] **Step 8: Commit**

```bash
git add examples/index.html
git commit -m "feat(examples): unified nav, add kernel_dispatch button"
```

---

## Task 4: Add §7 Memory Visualization Section to `examples/index.html`

**Files:**
- Modify: `examples/index.html`

- [ ] **Step 1: Add the §7 HTML section before `</div><!-- end page-body -->`**

Find:
```html
  </script>
  </div><!-- end page-body -->
```

Replace with:
```html
  </script>

  <!-- ── 7. Memory visualization ─────────────────────────────────────────── -->
  <h2>7. Memory visualization — <code>showMemory: true</code></h2>
  <p>An opt-in DRAM activity and L1 fill overlay for <code>TensixViz</code>. Use the sliders to drive <code>setMemoryStats()</code> live, or switch modes to see each preset.</p>
  <div class="demo-row">
    <div class="demo-card">
      <canvas id="mem-chip" width="340" height="240"></canvas>
      <div style="margin-top:12px">
        <div style="display:grid;grid-template-columns:max-content 1fr max-content;gap:6px 10px;align-items:center;font-size:0.78rem;color:#607d8b">
          <label for="slider-dram">DRAM bandwidth</label>
          <input id="slider-dram" type="range" min="0" max="1" step="0.01" value="0.55"
                 oninput="updateMemSlider('dram_bw', this.value)"
                 style="accent-color:#4fd1c5">
          <span id="val-dram">0.55</span>
          <label for="slider-l1">L1 fill</label>
          <input id="slider-l1" type="range" min="0" max="1" step="0.01" value="0.45"
                 oninput="updateMemSlider('l1_fill', this.value)"
                 style="accent-color:#4fd1c5">
          <span id="val-l1">0.45</span>
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:0.78rem;color:#607d8b">
          <label for="mem-mode-select">Mode:</label>
          <select id="mem-mode-select" onchange="setMemMode(this.value)"
                  style="background:#0d1f2d;border:1px solid #1a3c47;color:#81e6d9;border-radius:4px;padding:3px 8px;font-size:0.78rem">
            <option value="idle">idle</option>
            <option value="inference" selected>inference</option>
            <option value="prefill">prefill</option>
            <option value="thinking">thinking</option>
            <option value="agents">agents</option>
            <option value="diffusion">diffusion</option>
            <option value="video">video</option>
            <option value="batch">batch</option>
            <option value="explore">explore</option>
            <option value="kernel_dispatch">kernel_dispatch</option>
          </select>
        </div>
        <p style="font-size:0.72rem;color:#3d5a66;margin-top:8px;margin-bottom:0">Values normalized 0–1 (1.0 ≈ peak BH bandwidth ~900 GB/s). Switching modes clears the override; move a slider to re-apply. All values are visual metaphors unless driven by real telemetry.</p>
      </div>
    </div>
    <div class="demo-card">
      <details>
        <summary style="color:#81e6d9;font-size:0.85rem;cursor:pointer;margin-bottom:8px">Show API</summary>
        <pre>const viz = new TensixViz(canvas, { arch: 'blackhole', showMemory: true })
viz.activate('inference')

// override with real telemetry
viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })

// partial override — only dram_bw changes; l1_fill stays on preset
viz.setMemoryStats({ dram_bw: 0.90 })</pre>
      </details>
    </div>
  </div>

  </div><!-- end page-body -->
```

- [ ] **Step 2: Add §7 JS inside the first `<script>` block**

Find the end of the theming JS section inside the first `<script>` block:
```js
    themeChipDark.activate('thinking')
    themeChipLight.activate('thinking')
    themeChipAuto.activate('thinking')
  </script>
```

Replace with:
```js
    themeChipDark.activate('thinking')
    themeChipLight.activate('thinking')
    themeChipAuto.activate('thinking')

    // ── 7. Memory visualization ──
    const memViz = new TensixViz(document.getElementById('mem-chip'), { arch: 'blackhole', showMemory: true })
    memViz.activate('inference')

    function updateMemSlider(key, val) {
      const stat = {}
      stat[key] = parseFloat(val)
      memViz.setMemoryStats(stat)
      document.getElementById(key === 'dram_bw' ? 'val-dram' : 'val-l1').textContent = parseFloat(val).toFixed(2)
    }

    function setMemMode(mode) {
      memViz.activate(mode)
    }
  </script>
```

- [ ] **Step 3: Run tests — confirm no regressions**

```bash
npm test
```
Expected: `71 passed (71)`

- [ ] **Step 4: Open `examples/index.html` in a browser and verify**

Open: `open examples/index.html`

Check:
- §7 section appears at the bottom with heading "7. Memory visualization — `showMemory: true`"
- Canvas renders with DRAM row glow, L1 fill bars, and transfer particles visible
- DRAM bandwidth slider (initial 0.55) drives glow intensity live
- L1 fill slider (initial 0.45) drives bar height live
- Mode dropdown cycles all 10 modes; switching mode changes the canvas animation and clears the override (bars/glow update to preset)
- Moving a slider after a mode change re-applies the override
- "Show API" `<details>` expands to show the code snippet
- Accuracy note text is visible below the sliders

- [ ] **Step 5: Commit**

```bash
git add examples/index.html
git commit -m "feat(examples): add §7 memory visualization section with live sliders"
```
