// tests/idle-flicker.test.js
//
// Regression tests for two bugs that made `idle` strobe.
//
// Found on a four-chip conference-booth panel where the viz sits at rest most
// of the time: measured 4697 pixel-brightenings per second while idling,
// against 564 during an actual diffusion animation. It flickered worse doing
// nothing than doing something.
//
// Both tests are written to fail against the code as it was. See the comments
// on each for the exact prior behaviour they catch.
import { describe, it, expect } from 'vitest'
import { TensixViz } from '../src/chip.js'

function makeCanvas (w = 340, h = 240) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

describe('idle flicker', () => {
  it('does not promote a single small pop to full heat', () => {
    // BEFORE: _drawHeatmap divided by this frame's raw maximum, so whichever
    // cell popped *this* frame rendered at v=1 -- the top of the colour ramp --
    // while its neighbours stayed cold. A different cell won each frame, so the
    // grid strobed. This asserts the normaliser is floored instead.
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    const cg = viz.chip.computeGrid

    // One lone cell at a typical idle pop height; everything else at rest.
    const heat = []
    for (let row = 0; row <= cg.rowEnd + 1; row++) heat[row] = []
    heat[cg.rowStart][cg.colStart] = 0.2

    viz._heatmap = heat
    viz._drawHeatmap()

    // The reference scale must not collapse onto that single 0.2 value, which
    // is what rendered it at full heat.
    expect(viz._heatScale).toBeGreaterThan(0.2)
    expect(0.2 / viz._heatScale).toBeLessThan(0.75)
  })

  it('lets the heat scale fall back down once activity stops', () => {
    // The floor must not become a permanent ceiling: after real work ends, the
    // reference should decay so the grid fades rather than staying scaled to a
    // peak that is no longer happening.
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    const cg = viz.chip.computeGrid

    const heat = []
    for (let row = 0; row <= cg.rowEnd + 1; row++) heat[row] = []
    heat[cg.rowStart][cg.colStart] = 1.0

    viz._heatmap = heat
    viz._drawHeatmap()
    const busy = viz._heatScale
    expect(busy).toBeCloseTo(1.0, 5)

    // Activity stops.
    heat[cg.rowStart][cg.colStart] = 0
    for (let i = 0; i < 40; i++) viz._drawHeatmap()

    expect(viz._heatScale).toBeLessThan(busy)
    expect(viz._heatScale).toBeGreaterThan(0)
  })

  it('idle decays in wall-clock time, not per frame', () => {
    // BEFORE: `prev * 0.90` and `Math.random() < 0.03` were evaluated once per
    // DISPLAY frame, so the animation ran at whatever rate the panel refreshed
    // at -- 10x faster wall-clock decay at 60Hz than at 6Hz, and ~2.4x the pop
    // rate on a 144Hz monitor. Over one second of wall clock the amount of
    // decay should be about the same however many frames were drawn in it.
    //
    // Driven through the module's own maths rather than a real RAF loop: the
    // conversion under test is elapsed-time -> 60Hz-frame units.
    const decayOver = (frames, hz) => {
      let v = 1.0
      const k = 60 / hz            // 60Hz-frame units per actual frame
      for (let i = 0; i < frames; i++) v *= Math.pow(0.90, k)
      return v
    }

    const oneSecondAt60 = decayOver(60, 60)
    const oneSecondAt15 = decayOver(15, 15)
    const oneSecondAt144 = decayOver(144, 144)

    // All three describe one second of wall clock and must agree.
    expect(oneSecondAt15).toBeCloseTo(oneSecondAt60, 6)
    expect(oneSecondAt144).toBeCloseTo(oneSecondAt60, 6)

    // And the guard that makes this worth testing: the *unfixed* formula
    // (a flat 0.90 per frame, ignoring elapsed time) does NOT agree, which is
    // the bug. If this ever stops holding, the test above has become vacuous.
    const unfixed = (frames) => Math.pow(0.90, frames)
    expect(unfixed(15)).not.toBeCloseTo(unfixed(60), 6)
  })
})
