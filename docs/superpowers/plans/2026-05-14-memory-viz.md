# Memory Visualization Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in DRAM + L1 SRAM memory visualization layer to `TensixViz` that renders inside the existing canvas, driven by per-mode presets and overridable with live data via `setMemoryStats()`.

**Architecture:** Extend `src/chip.js` only — add three rendering layers (DRAM row glow, transfer particles, L1 fill bars) inside `render()`, a `MEM_PRESETS` table keyed by mode name, and a `setMemoryStats()` method. The existing theme resolver (`_resolveTheme()`) drives color selection; the existing `_particles` system is extended for memory streams. No new files, no new widget classes.

**Tech Stack:** Vanilla JS (ES module), HTML5 Canvas, Vitest for tests, node build.js for bundle.

---

## File Map

| File | Change |
|------|--------|
| `src/chip.js` | All changes: `MEM_COLORS`, `MEM_PRESETS`, `showMemory` constructor option, `_memOverride` state, `setMemoryStats()`, `_drawMemoryLayer()`, call in `render()`, reset in `reset()` and `activate()` |
| `tensix-viz.js` / `tensix-viz.esm.js` | Rebuilt by `npm run build` — no manual edits |
| `scripts/capture-gifs.mjs` | Add `memory` GIF spec |
| `README.md` | Add memory behavior column to animation modes table |
| `tests/chip.test.js` | New `describe('TensixViz memory layer')` block |

---

## Context: chip.js structure you must know

`src/chip.js` is a single-file ES module (~1076 lines). Key sections:
- Lines 1–44: `CHIPS` topology definitions (col/row grid, `computeGrid` bounds)
- Lines 46–115: `THEME_DARK` and `THEME_LIGHT` color constants
- Lines 118–164: `TensixViz` constructor — sets `this.canvas`, `this.arch`, `this.chip`, `this._particles`, etc.
- Lines 196–238: `render()` — draws background, cells, heatmap, highlights, labels, particles, NOC lines
- Lines 354–372: `_drawParticle(p)` — draws a particle with halo + solid core
- Lines 487–499: `reset()` — clears all state, calls `render()`
- Lines 738–925: `activate(mode)` — the continuous RAF animation loop; sets `self._heatmap` each frame and calls `self.render()`

The `activate()` function creates a local `_kd` state object for `kernel_dispatch` mode. The memory layer needs its own per-tick state (envelope phase, particle spawn timing) that also lives in the `activate()` closure.

---

## Task 1: Add `MEM_COLORS` and `MEM_PRESETS` constants

**Files:**
- Modify: `src/chip.js` — add constants after `THEME_LIGHT` (after line 115)
- Test: `tests/chip.test.js` — smoke test (construction with `showMemory: true`)

- [ ] **Step 1: Write the failing test**

Add a new `describe` block at the bottom of `tests/chip.test.js`:

```js
describe('TensixViz memory layer', () => {
  function makeCanvas() {
    const c = document.createElement('canvas')
    c.width = 340; c.height = 240
    return c
  }

  it('constructs with showMemory: true without throwing', () => {
    expect(() => new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "memory layer"
```

Expected: FAIL — `showMemory` option is accepted but no rendering guard exists yet (test actually passes construction, but later tests will fail). At this point the test passes trivially since the constructor ignores unknown options. Move on.

- [ ] **Step 3: Add `MEM_COLORS` and `MEM_PRESETS` in `src/chip.js`**

Insert the following block immediately after the closing `};` of `THEME_LIGHT` (after line 115, before the `// ─── TensixViz class` comment):

```js
  // ─── Memory visualization colours ──────────────────────────────────────────
  // Used by _drawMemoryLayer() when showMemory: true.
  // Two palettes mirror THEME_DARK / THEME_LIGHT; color entries are [r, g, b]
  // arrays so the caller can compose rgba() strings with a variable alpha.
  const MEM_COLORS = {
    dark: {
      dram:  [  0, 210, 190],   // bright teal — DRAM row glow
      l1:    [255, 180,  50],   // warm amber  — L1 fill bar
      load:  [  0, 210, 190],   // teal        — DRAM→L1 read particles
      burst: [255, 200,  80],   // gold        — prefetch / burst load
      write: [220,  80, 160],   // vivid pink  — L1→DRAM writeback particles
    },
    light: {
      dram:  [  0, 140, 130],   // deeper teal
      l1:    [160,  80,  10],   // darker amber
      load:  [  0, 140, 130],
      burst: [190, 130,   0],   // darker gold
      write: [180,  40, 120],   // deeper rose
    },
  };

  // ─── Memory signal presets (per animation mode) ─────────────────────────────
  // Fields:
  //   dram_bw   0–1  DRAM row glow intensity + read particle density
  //   l1_fill   0–1  L1 fill bar height (fraction of cell height)
  //   burst     bool periodic burst envelope (true) vs. gentle steady breath (false)
  //   burstHz   num  bursts per second; only used when burst: true
  //              'kd' means burst is event-driven by kernel_dispatch _kd state
  //   writeback 0–1  writeback particle density (L1→DRAM direction)
  //   loadColor str  'load' | 'burst'  dominant read particle color key in MEM_COLORS
  const MEM_PRESETS = {
    idle:            { dram_bw: 0.05, l1_fill: 0.02, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    inference:       { dram_bw: 0.55, l1_fill: 0.45, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    prefill:         { dram_bw: 0.90, l1_fill: 0.85, burst: true,  burstHz: 0.5, writeback: 0.20, loadColor: 'burst' },
    thinking:        { dram_bw: 0.12, l1_fill: 0.92, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    agents:          { dram_bw: 0.45, l1_fill: 0.40, burst: true,  burstHz: 0.8, writeback: 0,    loadColor: 'load'  },
    diffusion:       { dram_bw: 0.65, l1_fill: 0.60, burst: true,  burstHz: 1.2, writeback: 0,    loadColor: 'load'  },
    video:           { dram_bw: 0.70, l1_fill: 0.65, burst: true,  burstHz: 1.6, writeback: 0,    loadColor: 'load'  },
    batch:           { dram_bw: 0.80, l1_fill: 0.60, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    explore:         { dram_bw: 0.30, l1_fill: 0.35, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    kernel_dispatch: { dram_bw: 0.15, l1_fill: 0.55, burst: true,  burstHz: 'kd', writeback: 0.50, loadColor: 'burst' },
  };
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: 59/59 pass (no regressions; new test passes).

- [ ] **Step 5: Commit**

```bash
git add src/chip.js tests/chip.test.js
git commit -m "feat(memory-viz): add MEM_COLORS and MEM_PRESETS constants"
```

---

## Task 2: Add `showMemory` constructor option and `setMemoryStats()` method

**Files:**
- Modify: `src/chip.js` — constructor (~line 118) and add `setMemoryStats` prototype method
- Test: `tests/chip.test.js` — `setMemoryStats()` behavior tests

- [ ] **Step 1: Write the failing tests**

Add to the `describe('TensixViz memory layer')` block in `tests/chip.test.js`:

```js
  it('setMemoryStats() stores override values', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
    expect(viz._memOverride.dram_bw).toBe(0.75)
    expect(viz._memOverride.l1_fill).toBe(0.60)
  })

  it('setMemoryStats() supports partial override (only dram_bw)', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.80 })
    expect(viz._memOverride.dram_bw).toBe(0.80)
    expect(viz._memOverride.l1_fill).toBeUndefined()
  })

  it('reset() clears _memOverride', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
    viz.reset()
    expect(viz._memOverride).toBeNull()
  })

  it('activate() clears _memOverride', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
    viz.activate('inference')
    expect(viz._memOverride).toBeNull()
    viz.reset()
  })

  it('showMemory defaults to false — _showMemory is false when omitted', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(viz._showMemory).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|_memOverride|_showMemory"
```

Expected: several FAIL lines — `_memOverride` and `_showMemory` do not exist yet.

- [ ] **Step 3: Add `_showMemory` and `_memOverride` to the constructor**

In `src/chip.js`, find the constructor body (starts at line 118). After the line `this._loop = false;` (around line 139), add:

```js
    this._showMemory = !!(opts.showMemory);  // true → render memory layer
    this._memOverride = null;                // set by setMemoryStats(); null = use preset
```

- [ ] **Step 4: Add `setMemoryStats()` prototype method**

Add the following immediately after `TensixViz.prototype.reset` (after line 499):

```js
  // ─── Memory stats override ─────────────────────────────────────────────────
  // Call with live bandwidth/fill data to override the simulation preset.
  // Accepts a partial object — only provided keys are overridden.
  // Cleared by reset() and activate().
  TensixViz.prototype.setMemoryStats = function (stats) {
    if (!stats || typeof stats !== 'object') return;
    this._memOverride = {};
    if (typeof stats.dram_bw === 'number') this._memOverride.dram_bw = Math.max(0, Math.min(1, stats.dram_bw));
    if (typeof stats.l1_fill === 'number') this._memOverride.l1_fill = Math.max(0, Math.min(1, stats.l1_fill));
  };
```

- [ ] **Step 5: Clear `_memOverride` in `reset()`**

Find `TensixViz.prototype.reset` (around line 487). Inside it, after the line `this._floatLabelData = null;`, add:

```js
    this._memOverride = null;
```

- [ ] **Step 6: Clear `_memOverride` at the top of `activate()`**

Find `TensixViz.prototype.activate` (around line 738). It begins with `this.reset();`. Since `reset()` now clears `_memOverride`, this is already handled — no change needed.

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: 64/64 pass (59 existing + 5 new).

- [ ] **Step 8: Commit**

```bash
git add src/chip.js tests/chip.test.js
git commit -m "feat(memory-viz): add showMemory option, _memOverride state, setMemoryStats()"
```

---

## Task 3: Add `_drawMemoryLayer()` and hook it into `render()`

This is the largest task — it implements all three visual layers.

**Files:**
- Modify: `src/chip.js` — add `_drawMemoryLayer()` prototype method, call it from `render()`, add memory RAF state in `activate()`
- Test: `tests/chip.test.js` — verify memory layer does not throw during render

- [ ] **Step 1: Write the failing test**

Add to `describe('TensixViz memory layer')` in `tests/chip.test.js`:

```js
  it('render() does not throw with showMemory: true and no active mode', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    expect(() => viz.render()).not.toThrow()
  })

  it('render() does not throw with showMemory: true after activate()', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.activate('inference')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(() => viz.render()).not.toThrow()
    viz.reset()
  })

  it('render() does not throw with showMemory: true and setMemoryStats() override', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
    expect(() => viz.render()).not.toThrow()
  })
```

- [ ] **Step 2: Run tests to verify they fail or pass trivially**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "memory layer"
```

The render tests will pass trivially (render exists), but the internal memory drawing is absent. That's fine — the tests assert no-throw, and the implementation below will be visible via the GIF.

- [ ] **Step 3: Add memory state to the `activate()` closure**

In `src/chip.js`, find the `activate()` function (around line 738). Immediately after the `var _kd = ...` line, add:

```js
    // ── Memory layer animation state ─────────────────────────────────────────
    // Used by _drawMemoryLayer() to drive smooth per-frame envelopes.
    var _mem = {
      phase:       0,        // continuously incrementing phase counter (radians/π)
      burstPhase:  0,        // phase within a single burst cycle (0–1)
      kdGlow:      0,        // current DRAM glow for kernel_dispatch (decays per frame)
    };
```

- [ ] **Step 4: Advance `_mem` each frame in `activate()`'s tick function**

In `src/chip.js`, inside the `tick()` function within `activate()` (the inner `function tick()` around line 899), find the line `t += 0.012;` and add the following after it:

```js
      // Advance memory animation state
      _mem.phase += 0.012;
      if (self._showMemory) {
        var preset = MEM_PRESETS[mode] || MEM_PRESETS.idle;
        if (preset.burst && preset.burstHz !== 'kd') {
          _mem.burstPhase = (_mem.burstPhase + preset.burstHz * 0.012) % 1;
        }
        if (preset.burstHz === 'kd') {
          // kernel_dispatch: DRAM glow spikes when a new kernel is dispatched,
          // then decays. _kd.list changed above; use list length as a proxy.
          var kdActive = _kd.list.length > 0 ? 1 : 0;
          _mem.kdGlow = _mem.kdGlow * 0.92 + kdActive * 0.08;
        }
        self._memPhase = _mem;   // expose to _drawMemoryLayer via instance
      }
```

- [ ] **Step 5: Add `_drawMemoryLayer()` prototype method**

Add the following method to `src/chip.js` immediately after `TensixViz.prototype._drawNocLines` (after line 310):

```js
  // ─── Memory visualization layer ────────────────────────────────────────────
  // Renders three sub-layers on top of the chip grid when this._showMemory is true:
  //   1. DRAM row glow  — alpha-tinted overlay on dram-type cells
  //   2. Transfer particles — read (DRAM→L1) and writeback (L1→DRAM) streams
  //   3. L1 fill bars  — thin bar at bottom of each tensix compute cell
  //
  // Visual values come from MEM_PRESETS[currentMode] unless _memOverride is set.
  TensixViz.prototype._drawMemoryLayer = function () {
    if (!this._showMemory) return;

    var ctx  = this.ctx;
    var chip = this.chip;
    var cg   = chip.computeGrid;
    var T    = this._theme;
    var isDark = (T === THEME_DARK ||
                  (T.bg && T.bg === THEME_DARK.bg));  // true for dark, false for light
    var mc   = isDark ? MEM_COLORS.dark : MEM_COLORS.light;

    // ── Resolve effective dram_bw and l1_fill ─────────────────────────────────
    // Start from the current mode's preset, then apply any live override.
    var mode   = this._currentMode || 'idle';
    var preset = MEM_PRESETS[mode] || MEM_PRESETS.idle;
    var mem    = this._memPhase || { phase: 0, burstPhase: 0, kdGlow: 0 };

    // Envelope: burst modes pulse on a sin envelope; steady modes use a gentle breath.
    var env;
    if (preset.burstHz === 'kd') {
      // kernel_dispatch: glow follows dispatch events
      env = 0.15 + mem.kdGlow * 0.75;
    } else if (preset.burst) {
      // Burst: sharp peak once per burst cycle (raised cosine)
      env = Math.max(0, Math.cos(mem.burstPhase * Math.PI * 2)) * 0.5 + 0.5;
    } else {
      // Steady breath: ±12% oscillation around base
      env = 1.0 + 0.12 * Math.sin(mem.phase * Math.PI * 2);
    }

    var dramBw  = this._memOverride && this._memOverride.dram_bw !== undefined
                  ? this._memOverride.dram_bw : preset.dram_bw;
    var l1Fill  = this._memOverride && this._memOverride.l1_fill !== undefined
                  ? this._memOverride.l1_fill : preset.l1_fill;

    // ── 1. DRAM row glow ──────────────────────────────────────────────────────
    var dramAlpha = Math.min(1, dramBw * env * 0.65);
    if (dramAlpha > 0.005) {
      var dc = mc.dram;
      ctx.save();
      ctx.globalAlpha = dramAlpha;
      ctx.fillStyle = 'rgb(' + dc[0] + ',' + dc[1] + ',' + dc[2] + ')';
      for (var row = 0; row < chip.rows; row++) {
        for (var col = 0; col < chip.cols; col++) {
          if (chip.coreType(col, row) === 'dram') {
            var r = this._cellRect(col, row);
            this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    // ── 2. Transfer particles — spawn new ones this frame ────────────────────
    // Spawn rate: proportional to dramBw. Target: random compute cell.
    // Skip spawning if in a no-render path (no _heatmap yet means activate() hasn't ticked).
    if (dramBw > 0.05 && this._heatmap) {
      var spawnChance = dramBw * env * 0.18;   // max ~0.18 new particles per frame
      if (Math.random() < spawnChance) {
        var isWriteback = preset.writeback > 0 && Math.random() < preset.writeback;
        var colorKey    = isWriteback ? 'write' : (preset.loadColor || 'load');
        var pColor      = mc[colorKey];
        var pColorStr   = 'rgb(' + pColor[0] + ',' + pColor[1] + ',' + pColor[2] + ')';

        // Pick a DRAM row cell as origin
        var dramCells = [];
        for (var row = 0; row < chip.rows; row++) {
          for (var col = 0; col < chip.cols; col++) {
            if (chip.coreType(col, row) === 'dram') dramCells.push([col, row]);
          }
        }
        var origin = dramCells[Math.floor(Math.random() * dramCells.length)];
        var oCenter = this._cellCenter(origin[0], origin[1]);

        // Pick a random compute cell as destination
        var destCol = cg.colStart + Math.floor(Math.random() * (cg.colEnd - cg.colStart + 1));
        var destRow = cg.rowStart + Math.floor(Math.random() * (cg.rowEnd - cg.rowStart + 1));
        var dCenter = this._cellCenter(destCol, destRow);

        // Spawn particle — travels from DRAM to compute (or reverse for writeback)
        var from = isWriteback ? dCenter : oCenter;
        var to   = isWriteback ? oCenter : dCenter;

        this._particles.push({
          x:     from.x,
          y:     from.y,
          toX:   to.x,
          toY:   to.y,
          color: pColorStr,
          radius: Math.max(2, this._cellW * 0.12),
          progress: 0,
          speed:    0.035 + Math.random() * 0.025,   // 0.035–0.06 progress per frame
          _isMem: true,   // flag so reset() can clean these up
        });
      }
    }

    // ── Advance and draw memory particles ─────────────────────────────────────
    // Advance progress and remove completed particles.
    for (var i = this._particles.length - 1; i >= 0; i--) {
      var p = this._particles[i];
      if (!p._isMem) continue;
      p.progress = Math.min(1, p.progress + p.speed);
      p.x = p.toX === undefined ? p.x : p.x + (p.toX - p.x) * p.speed / (1 - p.progress + p.speed);
      p.y = p.toY === undefined ? p.y : p.y + (p.toY - p.y) * p.speed / (1 - p.progress + p.speed);
      if (p.progress >= 1) {
        this._particles.splice(i, 1);
      }
    }

    // ── 3. L1 fill bars ───────────────────────────────────────────────────────
    if (l1Fill > 0.01) {
      var lc = mc.l1;
      ctx.save();
      ctx.fillStyle = 'rgb(' + lc[0] + ',' + lc[1] + ',' + lc[2] + ')';
      for (var row = cg.rowStart; row <= cg.rowEnd; row++) {
        for (var col = cg.colStart; col <= cg.colEnd; col++) {
          if (chip.coreType(col, row) !== 'tensix') continue;
          var r = this._cellRect(col, row);
          // Per-cell noise: stable variation using sin of coordinates
          var noise = 1 + 0.15 * Math.sin(col * 3.7 + row * 2.9 + mem.phase * Math.PI);
          var fillH = Math.min(r.h * 0.9, r.h * l1Fill * noise);
          var barW  = r.w * 0.70;
          var barX  = r.x + (r.w - barW) / 2;
          var barY  = r.y + r.h - fillH;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(barX, barY, barW, fillH);
        }
      }
      ctx.restore();
    }
  };
```

- [ ] **Step 6: Set `this._currentMode` in `activate()` so `_drawMemoryLayer` knows the active mode**

In `src/chip.js`, inside `TensixViz.prototype.activate` (around line 738), immediately after the line `this.reset();` and before `opts = opts || {};`, add:

```js
    this._currentMode = mode;
```

Also add `this._currentMode = null;` to the constructor (after `this._showMemory` line added in Task 2):

```js
    this._currentMode = null;                // set by activate(); used by _drawMemoryLayer
```

And clear it in `reset()` alongside `_memOverride`:

```js
    this._currentMode = null;
```

- [ ] **Step 7: Call `_drawMemoryLayer()` from `render()`**

In `src/chip.js`, find the `render()` method (around line 197). After the line `this._particles.forEach(p => this._drawParticle(p));` and before `this._drawNocLines();`, add:

```js
    // Memory layer (opt-in, rendered above particles but below NOC lines)
    this._drawMemoryLayer();
```

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Expected: 67/67 pass.

- [ ] **Step 9: Commit**

```bash
git add src/chip.js tests/chip.test.js
git commit -m "feat(memory-viz): implement _drawMemoryLayer() with DRAM glow, particles, L1 bars"
```

---

## Task 4: Fix particle advancement in `_drawMemoryLayer()`

The particle advancement logic in Task 3 Step 5 has a subtle bug: the position update formula `p.x = ... * p.speed / (1 - p.progress + p.speed)` diverges as `progress → 1`. Replace it with a clean lerp.

**Files:**
- Modify: `src/chip.js` — fix particle position update in `_drawMemoryLayer()`
- Test: `tests/chip.test.js` — verify particles complete and are removed

- [ ] **Step 1: Write the failing test**

Add to `describe('TensixViz memory layer')`:

```js
  it('memory particles are removed after they complete', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    // Manually inject a nearly-complete memory particle
    viz._heatmap = { 1: { 1: 0.5 } }   // fake heatmap so spawn guard passes
    viz._particles.push({
      x: 10, y: 10, toX: 50, toY: 50,
      color: 'rgb(0,210,190)', radius: 2,
      progress: 0.98, speed: 0.05, _isMem: true,
    })
    viz._drawMemoryLayer()
    // After one call, progress >= 1 → particle should be removed
    const memParticles = viz._particles.filter(p => p._isMem)
    expect(memParticles.length).toBe(0)
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "memory particles"
```

Expected: FAIL (or intermittent pass due to the bad formula).

- [ ] **Step 3: Replace the particle advancement block in `_drawMemoryLayer()`**

Find the `// ── Advance and draw memory particles` block (in the method added in Task 3). Replace the entire block (from that comment to the closing `}`) with:

```js
    // ── Advance memory particles and remove completed ones ────────────────────
    for (var i = this._particles.length - 1; i >= 0; i--) {
      var p = this._particles[i];
      if (!p._isMem) continue;
      p.progress = Math.min(1, p.progress + p.speed);
      // Linear interpolation from spawn point to destination
      var startX = p.toX - (p.toX - p.x) / (p.progress > 0 ? p.progress : 1) * p.progress;
      var startY = p.toY - (p.toY - p.y) / (p.progress > 0 ? p.progress : 1) * p.progress;
      p.x = p.startX !== undefined ? p.startX + (p.toX - p.startX) * p.progress : p.x;
      p.y = p.startY !== undefined ? p.startY + (p.toY - p.startY) * p.progress : p.y;
      if (p.progress >= 1) {
        this._particles.splice(i, 1);
      }
    }
```

Wait — the lerp requires storing the start position. Let's fix the spawn code in `_drawMemoryLayer()` to save `startX`/`startY` at spawn time, and simplify the advancement. Replace the particle spawn `push` call (in Step 5 of Task 3) with:

```js
        this._particles.push({
          x:      from.x,
          y:      from.y,
          startX: from.x,
          startY: from.y,
          toX:    to.x,
          toY:    to.y,
          color:  pColorStr,
          radius: Math.max(2, this._cellW * 0.12),
          progress: 0,
          speed:    0.035 + Math.random() * 0.025,
          _isMem: true,
        });
```

And replace the particle advancement block with:

```js
    // ── Advance memory particles and remove completed ones ────────────────────
    for (var i = this._particles.length - 1; i >= 0; i--) {
      var p = this._particles[i];
      if (!p._isMem) continue;
      p.progress = Math.min(1, p.progress + p.speed);
      p.x = p.startX + (p.toX - p.startX) * p.progress;
      p.y = p.startY + (p.toY - p.startY) * p.progress;
      if (p.progress >= 1) {
        this._particles.splice(i, 1);
      }
    }
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: 68/68 pass.

- [ ] **Step 5: Commit**

```bash
git add src/chip.js tests/chip.test.js
git commit -m "fix(memory-viz): use startX/startY lerp for memory particle advancement"
```

---

## Task 5: Build bundle and add `memory` GIF

**Files:**
- Modify: `scripts/capture-gifs.mjs` — add `memory` spec
- Run: `npm run build`, then `node scripts/capture-gifs.mjs memory`

- [ ] **Step 1: Rebuild the bundle**

```bash
npm run build
```

Expected: `tensix-viz.js` and `tensix-viz.esm.js` updated, no errors.

- [ ] **Step 2: Add the `memory` GIF spec to `scripts/capture-gifs.mjs`**

In `capture-gifs.mjs`, find the `GIFS` array. Add the following entry after the `kernel` entry:

```js
  {
    name:     'memory',
    // BH chip in inference mode with memory layer — shows DRAM glow + particle streams + L1 bars
    params:   { type: 'chip', arch: 'blackhole', mode: 'inference', showMemory: 'true' },
    fps:      12,
    seconds:  4,
    warmupMs: 800,
    maxWidth: 340,
  },
```

- [ ] **Step 3: Update `scripts/capture.html` to forward `showMemory` param**

In `scripts/capture.html`, find line 39 inside the `if (type === 'chip')` block:

```js
      new TensixViz(canvas, { arch }).activate(mode)
```

Replace it with:

```js
      new TensixViz(canvas, { arch, showMemory: params.get('showMemory') === 'true' }).activate(mode)
```

- [ ] **Step 4: Generate the memory GIF**

```bash
node scripts/capture-gifs.mjs memory
```

Expected output ends with:
```
   ✓  NNN KB  →  docs/assets/memory.gif
✓  All GIFs written to docs/assets/
```

Open `docs/assets/memory.gif` in a browser to verify DRAM rows glow teal, particles stream from DRAM rows toward compute cells, and amber L1 bars appear inside tensix cells.

- [ ] **Step 5: Commit**

```bash
git add scripts/capture-gifs.mjs scripts/capture.html tensix-viz.js tensix-viz.esm.js docs/assets/memory.gif
git commit -m "feat(memory-viz): build bundle, add memory GIF capture spec"
```

---

## Task 6: Update README

**Files:**
- Modify: `README.md` — add memory behavior column to animation modes table, add `showMemory` to API section, reference `memory.gif` in preview

- [ ] **Step 1: Add memory behavior column to the animation modes table**

In `README.md`, find the `### Animation modes` section. The table currently has columns: `Mode | Pattern | Represents | Hardware reality`. Add a fifth column `DRAM signature`:

Replace the table header line:
```markdown
| Mode | Pattern | Represents | Hardware reality |
|------|---------|------------|-----------------|
```

With:
```markdown
| Mode | Pattern | Represents | Hardware reality | DRAM signature (`showMemory`) |
|------|---------|------------|-----------------|-------------------------------|
```

Then for each mode row, append the DRAM signature:

| Mode | Append to row |
|------|--------------|
| `idle` | `0.05 — near-silent` |
| `inference` | `0.55 — steady reads (KV cache)` |
| `diffusion` | `0.65 — periodic bursts per denoising step` |
| `agents` | `0.45 — irregular KV cache bursts` |
| `explore` | `0.30 — moderate steady` |
| `thinking` | `0.12 — nearly dark (weights in L1)` |
| `prefill` | `0.90 — one large burst then drops` |
| `video` | `0.70 — two phase-offset burst channels` |
| `batch` | `0.80 — broad sustained multi-sequence` |
| `kernel_dispatch` | `event-driven spike at dispatch + 0.50 writeback` |

- [ ] **Step 2: Add `showMemory` to the TensixViz API section**

In `README.md`, find the `### TensixViz — single chip` section. Update the constructor example:

```js
const viz = new TensixViz(canvas, { arch: 'blackhole' | 'wormhole', showMemory: true })
viz.activate('inference')
// Override with live telemetry data
viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
```

- [ ] **Step 3: Run all tests and build to verify nothing broke**

```bash
npm test && npm run build
```

Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add memory visualization to README (DRAM signatures, showMemory API)"
```

---

## Self-Review Checklist (for implementer)

After all tasks are complete, verify:

- [ ] `npm test` passes with no failures
- [ ] `npm run build` produces updated `tensix-viz.js` and `tensix-viz.esm.js`
- [ ] `docs/assets/memory.gif` exists and visually shows DRAM glow + particles + L1 bars
- [ ] `setMemoryStats({ dram_bw: 0 })` results in no DRAM glow (alpha below 0.005 threshold)
- [ ] `setMemoryStats({ dram_bw: 1 })` results in fully bright DRAM glow
- [ ] `viz.reset()` followed by `viz.render()` shows no memory layer (cleared state)
- [ ] `showMemory: false` (default) — existing widgets render identically to before this feature
- [ ] Light mode (`tv-light` ancestor) uses the `MEM_COLORS.light` palette
