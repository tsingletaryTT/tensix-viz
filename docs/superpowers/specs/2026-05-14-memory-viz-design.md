# Memory Visualization Layer — Design Spec

**Date:** 2026-05-14
**Status:** Approved
**Feature branch target:** `feat/memory-viz`

---

## Goal

Add an opt-in DRAM + L1 SRAM memory visualization layer to `TensixViz` (single-chip canvas renderer). The layer renders entirely inside the existing canvas — no new DOM elements, no new widget class. It is scientifically grounded where possible and honestly labeled where it is a visual metaphor.

---

## Use Cases

| Priority | Context | Notes |
|----------|---------|-------|
| Primary | README / docs page | Eye-catching visual metaphor; no live data needed |
| High | Live system monitor | Real bandwidth numbers from telemetry or tt-toplike override simulation |
| Medium | Educational / simulator pairing | A future simulator feeds `setMemoryStats()` per tick |

---

## Approach

**In-canvas DRAM overlay (Approach 1)** with the memory signal API (from Approach 3) built in from day one.

- Extend `src/chip.js` only — no new files, no new widget class
- Three rendering layers added inside the existing `_tick()` loop
- Every animation mode gets a named memory signal preset
- `setMemoryStats()` overrides the preset with live/real numbers
- Full light/dark theme support via the existing theme resolver

---

## Visual Layers

### 1. DRAM Row Glow

The two DRAM rows (already tracked in `_dram[]` from topology JSON) receive a colored overlay whose alpha is driven by `dram_bw × envelope(t)`:

- **Steady modes:** gentle breath (slow sine, ±15% amplitude)
- **Burst modes:** sharp attack → exponential decay, period determined by preset
- **kernel_dispatch:** spike aligned to dispatch event, rapid decay

The glow uses the existing row cell geometry — no new canvas regions needed.

### 2. Transfer Particles

Extends the existing `_particles` system. Particles spawn along DRAM rows and travel toward active compute cells (reads) or in reverse (writebacks). Three semantic colors:

| Color | Meaning |
|-------|---------|
| Teal | Load — DRAM → L1 read |
| Gold | Prefetch / burst load |
| Pink/rose | Writeback — L1 → DRAM write |

Particle density scales with `dram_bw`. Writeback particle density scales with a separate `writeback` preset field (default 0 for most modes; significant for `kernel_dispatch` and end-of-prefill).

### 3. L1 Fill Bars

A thin vertical bar rendered at the bottom of each Tensix compute cell:

- Width: 70% of cell width, centered
- Height: `l1_fill × cell_height × (1 + per-cell-noise × 0.15)` — small per-cell noise prevents a uniform flat line
- Color: amber/warm (contrasts with teal streams)
- Does not interfere with the core activity glow drawn over it

---

## Memory Signal Presets

Each mode defines a preset. Fields:

```
dram_bw:    0–1   DRAM row glow intensity + particle density
l1_fill:    0–1   L1 bar height
burst:      bool  periodic burst envelope vs. steady breath
burstHz:    num   bursts per second (only used when burst: true)
writeback:  0–1   reverse particle density (writes back to DRAM)
loadColor:  str   'teal' | 'gold'  — dominant load particle color
```

| Mode | dram_bw | l1_fill | burst | burstHz | writeback | loadColor | Accuracy |
|------|---------|---------|-------|---------|-----------|-----------|----------|
| `idle` | 0.05 | 0.02 | false | — | 0 | teal | ◆◆ |
| `inference` | 0.55 | 0.45 | false | — | 0 | teal | ◆ |
| `prefill` | 0.90 | 0.85 | true | 0.5 | 0.20 | gold | ◆◆ |
| `thinking` | 0.12 | 0.92 | false | — | 0 | teal | ◆◆ |
| `agents` | 0.45 | 0.40 | true | 0.8 | 0 | teal | visual |
| `diffusion` | 0.65 | 0.60 | true | 1.2 | 0 | teal | ◆ |
| `video` | 0.70 | 0.65 | true | 1.6 | 0 | teal | visual |
| `batch` | 0.80 | 0.60 | false | — | 0 | teal | ◆ |
| `explore` | 0.30 | 0.35 | false | — | 0 | teal | visual |
| `kernel_dispatch` | 0.15 (base) / 0.90 (spike) | 0.55 | true | event-driven | 0.50 | gold | ◆◆ |

**Design rationale for notable presets:**

- **`thinking`** — `dram_bw: 0.12` intentionally near-zero. Long CoT inference loads model weights into L1 once at prefill; subsequent token generation reuses cached activations. Very low DRAM bandwidth, very high L1 utilization is the most accurate single-chip picture.
- **`prefill`** — `dram_bw: 0.90` captures the genuine compute-bound, all-cores-active weight streaming that happens during prompt ingestion.
- **`kernel_dispatch`** — spike at dispatch time mirrors the NOC multicast burst that pushes the kernel binary and data to assigned cores; `writeback: 0.50` captures the result flush after compute completes. The `burstHz: event-driven` entry in the table means the burst envelope is tied to the existing `_kd.list` dispatch state (not a Hz timer); the DRAM spike fires when a kernel is dispatched and decays over the kernel's active lifespan.

---

## API

### Constructor

```js
const viz = new TensixViz(canvas, {
  arch: 'blackhole' | 'wormhole',
  showMemory: true,   // NEW — default false; backward-compatible
})
```

### `setMemoryStats(stats)`

Override simulation presets with real data. Call from a telemetry loop or simulator tick.

```js
viz.setMemoryStats({
  dram_bw: 0.75,   // 0–1, normalized to peak BH bandwidth (~900 GB/s for BH)
  l1_fill: 0.60,   // 0–1, fraction of per-chip L1 SRAM capacity in use
})
```

- Override is **sticky** until cleared
- Cleared by `viz.reset()` or `viz.activate(newMode)` — both return to preset-driven simulation
- Partial overrides supported: `setMemoryStats({ dram_bw: 0.8 })` updates only `dram_bw`; `l1_fill` stays on preset

### Unchanged methods

`activate()`, `reset()`, `highlight()`, `transitionTo()`, `destroy()` — no signature changes.

---

## Theming

`TensixViz` resolves `tv-light` / `tv-auto` by walking up the DOM on each render frame (existing behavior). Memory colors follow the same resolved theme:

```js
const MEM_COLORS = {
  dark: {
    dram:  [  0, 210, 190],   // bright teal
    l1:    [255, 180,  50],   // warm amber
    write: [220,  80, 160],   // vivid pink
    gold:  [255, 200,  80],   // prefetch gold
  },
  light: {
    dram:  [  0, 140, 130],   // deeper teal (legible on Cool Slate)
    l1:    [160,  80,  10],   // darker amber
    write: [180,  40, 120],   // deeper rose
    gold:  [190, 130,   0],   // darker gold
  },
}
```

Dark theme: all colors are bright and saturated — they pop against the near-black chip background.
Light theme: same hues, pulled darker so they remain legible against the Cool Slate palette without washing out.

---

## Accuracy Labeling

Presets carry an accuracy tier used for inline documentation and (optionally) a future UI badge:

| Tier | Symbol | Meaning |
|------|--------|---------|
| Accurate | ◆◆ | Pattern closely matches measured or well-understood hardware behavior |
| Close | ◆ | Reasonable abstraction; shape is right, magnitude is approximate |
| Visual | *(none)* | Stylized metaphor; captures the conceptual feel, not the DRAM signature |

All tiers are valid for the README/docs use case. The `visual` tier requires no disclaimer beyond what the README already states ("All are visual metaphors").

For the live monitor use case (B), `setMemoryStats()` data replaces the simulation entirely — accuracy tier becomes irrelevant once real numbers flow in.

---

## Scope Boundaries

**In scope for this feature:**

- `src/chip.js` — all rendering and API changes
- `tensix-viz.js` / `tensix-viz.esm.js` — rebuilt bundle
- README `Animation modes` table — add memory behavior column
- One new GIF: `memory` — BH chip, `inference` mode, `showMemory: true`, dark theme

**Explicitly out of scope:**

- `CardViz`, `SystemViz`, `ClusterViz` — no changes; those can forward `showMemory` to inner `TensixViz` instances in a future pass
- New widget class (`MemoryViz`) — deferred; revisit if standalone component is needed for the live monitor use case
- Real telemetry integration — `setMemoryStats()` provides the hookpoint; the caller wires it up

---

## Testing

- Unit tests for `setMemoryStats()`: override sticks, partial override works, `reset()` clears override, `activate()` clears override
- Unit test: `showMemory: false` (default) produces no memory rendering state
- Visual coverage via GIF pipeline (`memory.gif`)
- All 59 existing tests must continue to pass
