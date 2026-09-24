# Signal-Driven Animation Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `tensix-viz` animation mode's on-screen intensity genuinely track a live `activity` signal, and let `diffusion`/`video`/`prefill` track real structural progress when a caller has it, so the "Tensix activity" panel in `tt-bio-demo` (and any other consumer) stops looking the same regardless of whether the chip is idle or under load.

**Architecture:** Two new eased, backward-compatible setters on `TensixViz` (`setActivity`, `setProgress`) feed a shared `activityGain()` multiplier into every mode's brightness/pop-rate formula, and a shared `activePhase()` substitution into the three modes whose position is a single wall-clock sweep. `tt-bio-demo`'s `ui/chipviz.py` wires its already-computed `clock_activity()` value into `setActivity`, and threads the wire's already-parsed `frac` (previously discarded past the pipeline panel) into `setProgress` via the existing `within_stage_frac` converter.

**Tech Stack:** Vanilla JS (`tensix-viz`, vitest), Python 3 + GTK4/WebKit (`tt-bio-demo`, pytest).

**Spec:** `docs/superpowers/specs/2026-09-24-signal-driven-modes-design.md`

## Global Constraints

- `activity` defaults to `1.0` and `progress` defaults to `null` on every fresh `activate()` call — every existing caller that never invokes the new setters must render pixel-identical output to before this change.
- `activityGain(1) === 1` exactly, and `activityGain(activity)` floors at `0.12` (never fully dark) — from the spec's Section 2 table.
- Both `setActivity`/`setProgress` ease toward their target (no instant snap) at a `_dtScale`-normalized rate with an ~0.4s half-life (`1 - 0.5^(dtScale/24)`), matching the frame-rate-independence approach `idle`'s own decay already uses.
- `set_chip_stages`'s existing `{card: stage}` (bare string/`None` per value) contract must keep working unmodified — `tests/unit/test_chipviz_multichip.py` calls it that way throughout. The tuple form `{card: (stage, frac)}` is additive, not a replacement.
- `kernel_dispatch` is touched only for its `activityGain` multiplier (spec's Non-goals) — no event-driven wiring, since `tt-bio-demo` never selects this mode.
- `thinking` gets `activityGain` only, never `setProgress`/`activePhase` (spec Section 3) — its phase is a per-cell traveling wave, not a single sweep value, so there is no faithful drop-in substitution for it in this pass.
- No change to `tt-local-generator`'s vendored copy or `activity_viz.py` — out of scope for this plan.

## Review Focus

- **A caller that never calls the new setters must see identical rendering.** Every mode's formula must reduce algebraically to today's exact formula at `activity=1, progress=null` — a reviewer should be able to spot-check this by substituting the constants.
- **`clock_activity`'s near-binary real-world values (0.0 / ~1.0) must move the rendered heatmap by more than one frame's own noise floor**, since that is the specific, previously-measured failure this whole task exists to fix — not just "the number changed," but "the number changed by enough to see."
- **A `set_chip_stages` call using the old bare-string contract must not regress** — the entire `test_chipviz_multichip.py` suite exercises this shape and must stay green untouched.
- **A stage with no matching band (`within_stage_frac`'s "unrecognized stage" branch) or a non-numeric `frac` must not raise** on the event path (`_handle_event`'s outer broad `except` exists precisely because wire data is untrusted) — it should simply skip that tick's progress push.
- **A chip transitioning stage (e.g. `trunk` → `diffusion`) must not have `diffusion`'s ring jump backward** because a stale `trunk`-band `frac` briefly lingers — `set_chip_stages` must push progress computed from the *new* stage's own band, not the previous stage's, the instant `stage` changes.

---

## Task 1: `activityGain` helper and `setActivity`/`setProgress` API with easing (tensix-viz)

**Files:**
- Modify: `src/chip.js` (constructor ~line 185, `reset()` ~line 750, new prototype methods after `setMemoryStats` ~line 780, `activate()`'s `tick()` ~line 1231, static export near `TensixViz.makeParallelismScript` ~line 1340)
- Test: `tests/chip.test.js`

**Interfaces:**
- Produces: `activityGain(activity)` (module function, also exposed as `TensixViz.activityGain` for testing) returning `0.12 + 0.88 * clamp01(activity)`.
- Produces: `TensixViz.prototype.setActivity(value)` / `setProgress(value)` — clamp to `[0,1]`, ignore non-finite input, write `this._activityTarget` / `this._progressTarget`.
- Produces: instance fields `_activityTarget` (default `1`), `_activityCurrent` (default `1`), `_progressTarget` (default `null`), `_progressCurrent` (default `null`), all reset by `reset()`.
- Consumes: nothing new from other tasks (this is the foundation task).

- [ ] **Step 1: Write the failing tests for `activityGain` and the setters**

Add to `tests/chip.test.js` (new `describe` block at the end of the file, before the final closing, or as its own top-level block — follow the file's existing flat `describe('TensixViz', ...)` / `describe('TensixViz._resolveTheme', ...)` pattern):

```js
describe('activityGain', () => {
  it('returns exactly 1 at activity=1 (today\'s behavior, unchanged)', () => {
    expect(TensixViz.activityGain(1)).toBe(1)
  })

  it('floors at 0.12, never fully dark', () => {
    expect(TensixViz.activityGain(0)).toBeCloseTo(0.12, 10)
  })

  it('is linear between the floor and 1', () => {
    expect(TensixViz.activityGain(0.5)).toBeCloseTo(0.56, 10)
  })

  it('clamps out-of-range input', () => {
    expect(TensixViz.activityGain(2)).toBe(1)
    expect(TensixViz.activityGain(-1)).toBeCloseTo(0.12, 10)
  })
})

describe('setActivity / setProgress', () => {
  it('defaults to activity=1, progress=null before any call', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(viz._activityTarget).toBe(1)
    expect(viz._progressTarget).toBeNull()
  })

  it('clamps setActivity to [0,1]', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.setActivity(2)
    expect(viz._activityTarget).toBe(1)
    viz.setActivity(-1)
    expect(viz._activityTarget).toBe(0)
    viz.setActivity(0.42)
    expect(viz._activityTarget).toBeCloseTo(0.42, 10)
  })

  it('ignores non-numeric setActivity input', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.setActivity(0.7)
    viz.setActivity('busy')
    viz.setActivity(NaN)
    expect(viz._activityTarget).toBeCloseTo(0.7, 10)
  })

  it('clamps setProgress to [0,1] and ignores non-numeric input', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.setProgress(1.5)
    expect(viz._progressTarget).toBe(1)
    viz.setProgress(-0.5)
    expect(viz._progressTarget).toBe(0)
    viz.setProgress('nope')
    expect(viz._progressTarget).toBe(0)
  })

  it('reset() restores activity/progress to their defaults', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.setActivity(0.1)
    viz.setProgress(0.9)
    viz.reset()
    expect(viz._activityTarget).toBe(1)
    expect(viz._progressTarget).toBeNull()
  })

  it('activate() eases _activityCurrent toward a target set before it ticks', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.activate('idle')
    viz.setActivity(0)
    await new Promise(resolve => setTimeout(resolve, 100))
    // Started at 1 (activate()'s reset default), eased toward 0 — must have
    // moved substantially within ~6 ticks (100ms / 16ms setTimeout rAF).
    expect(viz._activityCurrent).toBeLessThan(0.9)
    expect(viz._activityCurrent).toBeGreaterThanOrEqual(0)
    viz.reset()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- chip.test.js`
Expected: FAIL — `TensixViz.activityGain is not a function`, `viz.setActivity is not a function`, `viz._activityTarget` is `undefined`, etc.

- [ ] **Step 3: Implement `activityGain`, the two setters, instance fields, and easing**

In `src/chip.js`, add near the top-level helpers (right before `// ─── TensixViz class ───` or immediately after `MEM_PRESETS`):

```js
  // ─── Activity gain ──────────────────────────────────────────────────────────
  // Shared multiplier every mode's brightness/pop-rate passes through. Floored
  // at 0.12 so a genuinely idle chip reads as "resting," not "the panel died";
  // returns exactly 1 at activity=1 so a caller that never calls setActivity()
  // sees today's exact output.
  function activityGain(activity) {
    var a = Math.max(0, Math.min(1, activity));
    return 0.12 + 0.88 * a;
  }
```

In the constructor, immediately after the existing `this._currentMode = null;` line:

```js
    this._activityTarget  = 1;    // desired activity (0..1); 1 = today's behavior
    this._activityCurrent = 1;    // eased value MODES actually read
    this._progressTarget  = null; // desired progress (0..1); null = wall-clock phase
    this._progressCurrent = null;
```

In `reset()`, immediately after the existing `this._currentMode = null;` line there:

```js
    this._activityTarget  = 1;
    this._activityCurrent = 1;
    this._progressTarget  = null;
    this._progressCurrent = null;
```

Immediately after `TensixViz.prototype.setMemoryStats = function (stats) { ... };`:

```js
  // ─── Activity / progress overrides ─────────────────────────────────────────
  // Call with live signal after activate(): setActivity() says how LOADED this
  // chip is right now (0 quiet .. 1 fully loaded) and modulates every mode's
  // brightness ceiling via activityGain(). setProgress() says how far through
  // its current structural cycle it is (a denoising step count, a refinement
  // cycle) and, for the modes whose position is a single 0..1 sweep
  // (diffusion/video/prefill), replaces the wall-clock phase with it. Both
  // default to reproducing today's exact wall-clock-only behavior when never
  // called (activity=1, progress=null), and both ease toward the value handed
  // in rather than snapping, so a once-a-second poll does not step visibly.
  // Cleared by reset() (and therefore by activate()).
  TensixViz.prototype.setActivity = function (value) {
    if (typeof value !== 'number' || !isFinite(value)) return;
    this._activityTarget = Math.max(0, Math.min(1, value));
  };

  TensixViz.prototype.setProgress = function (value) {
    if (typeof value !== 'number' || !isFinite(value)) return;
    this._progressTarget = Math.max(0, Math.min(1, value));
  };
```

In `activate()`'s `tick()` function, immediately after the existing lines that compute `_dtScale` and before `t += 0.012;`:

```js
      // Ease activity/progress toward their targets at a rate independent of
      // refresh rate (same _dtScale unit idle's own decay uses). ~0.4s half-life.
      var _ease = 1 - Math.pow(0.5, _dtScale / 24);
      self._activityCurrent += (self._activityTarget - self._activityCurrent) * _ease;
      if (self._progressTarget !== null) {
        if (self._progressCurrent === null) self._progressCurrent = self._progressTarget;
        self._progressCurrent += (self._progressTarget - self._progressCurrent) * _ease;
      } else {
        self._progressCurrent = null;
      }
```

Right before `var MODES = {` inside `activate()`, add the shared phase-substitution helper (used by Task 3, harmless if unused until then):

```js
    // Substitutes the live progress value for a mode's own wall-clock phase
    // when a caller has provided one via setProgress() — same formula, only
    // the phase source changes. Falls back to the wall-clock value untouched
    // when no live progress has been set.
    function activePhase(wallClockPhase) {
      return (self._progressCurrent !== null) ? self._progressCurrent : wallClockPhase;
    }
```

Finally, near the bottom where `TensixViz.makeParallelismScript` is attached, add:

```js
  TensixViz.activityGain = activityGain;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- chip.test.js`
Expected: PASS, all new tests plus all 86+ pre-existing tests in this file green.

- [ ] **Step 5: Run the full vitest suite to confirm no regression elsewhere**

Run: `npm test`
Expected: PASS — every existing suite (`card.test.js`, `cluster.test.js`, `idle-flicker.test.js`, `index.test.js`, `system.test.js`, `topology.test.js`) unaffected, since no mode formula changed yet in this task.

- [ ] **Step 6: Commit**

```bash
git add src/chip.js tests/chip.test.js
git commit -m "feat(chip): add setActivity/setProgress with eased, backward-compatible defaults"
```

---

## Task 2: Apply `activityGain` to every mode's brightness/pop-rate (tensix-viz)

**Files:**
- Modify: `src/chip.js` (the `MODES` table inside `activate()`, ~lines 1085-1216)
- Test: `tests/chip.test.js`

**Interfaces:**
- Consumes: `activityGain(activity)` and `self._activityCurrent` from Task 1.
- Produces: nothing new consumed by later tasks (Task 3 touches `activePhase` from Task 1 directly, independent of this task's edits).

- [ ] **Step 1: Write the failing tests**

These test the *effect* of activity on live output by driving one real tick through `activate()`, reading `_heatmap`, and comparing a low-activity run against a high-activity run for each mode that is a pure function of `(c, r)` with no internal cross-frame memory (`inference`, `diffusion`, `thinking`, `explore`, `prefill`, `video`, `batch`, `kernel_dispatch` — `idle`/`agents` are stochastic/decay-based and are covered separately below).

Add to `tests/chip.test.js`:

```js
describe('activityGain applied to mode brightness', () => {
  const DETERMINISTIC_MODES = ['inference', 'diffusion', 'thinking', 'explore',
    'prefill', 'video', 'batch', 'kernel_dispatch']

  async function peakHeat(mode, activity) {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.activate(mode)
    viz.setActivity(activity)
    // Let several ticks run so _activityCurrent eases most of the way to target.
    await new Promise(resolve => setTimeout(resolve, 300))
    const hmap = viz._heatmap
    let peak = 0
    for (const row of hmap) {
      if (!row) continue
      for (const v of row) if (typeof v === 'number' && v > peak) peak = v
    }
    viz.reset()
    return peak
  }

  DETERMINISTIC_MODES.forEach((mode) => {
    it(`${mode}: low activity renders measurably dimmer than full activity`, async () => {
      const dim = await peakHeat(mode, 0)
      const bright = await peakHeat(mode, 1)
      // activityGain(0) / activityGain(1) = 0.12/1 = 0.12, so the dim peak
      // must be well under the bright peak's ceiling — this is the exact
      // gap chipviz.py's own docstring measured as "less than frame noise"
      // before this change; asserting a comfortable margin (half) makes the
      // test robust to per-mode noise while still catching a no-op gain.
      expect(dim).toBeLessThan(bright * 0.5)
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- chip.test.js`
Expected: FAIL for every mode in `DETERMINISTIC_MODES` — `dim` currently equals `bright` (activity has no effect yet).

- [ ] **Step 3: Apply `activityGain(self._activityCurrent)` to each mode's brightness/rate terms**

In `src/chip.js`'s `MODES` object (inside `activate()`), replace each function body as follows (preserve every other line — comments, kernel_dispatch's dispatch-state bookkeeping, etc. — unchanged):

```js
      idle: function (c, r) {
        var k = (typeof _dtScale === 'number' && _dtScale > 0) ? _dtScale : 1;
        var gain  = activityGain(self._activityCurrent);
        var decay = Math.pow(0.90, k);
        var pop   = (1 - Math.pow(1 - 0.03, k)) * gain;
        return Math.min(1, prev[r][c] * decay + (Math.random() < pop ? Math.random() * 0.35 * gain : 0));
      },
      inference: function (c, r) {
        var wave = (t % 1) * W;
        return Math.max(0, 1 - Math.abs(c - wave) / 3) * 0.9 * activityGain(self._activityCurrent);
      },
      diffusion: function (c, r) {
        var cx = W / 2, cy = H / 2;
        var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        var ring = (t % 1) * Math.sqrt(cx * cx + cy * cy);
        return Math.max(0, 1 - Math.abs(dist - ring) / 2) * 0.9 * activityGain(self._activityCurrent);
      },
      agents: function (c, r) {
        var gain = activityGain(self._activityCurrent);
        return Math.min(1, prev[r][c] * 0.85 + (Math.random() < 0.06 * gain ? Math.random() * 0.8 * gain : 0));
      },
      explore: function (c, r) {
        return (Math.sin(c * 0.6 + t * Math.PI * 4) * Math.cos(r * 0.4 + t * Math.PI * 2) + 1) / 2 * 0.85 * activityGain(self._activityCurrent);
      },
      thinking: function (c, r) {
        return ((Math.sin(t * Math.PI * 0.7 + c * 0.18 + r * 0.12) + 1) / 2 * 0.4 + 0.45) * activityGain(self._activityCurrent);
      },
      prefill: function (c, r) {
        var wave = (t * 1.5 % 1) * (W + 6) - 3;
        return Math.max(0, 1 - Math.abs(c - wave) / (W * 0.5)) * 0.95 * activityGain(self._activityCurrent);
      },
      video: function (c, r) {
        var cx = W / 2, cy = H / 2;
        var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        var maxR = Math.sqrt(cx * cx + cy * cy);
        var gain = activityGain(self._activityCurrent);
        var r1   = Math.max(0, 1 - Math.abs(dist - (t          % 1) * maxR) / 1.8) * 0.9 * gain;
        var r2   = Math.max(0, 1 - Math.abs(dist - ((t + 0.5)  % 1) * maxR) / 1.8) * 0.9 * gain;
        return Math.max(r1, r2);
      },
      batch: function (c, r) {
        var speed = 0.7;
        var gain = activityGain(self._activityCurrent);
        var w1 = Math.max(0, 1 - Math.abs(c - ((t * speed)        % 1) * W) / 2) * 0.85 * gain;
        var w2 = Math.max(0, 1 - Math.abs(c - ((t * speed + 0.33) % 1) * W) / 2) * 0.85 * gain;
        var w3 = Math.max(0, 1 - Math.abs(c - ((t * speed + 0.66) % 1) * W) / 2) * 0.85 * gain;
        return Math.max(w1, w2, w3);
      },
```

And in `kernel_dispatch`'s body, the single line computing `val` changes from:

```js
          val = Math.max(val, fadeIn * fadeOut * noise * 0.88);
```

to:

```js
          val = Math.max(val, fadeIn * fadeOut * noise * 0.88 * activityGain(self._activityCurrent));
```

(Every other line of `kernel_dispatch` — the `_kd` bookkeeping, dispatch scheduling, Manhattan-distance ripple — is unchanged; only this final brightness line.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- chip.test.js`
Expected: PASS for all `DETERMINISTIC_MODES` cases, plus every pre-existing test in the file (activity defaults to `1`, so `activityGain(1) === 1` and every untouched caller's output is unchanged).

- [ ] **Step 5: Run the full vitest suite**

Run: `npm test`
Expected: PASS, no regressions in `card.test.js`/`cluster.test.js`/`system.test.js`/`topology.test.js`/`idle-flicker.test.js`/`index.test.js` (none of these call `setActivity`, so `activityGain(1) === 1` keeps their assertions valid).

- [ ] **Step 6: Commit**

```bash
git add src/chip.js tests/chip.test.js
git commit -m "feat(chip): every mode's brightness/pop-rate now scales with live activity"
```

---

## Task 3: Progress-driven phase for `diffusion`, `video`, `prefill` (tensix-viz)

**Files:**
- Modify: `src/chip.js` (the three mode functions, replacing their `t % 1`-style phase term with `activePhase(...)`)
- Test: `tests/chip.test.js`

**Interfaces:**
- Consumes: `activePhase(wallClockPhase)` from Task 1, `self._progressCurrent`/`setProgress` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

```js
describe('setProgress drives ring/sweep position directly', () => {
  it('diffusion: with progress pinned near 0, the ring sits near the center', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.activate('diffusion')
    viz.setProgress(0.02)
    await new Promise(resolve => setTimeout(resolve, 300))
    const cg = viz.chip.computeGrid
    const cx = Math.floor((cg.colStart + cg.colEnd) / 2)
    const cy = Math.floor((cg.rowStart + cg.rowEnd) / 2)
    const centerVal = viz._heatmap[cy][cx]
    // At progress≈0 the ring radius is ≈0, so the center cell (dist≈0) sits
    // near the ring and should be near its brightness ceiling; a far corner
    // should not.
    const cornerVal = viz._heatmap[cg.rowStart][cg.colStart] || 0
    expect(centerVal).toBeGreaterThan(cornerVal)
  })

  it('diffusion: pinning progress overrides wall-clock motion between ticks', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.activate('diffusion')
    viz.setProgress(0.5)
    await new Promise(resolve => setTimeout(resolve, 200))
    const first = JSON.stringify(viz._heatmap)
    await new Promise(resolve => setTimeout(resolve, 200))
    const second = JSON.stringify(viz._heatmap)
    // Wall-clock-driven diffusion would keep moving the ring every tick;
    // pinned progress (no further setProgress call, target unchanged) means
    // _progressCurrent has already converged and the ring holds still.
    expect(first).toBe(second)
    viz.reset()
  })

  it('prefill and video accept setProgress without throwing and produce a heatmap', async () => {
    for (const mode of ['prefill', 'video']) {
      const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
      viz.activate(mode)
      viz.setProgress(0.3)
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(viz._heatmap).not.toBeNull()
      viz.reset()
    }
  })

  it('thinking ignores setProgress (documented non-goal — phase stays wall-clock)', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.activate('thinking')
    viz.setProgress(0.5)
    await new Promise(resolve => setTimeout(resolve, 200))
    const first = JSON.stringify(viz._heatmap)
    await new Promise(resolve => setTimeout(resolve, 200))
    const second = JSON.stringify(viz._heatmap)
    // thinking's phase is wall-clock-only regardless of setProgress, so two
    // samples taken apart in time must differ (the wave keeps moving).
    expect(first).not.toBe(second)
    viz.reset()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- chip.test.js`
Expected: FAIL on the "overrides wall-clock motion" and "ring sits near the center" assertions (diffusion is still purely wall-clock-driven); the `thinking` test should already pass (no change needed there, confirming the non-goal is the current behavior too).

- [ ] **Step 3: Substitute `activePhase(...)` into `diffusion`, `video`, `prefill`**

In `src/chip.js`'s `MODES` object, change exactly these three functions (leave `thinking` as Task 2 left it):

```js
      diffusion: function (c, r) {
        var cx = W / 2, cy = H / 2;
        var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        var ring = activePhase(t % 1) * Math.sqrt(cx * cx + cy * cy);
        return Math.max(0, 1 - Math.abs(dist - ring) / 2) * 0.9 * activityGain(self._activityCurrent);
      },
```

```js
      prefill: function (c, r) {
        var wave = activePhase(t * 1.5 % 1) * (W + 6) - 3;
        return Math.max(0, 1 - Math.abs(c - wave) / (W * 0.5)) * 0.95 * activityGain(self._activityCurrent);
      },
```

```js
      video: function (c, r) {
        var cx = W / 2, cy = H / 2;
        var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        var maxR = Math.sqrt(cx * cx + cy * cy);
        var gain = activityGain(self._activityCurrent);
        var basePhase = t % 1;
        var r1 = Math.max(0, 1 - Math.abs(dist - activePhase(basePhase) * maxR) / 1.8) * 0.9 * gain;
        var r2 = Math.max(0, 1 - Math.abs(dist - activePhase((basePhase + 0.5) % 1) * maxR) / 1.8) * 0.9 * gain;
        return Math.max(r1, r2);
      },
```

(`video`'s two rings both call `activePhase`; when a live progress value is set, both return the same `self._progressCurrent`, so `r1`/`r2` collapse onto one ring — the accepted simplification the spec documents.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- chip.test.js`
Expected: PASS, all new tests plus everything from Tasks 1-2.

- [ ] **Step 5: Run the full vitest suite**

Run: `npm test`
Expected: PASS, no regressions anywhere.

- [ ] **Step 6: Commit**

```bash
git add src/chip.js tests/chip.test.js
git commit -m "feat(chip): diffusion/video/prefill track real progress when provided"
```

---

## Task 4: Version bump, changelog, and rebuild (tensix-viz)

**Files:**
- Modify: `package.json` (version), `CHANGELOG.md`
- Build output: `tensix-viz.js`, `tensix-viz.esm.js` (via `npm run build`)

**Interfaces:**
- Consumes: the completed, tested `src/chip.js` from Tasks 1-3.
- Produces: a versioned, built bundle for Task 5 to re-vendor into `tt-bio-demo`.

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "1.2.1"` to `"version": "1.3.0"` (minor bump — new backward-compatible API surface, no breaking change).

- [ ] **Step 2: Add a CHANGELOG entry**

Prepend to `CHANGELOG.md`, above the existing `## [1.2.1] - 2026-08-20` entry:

```markdown
## [1.3.0] - 2026-09-24

### Added

- **`setActivity(value)` and `setProgress(value)`** (`src/chip.js`). Every
  animation mode's brightness/pop-rate now scales with a live 0..1
  `activity` signal via a shared `activityGain()` multiplier (floored at
  0.12 so a resting chip never reads as dead), and `diffusion`/`video`/
  `prefill`'s ring/sweep position can be driven by real structural progress
  instead of wall-clock time via `setProgress()`. Both default to
  reproducing the exact pre-1.3.0 output when never called — no existing
  caller changes. Fixes the specific gap measured in `tt-bio-demo`'s
  `ui/chipviz.py` docstring, where feeding a chip's canvas 0.0 vs. 1.0
  activity produced pixel statistics indistinguishable from frame noise,
  because the only prior telemetry input (`setMemoryStats`) never touched
  the per-core heatmap itself.
```

- [ ] **Step 3: Rebuild the bundle**

Run: `npm run build`
Expected: `tensix-viz.js` and `tensix-viz.esm.js` regenerate with no errors.

- [ ] **Step 4: Run the full test suite once more against the rebuilt state**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md tensix-viz.js tensix-viz.esm.js
git commit -m "chore(release): bump version to 1.3.0"
```

---

## Task 5: Thread `stage_frac` through `tt-bio-demo`'s `ui/app.py` (tt-bio-demo)

**Files:**
- Modify: `ui/app.py` (`_SlotView.__slots__`/`__init__` ~line 532, the `stage`/`job_start`/`job_done`/`job_error` handling block ~line 4624, `_chip_stages()` ~line 5244)
- Test: `tests/unit/test_app_interaction.py` (or the file that already exercises `_chip_stages`/stage event handling — confirm exact filename via `grep -n "_chip_stages\|_slot_view" tests/unit/*.py` before editing)

**Interfaces:**
- Consumes: nothing from tensix-viz tasks (Python-side, independent).
- Produces: `_chip_stages()` now returns `{card: (stage, stage_frac)}` instead of `{card: stage}` — consumed by Task 6's `ChipVizPanel.set_chip_stages`.

- [ ] **Step 1: Locate the exact existing test file and write the failing test**

Run: `grep -rn "_chip_stages\b" tests/unit/*.py` to confirm which file already covers `DemoApp._chip_stages` (if none does directly, add the test alongside the nearest existing stage-handling test file — check `tests/unit/test_app_interaction.py` first).

Add a test asserting the new per-cell field and `_chip_stages()` shape:

```python
def test_chip_stages_carries_the_wire_fraction_alongside_stage(app_fixture):
    # `app_fixture` is this test module's existing DemoApp construction helper
    # (see the file's own setup for its exact name/signature) with at least
    # one card attached.
    app = app_fixture()
    app._handle_event({"kind": "job_start", "card": 0, "target_id": "t1",
                        "n_residues": 10})
    app._handle_event({"kind": "stage", "card": 0, "stage": "diffusion",
                        "frac": 0.55})
    assert app._chip_stages()[0] == ("diffusion", 0.55)


def test_stage_frac_clears_when_stage_clears(app_fixture):
    app = app_fixture()
    app._handle_event({"kind": "job_start", "card": 0, "target_id": "t1",
                        "n_residues": 10})
    app._handle_event({"kind": "stage", "card": 0, "stage": "diffusion",
                        "frac": 0.55})
    app._handle_event({"kind": "job_done", "card": 0, "target_id": "t1",
                        "wall_s": 1.0})
    assert app._chip_stages()[0] == (None, 0.0)
```

(If the existing test file uses a different fixture/helper name for constructing a `DemoApp` and driving `_handle_event` with a card attached to a slot, use that file's actual helper instead of `app_fixture` — read the file's existing stage-transition tests first and match their exact setup pattern one-for-one.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_app_interaction.py -k "chip_stages_carries or stage_frac_clears" -v`
Expected: FAIL — `_chip_stages()[0]` is currently the bare string `"diffusion"`, not a tuple.

- [ ] **Step 3: Add `stage_frac` to `_SlotView` and thread it through**

In `ui/app.py`, change `_SlotView.__slots__`:

```python
    __slots__ = ("awaiting_first_frame", "current_job_id", "current_target_id",
                 "shown_target_id", "has_structure", "ribbon_generation",
                 "pending_ribbon", "stage", "stage_frac", "shown_cif_path",
                 "pending_highlight")
```

In `_SlotView.__init__`, immediately after `self.stage = None`:

```python
        self.stage_frac = 0.0
```

In the block handling `kind in ("stage", "job_start", "job_done", "job_error")`, change:

```python
                    view.stage = (event.get("stage") if kind == "stage"
                                  else None)
```

to:

```python
                    view.stage = (event.get("stage") if kind == "stage"
                                  else None)
                    # `frac` is wire data and is coerced the same defensive
                    # way the `stage` branch below coerces it — cleared to
                    # 0.0 in lockstep with `stage` clearing to None, so a
                    # chip between folds never reports a stale progress
                    # value for a stage it is no longer in.
                    if kind == "stage":
                        try:
                            view.stage_frac = float(event.get("frac", 0.0))
                        except (TypeError, ValueError):
                            view.stage_frac = 0.0
                    else:
                        view.stage_frac = 0.0
```

And in the `elif kind == "not_ready":` branch just below (which clears every cell's `stage`), add the matching clear:

```python
            elif kind == "not_ready":
                # The daemon has stopped folding entirely -- every cell, not
                # just one.
                for view in self._slots:
                    view.stage = None
                    view.stage_frac = 0.0
```

Update `_chip_stages()`'s body and docstring return-shape line:

```python
    def _chip_stages(self):
        """`{chip index: (that chip's own current stage, its stage_frac)}`
        for every cell.

        The mapping the Tensix panel wants (ui/chipviz.py's
        `set_chip_stages`), built from the only place that knows it: each
        cell's own `_SlotView.stage`/`_SlotView.stage_frac`, set by that
        cell's `stage` events and cleared when its fold starts, ends or
        fails. A cell between folds contributes `(None, 0.0)`, which the
        panel draws as a resting chip with no progress to show.

        Keyed by CHIP, not by slot. `self.cards` is the daemon's own card
        list in the order the cells were built, and the panel's canvases are
        in `chip_dirs()` order -- the same left-to-right order the telemetry
        readouts above it use. Handing it slot indices instead would put chip
        2's fold under chip 0's thermometer on any booth whose card list does
        not happen to start at zero.
        """
        stages = {}
        for slot, view in enumerate(self._slots):
            if slot < len(self.cards):
                stages[self.cards[slot]] = (view.stage, view.stage_frac)
        return stages
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/unit/test_app_interaction.py -k "chip_stages_carries or stage_frac_clears" -v`
Expected: PASS.

- [ ] **Step 5: Run the full app-side test suite**

Run: `pytest tests/unit/ -k "app_interaction or chipviz"`
Expected: PASS. (Task 6 is what makes `ChipVizPanel.set_chip_stages` accept the new tuple shape `_chip_stages()` now produces — this task alone will make the real `_sync_chipviz()` call site pass tuples into a panel that doesn't yet expect them; confirm in this step that `_sync_chipviz`'s own broad `try/except Exception: log.exception(...)` swallows any resulting `TypeError` from the panel rather than raising, so this intermediate state is not a regression, just incomplete until Task 6 lands.)

- [ ] **Step 6: Commit**

```bash
git add ui/app.py tests/unit/test_app_interaction.py
git commit -m "feat(app): thread the wire's stage frac through to _chip_stages()"
```

---

## Task 6: `ChipVizPanel.set_chip_stages` accepts `(stage, frac)` and pushes `setProgress` (tt-bio-demo)

**Files:**
- Modify: `ui/chipviz.py` (`set_chip_stages`, new `_progress_for_chip`/`_push_progress` methods, `_push_modes`'s call site, imports)
- Test: `tests/unit/test_chipviz_multichip.py`, `tests/unit/test_chipviz.py`

**Interfaces:**
- Consumes: `within_stage_frac(stage, wire_frac)` from `protocol.events` (already used by `ui/panels.py` the same way).
- Consumes: `_chip_stages()`'s new `{card: (stage, frac)}` shape from Task 5 (also accepts the old bare-string shape — see Global Constraints).
- Produces: `ChipVizPanel._chip_stages` now stores `{index: (stage, frac, stamped_at)}` 3-tuples internally (was `{index: (stage, stamped_at)}` 2-tuples) — internal only, no other module reads this attribute directly (confirm with `grep -rn "_chip_stages\b" ui/ tests/` before editing, since the name collides with `DemoApp._chip_stages()` in `ui/app.py` — they are unrelated attributes on different classes).

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/test_chipviz_multichip.py` (alongside its existing `set_chip_stages` tests, matching that file's `ChipVizPanel(...)` construction pattern — read the file's existing fixture/helper for constructing a panel with a fake chip count before writing these):

```python
def test_bare_stage_strings_still_work(the existing helper for constructing a panel):
    panel = <construct panel with >=2 chips, same as this file's other tests>
    panel.set_chip_stages({0: "diffusion", 1: "trunk"})
    assert panel._chip_stages[0][0] == "diffusion"
    assert panel._chip_stages[1][0] == "trunk"


def test_stage_frac_tuple_is_accepted_and_stored(the existing helper):
    panel = <construct panel with >=1 chip>
    panel.set_chip_stages({0: ("diffusion", 0.55)})
    stage, frac, _ = panel._chip_stages[0]
    assert stage == "diffusion"
    assert frac == 0.55


def test_a_non_numeric_frac_is_dropped_not_raised(the existing helper):
    panel = <construct panel with >=1 chip>
    panel.set_chip_stages({0: ("diffusion", "not-a-number")})
    stage, frac, _ = panel._chip_stages[0]
    assert stage == "diffusion"
    assert frac == 0.0
```

(Replace the placeholder helper calls with this file's actual panel-construction fixture — e.g. if the file uses a `_panel(n_chips)` helper or monkeypatches `SYSFS_ROOT` per test, follow that exact pattern; do not invent a new construction path.)

Add to `tests/unit/test_chipviz.py` (a pure-function test, no panel needed):

```python
def test_progress_pushes_through_within_stage_frac():
    from protocol.events import within_stage_frac
    from ui.chipviz import _progress_from_stage_entry
    # diffusion's band is 0.15-0.95 (protocol/events.py's STAGE_BANDS); a
    # whole-fold frac of 0.55 is (0.55-0.15)/(0.95-0.15) = 0.5 within-stage.
    assert _progress_from_stage_entry(("diffusion", 0.55)) == pytest.approx(0.5)


def test_progress_is_none_for_a_chip_with_no_stage():
    from ui.chipviz import _progress_from_stage_entry
    assert _progress_from_stage_entry(None) is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/unit/test_chipviz_multichip.py tests/unit/test_chipviz.py -k "bare_stage_strings or stage_frac_tuple or non_numeric_frac or progress_pushes or progress_is_none" -v`
Expected: FAIL — `set_chip_stages` doesn't yet accept tuples, `_progress_from_stage_entry` doesn't exist yet.

- [ ] **Step 3: Implement the tuple-accepting `set_chip_stages`, `_progress_from_stage_entry`, and progress push**

In `ui/chipviz.py`, add the import near the top (with the other project-local pieces — this module already imports nothing from `protocol`, so add it alongside the stdlib imports):

```python
from protocol.events import within_stage_frac
```

Add a pure helper function near `viz_mode`/`mode_caption` (testable with no panel, no WebView):

```python
def _progress_from_stage_entry(entry):
    """`entry` is `(stage, frac)` (or `None` for "this chip has no stage") ->
    the within-stage progress fraction `setProgress` wants, or `None` when
    there is nothing to push.

    `within_stage_frac` never raises (an unrecognized stage passes `frac`
    through unchanged, per its own docstring), so this needs no try/except
    of its own -- the caller's broad guard covers a malformed `entry` itself
    (e.g. not a 2-tuple), which is wire-shaped and never this function's job
    to validate.
    """
    if entry is None:
        return None
    stage, frac = entry
    if stage is None:
        return None
    return within_stage_frac(stage, frac)
```

Replace `set_chip_stages`'s body (keep its existing docstring, extending it to mention the tuple form) as follows — the `cleaned` loop changes to accept either a bare stage or a `(stage, frac)` tuple, and the stored value grows from a `(stage, stamped_at)` 2-tuple to a `(stage, frac, stamped_at)` 3-tuple:

```python
        cleaned = {}
        for card, value in items:
            # Backward compatible: a plain caller may hand a bare stage
            # (str/None), matching this method's original contract; a
            # `(stage, frac)` tuple additionally carries real progress. Both
            # shapes are accepted per-entry so existing callers (and
            # tests/unit/test_chipviz_multichip.py, which uses the bare
            # form throughout) never have to change.
            if isinstance(value, tuple):
                if len(value) != 2:
                    log.debug("ignoring malformed chip stage tuple %r", value)
                    continue
                stage, frac = value
            else:
                stage, frac = value, 0.0
            if stage is None:
                continue
            if isinstance(card, bool):
                # `True` is an int and would land on chip 1. Nothing on the
                # wire should ever produce it, which is exactly why it is
                # worth refusing rather than silently attributing.
                continue
            try:
                frac = float(frac)
            except (TypeError, ValueError):
                frac = 0.0
            try:
                cleaned[int(card)] = (stage, frac)
            except (TypeError, ValueError):
                log.debug("ignoring unusable folding chip index %r", card)

        try:
            now = self._clock()
        except Exception:
            # A clock that raises must not cost the booth an event. The worst
            # case is that these stages never go stale, which is the same
            # failure the clock itself already represents.
            log.exception("clock failed while stamping chip stages")
            now = None

        refreshed = {}
        for index, (stage, frac) in cleaned.items():
            previous = self._chip_stages.get(index)
            # The staleness stamp moves only on a genuine STAGE change -- see
            # STAGE_STALE_AFTER_S for why re-assertion must not refresh it.
            # frac updates every call regardless, since real progress moves
            # continuously within an unchanged stage.
            if previous is not None and previous[0] == stage:
                refreshed[index] = (stage, frac, previous[2])
            else:
                refreshed[index] = (stage, frac, now)
        self._chip_stages = refreshed
        self._push_modes()
        self._push_progress()
```

Update every other reader of `self._chip_stages`'s tuple shape in this file (there are three: `tick_staleness`, `_mode_for_chip`) to unpack 3 values instead of 2 wherever they index into it. `tick_staleness`'s comprehension:

```python
        fresh = {index: entry for index, entry in self._chip_stages.items()
                 if entry[1] is None or (now - entry[1]) < STAGE_STALE_AFTER_S}
```

becomes (the staleness stamp moved from index `1` to index `2` in the 3-tuple):

```python
        fresh = {index: entry for index, entry in self._chip_stages.items()
                 if entry[2] is None or (now - entry[2]) < STAGE_STALE_AFTER_S}
```

`_mode_for_chip` already only reads `entry[0]` (the stage) via `viz_mode(self._state, entry[0])` — unchanged, since index `0` is still the stage in the 3-tuple.

Add the new `_push_progress` method immediately after `_push_modes`:

```python
    def _push_progress(self):
        """Send each canvas the real progress fraction for its own chip's
        stage, if it has one.

        Unlike `_push_modes`, this is NOT gated on anything having changed:
        real progress moves continuously within an unchanged stage (a
        diffusion chip's `frac` advances on nearly every `stage` event), so
        skipping unchanged-mode ticks here would freeze the ring at whatever
        fraction it happened to be at when the mode was last (re)selected.
        A chip with no stage, or a stage/frac combination `_progress_from_
        stage_entry` cannot resolve, is simply not pushed for this tick --
        the mode's own wall-clock fallback covers it.
        """
        for index in range(self._chip_shown):
            entry = self._chip_stages.get(index)
            progress = _progress_from_stage_entry(
                None if entry is None else (entry[0], entry[1]))
            if progress is None:
                continue
            self._eval("window.__viz&&window.__viz.setProgress(%d,%s)"
                       % (index, json.dumps(progress)))
```

- [ ] **Step 4: Wire `setActivity`/`setProgress` into `build_page_html`'s JS facade**

In `ui/chipviz.py`'s `build_page_html`, extend the `window.__viz` object literal (currently `activate`/`activateChip`/`setChipStats`) with two more facade methods, following the exact same guarded-call shape as `setChipStats`:

```python
        "setChipStats:function(i,s){var v=window.__vizChips[i];"
        "if(v){try{v.setMemoryStats(s);}catch(e){}}},"
        "setActivity:function(i,a){var v=window.__vizChips[i];"
        "if(v){try{v.setActivity(a);}catch(e){}}},"
        "setProgress:function(i,p){var v=window.__vizChips[i];"
        "if(v){try{v.setProgress(p);}catch(e){}}}};"
```

(This replaces the existing line `"setChipStats:function(i,s){var v=window.__vizChips[i];" "if(v){try{v.setMemoryStats(s);}catch(e){}}}};"` — note the closing `}};` moves from the end of `setChipStats` to the end of the new `setProgress` entry.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/unit/test_chipviz_multichip.py tests/unit/test_chipviz.py -v`
Expected: PASS — every pre-existing test in both files (which use the bare-string `set_chip_stages` form exclusively) plus every new test added in this task.

- [ ] **Step 6: Run the full `tt-bio-demo` unit suite**

Run: `pytest tests/unit/ -v` (per `pytest.ini`'s configured test paths)
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add ui/chipviz.py tests/unit/test_chipviz_multichip.py tests/unit/test_chipviz.py
git commit -m "feat(chipviz): set_chip_stages accepts real progress, pushes setProgress to the page"
```

---

## Task 7: Wire `clock_activity` into `setActivity` from `_tick` (tt-bio-demo)

**Files:**
- Modify: `ui/chipviz.py` (`_tick`)
- Test: `tests/unit/test_chipviz.py` or `test_chipviz_multichip.py` (whichever already tests `_tick`'s `_eval` calls — check both with `grep -n "_tick\b" tests/unit/test_chipviz*.py` first)

**Interfaces:**
- Consumes: `clock_activity(mhz)` (already exists, unchanged) and `self._eval` (already exists).
- Produces: nothing new consumed elsewhere — this is the final wiring task.

- [ ] **Step 1: Write the failing test**

Find the existing test(s) that assert on `_tick`'s generated `setChipStats` JS (search for `"setChipStats"` in the test files) and add a sibling assertion for `setActivity` in the same test, following its exact construction pattern (likely a panel with a monkeypatched `read_chip_clocks` or `SYSFS_ROOT`, and a fake `_eval`/`_webview` capturing calls). Example shape (adapt to the file's actual fixture):

```python
def test_tick_also_pushes_activity(monkeypatch, ...):
    panel = <this file's existing panel-construction helper>
    calls = []
    panel._eval = lambda js: calls.append(js)
    monkeypatch.setattr(chipviz_module, "read_chip_clocks", lambda: [1350])
    panel._tick()
    assert any("setActivity(0," in js for js in calls)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/unit/test_chipviz.py -k tick_also_pushes_activity -v` (adjust path to wherever Step 1 placed it)
Expected: FAIL — no `setActivity` call is emitted yet.

- [ ] **Step 3: Add the `setActivity` push to `_tick`**

In `ui/chipviz.py`'s `_tick`, immediately after the existing block that computes `dram, l1, writeback = flow_params(clock_activity(mhz), active)` and calls `self._eval(...)` for `setChipStats`, add:

```python
                self._eval(
                    "window.__viz&&window.__viz.setActivity(%d,%.3f)"
                    % (index, clock_activity(mhz)))
```

(Placed inside the existing `for index in range(self._chip_shown):` loop, after the `setChipStats` `_eval` call, reusing the same `mhz` already bound in that loop — no new sysfs read, no new computation, just one more `_eval` of a value already in hand.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/unit/test_chipviz.py -k tick_also_pushes_activity -v`
Expected: PASS.

- [ ] **Step 5: Run the full `tt-bio-demo` unit suite**

Run: `pytest tests/unit/ -v`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add ui/chipviz.py tests/unit/test_chipviz.py
git commit -m "feat(chipviz): feed clock_activity into setActivity every tick"
```

---

## Task 8: Re-vendor the built `tensix-viz` bundle into `tt-bio-demo` and re-measure the flicker/visibility claim

**Files:**
- Modify: `~/code/tt-bio-demo/ui/assets/tensix-viz/tensix-viz.js`, `~/code/tt-bio-demo/ui/assets/tensix-viz/tensix-viz.css` (copy from the built `tensix-viz` repo), `~/code/tt-bio-demo/ui/assets/tensix-viz/PROVENANCE.md`
- No test file changes in this task — `tests/unit/test_chipviz.py::test_the_tensix_viz_assets_are_vendored_in_this_repo` already exists and must keep passing against the new bytes.

**Interfaces:**
- Consumes: the built, committed `tensix-viz.js`/`tensix-viz.esm.js` and version/commit hash from Task 4.
- Produces: the final, shippable state — nothing further consumes this.

- [ ] **Step 1: Get the built bundle's source commit hash**

Run (in `~/code/tensix-viz`): `git log -1 --format=%H` (after Task 4's commit lands) and note the hash for `PROVENANCE.md`.

- [ ] **Step 2: Copy the built assets**

Run:
```bash
cp ~/code/tensix-viz/tensix-viz.js ~/code/tt-bio-demo/ui/assets/tensix-viz/tensix-viz.js
cp ~/code/tensix-viz/tensix-viz.css ~/code/tt-bio-demo/ui/assets/tensix-viz/tensix-viz.css
```

- [ ] **Step 3: Update `PROVENANCE.md`'s version/commit/date lines**

In `~/code/tt-bio-demo/ui/assets/tensix-viz/PROVENANCE.md`, update:

```markdown
- **Version:** 1.3.0
- **Commit:** `<the hash from Step 1>` (`chore(release): bump version to 1.3.0`)
```

and the `**Copied on:**` line to today's date (2026-09-24).

- [ ] **Step 4: Run `tt-bio-demo`'s full unit suite against the re-vendored assets**

Run: `pytest tests/unit/ -v`
Expected: PASS, including `test_the_tensix_viz_assets_are_vendored_in_this_repo` (which checks the files exist and are non-empty/readable, not their exact bytes — confirm this by reading that test before running, since if it pins an exact byte count or hash it needs updating here too).

- [ ] **Step 5: Re-measure the flicker/visibility claim chipviz.py's own docstring documents**

This is the task's actual bar for "fixed," per this project's own "verify the instrument" standard — not just green tests. Using the same render-to-texture pixel-comparison methodology chipviz.py's module docstring describes (render the live WebView across a run at `activity=0.0` vs. `activity=1.0` via `setActivity`, capture N frames, compare pixel statistics — the same technique the flicker measurement used), confirm the mean/variance gap between the two runs is now clearly larger than a single run's own frame-to-frame noise (the prior finding was "differed by less than the animation's own frame-to-frame noise" — this needs to no longer be true). Record the measurement (methodology, numbers, and conclusion) in `tt-bio-demo`'s own `CLAUDE.md` change log, in the same style as the existing chipviz.py measurements already recorded there.

- [ ] **Step 6: Update `ui/chipviz.py`'s module docstring**

The docstring's "What is live, and what is not (measured, not assumed)" section currently states the per-chip animation "is not visibly clock-driven" and that feeding 0.0 vs 1.0 "differed by less than the animation's own frame-to-frame noise." Update this paragraph to reflect the new measurement from Step 5 — state plainly what changed (activity now modulates the heatmap directly, not just the memory overlay) and cite the new numbers, following this file's existing house style of measured claims with numbers attached rather than adjectives.

- [ ] **Step 7: Commit**

```bash
git add ui/assets/tensix-viz/tensix-viz.js ui/assets/tensix-viz/tensix-viz.css ui/assets/tensix-viz/PROVENANCE.md ui/chipviz.py CLAUDE.md
git commit -m "chore: re-vendor tensix-viz 1.3.0, re-measure and document activity visibility"
```
