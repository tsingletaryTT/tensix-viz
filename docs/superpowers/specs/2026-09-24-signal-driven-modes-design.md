# Signal-driven animation modes

Date: 2026-09-24
Status: approved (design), pending implementation

## Problem

`tensix-viz`'s per-core grid animation (`TensixViz.activate(mode)`, `chip.js`'s
`MODES` table) is used by `tt-bio-demo` and `tt-local-generator` to *show* real
Tenstorrent hardware working. Every mode function computes each cell's
brightness purely from elapsed time (`t`). The only real-telemetry input that
exists today, `setMemoryStats({dram_bw, l1_fill, writeback})`, drives a
separate overlay (DRAM row glow, L1 fill bars, transfer particles) layered on
top of the grid — it never touches the per-core heatmap itself, which is what
the eye actually reads as "is this chip working."

`tt-bio-demo/ui/chipviz.py`'s own module docstring already measured this
precisely: feeding a chip's canvas an activity of 0.0 vs. 1.0 produced pixel
statistics that differed by less than the animation's own frame-to-frame
noise. The result: the animation looks the same regardless of what the
hardware is actually doing — "over-simulated," in the user's words.

Separately, `tt-bio-demo`'s wire protocol already carries a real per-chip
progress signal that is currently discarded: a `stage` event's `frac` field
(whole-fold fraction; see `protocol/events.py`'s `STAGE_BANDS` and
`within_stage_frac`) is derived from tt-bio's actual `(step, total)` counts
for the `trunk` (10 refinement cycles) and `diffusion` (200 denoising steps)
stages. `ui/app.py` already parses `frac` off the wire (for the pipeline
panel), but `ChipVizPanel.set_chip_stages` never receives it — only the stage
*name* crosses into the animation, so `diffusion`'s ring position is a
free-running clock, not the fold's real denoising progress.

## Goal

Make every `tensix-viz` mode's on-screen *intensity* genuinely track a live
activity signal, and make the two structurally-progressive modes
(`diffusion`, and by the same mechanism `thinking`/`video`/`prefill`) track
real progress when a caller has it — without changing the modes' visual
identity (diffusion is still a ring, thinking is still a wave) and without
breaking any existing caller that never opts in.

## Non-goals

- Per-core real telemetry (no current caller has it; would be over-built —
  see the design conversation's Approach B).
- Touching `tt-local-generator`'s copy of the library or its
  `activity_viz.py` caller. It benefits automatically once it re-vendors a
  new `tensix-viz` release, but that re-vendor is not part of this work.
- Changing `kernel_dispatch`'s dispatch-event simulation. `tt-bio-demo` never
  selects this mode (`_MODE_BY_STAGE` has no row that maps to it) and no
  caller has real kernel-launch telemetry to feed it; touching it would fix
  nothing anyone can see.

## Design

### 1. New `TensixViz` API (`src/chip.js`)

Two new setters, parallel to the existing `setMemoryStats`:

```js
viz.setActivity(value);   // 0..1 — how "loaded" this chip is right now
viz.setProgress(value);   // 0..1 — how far through its current structural
                           // cycle it is (denoising step, refinement cycle)
```

Both:
- Clamp to `[0, 1]`; a non-number is ignored (same contract as
  `setMemoryStats`'s per-field validation).
- Are cleared by `reset()` (and therefore by `activate()`), matching
  `_memOverride`'s lifecycle — callers call `activate(mode)` once, then
  `setActivity`/`setProgress`/`setMemoryStats` per tick, exactly the pattern
  `chipviz.py` already uses for memory stats.
- Default to a value that reproduces **today's exact visual** when never
  called: `activity` defaults to `1.0` (full intensity — current behavior),
  `progress` defaults to `null`, meaning "use the wall-clock phase" (current
  behavior). No existing demo, example, or test that never calls these new
  setters changes by a single pixel.
- Are **eased**, not snapped. Each stores a `_target` and a `_current`; every
  frame, `_current` moves toward `_target` at a rate normalized by
  `_dtScale` (the same frame-rate-independence factor `idle`'s decay already
  uses), so a once-per-second poll (chipviz.py's `POLL_INTERVAL_MS`) does not
  produce a visible step in the animation. Approximate half-life: ~400ms at
  60fps (`rate = 1 - 0.5^(dtScale/24)`, i.e. `pow(0.5, 1/24)` per 60Hz frame).

### 2. Per-mode modulation

A single shared gain function:

```js
function activityGain(activity) {
  return 0.12 + 0.88 * activity;
}
```

The floor (0.12) is deliberate: a chip reporting true zero activity should
read as "resting," not "the panel died." (This mirrors `flow_params`'s own
floor-when-active reasoning in `chipviz.py`, applied here to the base
animation instead of only the memory overlay.) At `activity = 1` (the
default), `activityGain` returns `1.0` exactly, so unmodified callers see
identical output to today.

Applied per mode (`_current` activity read once per frame, not per cell):

| Mode | Current formula (brightness/rate) | Change |
|---|---|---|
| `idle` | pop probability `0.03`, magnitude cap `0.35` | both `× gain` |
| `agents` | pop probability `0.06`, magnitude cap `0.8` | both `× gain` |
| `thinking` | wave amplitude `0.4`, floor `0.45` | both `× gain` |
| `inference` | brightness `0.9` | `× gain` |
| `prefill` | brightness `0.95` | `× gain` |
| `diffusion` | brightness `0.9` | `× gain` |
| `video` | brightness `0.9` (×2 rings) | `× gain` |
| `batch` | brightness `0.85` (×3 waves) | `× gain` |
| `explore` | amplitude `0.85` | `× gain` |
| `kernel_dispatch` | brightness `0.88` | `× gain` (only place this mode changes — see Non-goals) |

Ring/wave *speed* is left alone for every mode except where `setProgress` is
active (next section) — activity governs intensity, not cadence, which keeps
the metaphor's timing legible.

### 3. Progress-driven phase (`diffusion`, `video`, `prefill`)

Each of these currently computes its ring radius / sweep position from
`t % 1` (or a scaled variant) — a single 0..1 value walked by the wall
clock. When `setProgress` has been called (i.e. `_progressCurrent !== null`),
the mode substitutes `_progressCurrent` for that value directly, via a
shared `activePhase(wallClockPhase)` helper. This is a drop-in substitution
— same formula, different phase source — so the visual shape is unchanged;
only *what drives its position* changes from "wall clock" to "the fold's
actual step count." `video`'s two phase-offset rings both call
`activePhase` (on `t % 1` and `(t % 1 + 0.5) % 1` respectively); when driven
live, both collapse onto the same real value, so a live-progress `video`
shows one ring, not two — an accepted simplification, since a single real
scalar cannot represent two independent phase-offset positions.

`thinking` is intentionally **excluded** from progress substitution even
though `trunk`'s `frac` is exactly as real as `diffusion`'s: its phase is a
per-cell traveling wave term (`sin(t·k + c·0.18 + r·0.12)`), not a single
`t % 1` sweep, so there is no faithful drop-in substitution for it the way
there is for a ring/band position. `thinking` still benefits from
`setActivity`/`activityGain` (its amplitude and floor compress at low
activity); making its phase progress-driven is left as a follow-up if a
distinct visual for it is designed later, not silently invented here.
`prefill` gets the mechanism for free (same code path) even though no
current `tt-bio-demo` stage maps to it.

### 4. `tt-bio-demo/ui/chipviz.py` wiring

Two additions, both reusing values the module already computes — no new
telemetry source, no new poll:

- `_tick` already computes `clock_activity(mhz)` per chip for `flow_params`.
  Add one more `_eval` call per chip: `setActivity(i, clock_activity(mhz))`.
- `set_chip_stages`'s existing contract (`{card: stage}`, plain stage
  strings/`None`) is an established call site used throughout
  `tests/unit/test_chipviz_multichip.py`. Rather than break it, each value
  becomes **either** a bare `stage` (unchanged, `frac` implicitly `0.0`) or
  a `(stage, frac)` tuple — accepted per-entry, so every existing caller and
  test keeps working unmodified, and `ui/app.py`'s real wiring is the only
  caller that opts into the tuple form. The wire's whole-fold `frac` is
  converted to a within-stage fraction with the same `within_stage_frac`
  helper `ui/panels.py` already uses, then pushed via `setProgress(i, ...)`
  on every `set_chip_stages` call (not gated on mode change, since progress
  moves within an unchanged stage). A chip with no stage, or a `frac` that
  fails to coerce to a number, simply never gets a `setProgress` call for
  that tick — the mode's existing wall-clock fallback covers it.
- `ui/app.py`'s `_SlotView` gains a `stage_frac` slot, set alongside `stage`
  in the same `kind in ("stage", "job_start", "job_done", "job_error")`
  block that already owns `stage` (the wire's `frac`, coerced the same way
  the existing `stage` branch already coerces it), and cleared to `0.0`
  wherever `stage` is cleared to `None`. `_chip_stages()` is updated to
  build `{card: (stage, stage_frac)}` from this per-cell cache instead of
  `{card: stage}`.

Both additions are wrapped in the same broad `try`/`except` and no-op
guards every other wire-shaped value in this module already uses; a bad or
missing `frac` costs that tick's progress update, never an exception on the
event path.

### 5. Verification

- **Unit tests** (`tests/`, tensix-viz): pure-function tests for
  `activityGain`, the easing math, and each modified mode's output at
  `activity ∈ {0, 0.5, 1}` and `progress ∈ {0, 0.5, 1}` — no canvas, no
  WebView, matching the existing style of `test_chipviz.py`'s pure-function
  tests.
- **The actual claim this task exists to fix** gets re-measured, not just
  asserted: repeat chipviz.py's own methodology (render the WebView to a
  texture across a run at `activity=0.0` vs `activity=1.0`, compare pixel
  statistics) and confirm the gap that was previously "less than frame
  noise" is now measurably larger. This is the bar for calling the work
  done — a green unit test suite alone does not establish it, per this
  project's own "verify the instrument" standard.
- Existing `tests/unit/test_chipviz.py` and tensix-viz's `vitest` suite must
  still pass unmodified (no change to any function's behavior when the new
  setters are never called).

### 6. Rollout

- Bump `tensix-viz`'s `package.json` version and `CHANGELOG.md`.
- Rebuild `tensix-viz.js` / `tensix-viz.esm.js` (`npm run build`).
- Re-vendor the built bundle into `tt-bio-demo/ui/assets/tensix-viz/`,
  updating `PROVENANCE.md`'s recorded version/checksum.
- `tt-local-generator`'s copy is left untouched (see Non-goals) — noted here
  so a future pass knows this exists to pick up.

## Testing plan (summary)

1. `npm test` (vitest) in `tensix-viz` — new + existing tests green.
2. `tt-bio-demo`'s `pytest` suite (`tests/unit/test_chipviz.py` and the
   whole-project run per `pytest.ini`) — green, including new tests for the
   `frac`-threading change.
3. Re-vendor, then the pixel-statistics re-measurement described above,
   recorded in this repo's `CLAUDE.md` change log the way prior chipviz.py
   measurements are.
