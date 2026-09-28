// tests/card.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { CardViz } from '../src/card.js'

function makeDiv() {
  const el = document.createElement('div')
  el._children = []
  return el
}

describe('CardViz', () => {
  let container

  beforeEach(() => { container = makeDiv() })

  it('creates two chip canvases for bh-p300c', () => {
    const viz = new CardViz(container, 'bh-p300c')
    expect(container.children.length).toBeGreaterThanOrEqual(2)
    viz.destroy()
  })

  it('creates two chip canvases for wh-n300', () => {
    const viz = new CardViz(container, 'wh-n300')
    expect(container.children.length).toBeGreaterThanOrEqual(2)
    viz.destroy()
  })

  it('activate("inference") does not throw', () => {
    const viz = new CardViz(container, 'bh-p300c')
    expect(() => viz.activate('inference')).not.toThrow()
    viz.destroy()
  })

  it('reset() does not throw', () => {
    const viz = new CardViz(container, 'bh-p300c')
    expect(() => viz.reset()).not.toThrow()
    viz.destroy()
  })

  it('highlight([0]) does not throw', () => {
    const viz = new CardViz(container, 'bh-p300c')
    expect(() => viz.highlight([0])).not.toThrow()
    viz.destroy()
  })

  it('transitionTo("chip", {index:0}) returns a Promise', () => {
    const viz = new CardViz(container, 'bh-p300c')
    const p = viz.transitionTo('chip', { index: 0 })
    expect(p).toBeInstanceOf(Promise)
    viz.destroy()
  })

  it('destroy() empties the container', () => {
    const viz = new CardViz(container, 'bh-p300c')
    viz.destroy()
    expect(container.children.length).toBe(0)
  })

  it('throws for unknown config name', () => {
    expect(() => new CardViz(container, 'bad-config')).toThrow()
  })
})

// Regression: chips were built one at a time inside a flex row, and each
// TensixViz capped itself to its wrapper's clientWidth at that moment — so
// later chips measured a space already squeezed by earlier ones and came out
// half-size. Card chips must all keep the same logical size and leave fitting
// to CSS.
describe('CardViz chip sizing', () => {
  it('gives every chip the same logical size regardless of wrapper width at build time', () => {
    const origCreate = document.createElement
    let n = 0
    // Simulate a squeezed flex row: each successive wrapper reports less room.
    document.createElement = (tag) => {
      const el = origCreate(tag)
      if (tag === 'div') el.clientWidth = Math.max(40, 200 - 80 * n++)
      return el
    }
    try {
      const viz = new CardViz(makeDiv(), 'bh-p300c')
      const sizes = viz._chips.map(c => [c._logicalW, c._logicalH])
      expect(sizes).toEqual([[340, 240], [340, 240]])
      viz.destroy()
    } finally {
      document.createElement = origCreate
    }
  })
})
