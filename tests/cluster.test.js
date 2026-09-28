// tests/cluster.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { ClusterViz } from '../src/cluster.js'

function makeDiv() {
  const el = document.createElement('div')
  el._children = []
  return el
}

describe('ClusterViz', () => {
  let container

  beforeEach(() => { container = makeDiv() })

  it('constructs for bh-galaxy without throwing', () => {
    expect(() => new ClusterViz(container, 'bh-galaxy')).not.toThrow()
  })

  it('constructs for bh-galaxy-sc without throwing', () => {
    expect(() => new ClusterViz(container, 'bh-galaxy-sc')).not.toThrow()
  })

  it('renders 32 tile elements for bh-galaxy', () => {
    const viz = new ClusterViz(container, 'bh-galaxy')
    expect(viz.chipCount).toBe(32)
    expect(viz._tiles.length).toBe(32)
    viz.destroy()
  })

  it('chipCount is 128 for bh-galaxy-sc', () => {
    const viz = new ClusterViz(container, 'bh-galaxy-sc')
    expect(viz.chipCount).toBe(128)
    viz.destroy()
  })

  it('activate("inference") does not throw', () => {
    const viz = new ClusterViz(container, 'bh-galaxy')
    expect(() => viz.activate('inference')).not.toThrow()
    viz.destroy()
  })

  it('reset() does not throw', () => {
    const viz = new ClusterViz(container, 'bh-galaxy')
    expect(() => viz.reset()).not.toThrow()
    viz.destroy()
  })

  it('transitionTo returns a Promise', () => {
    const viz = new ClusterViz(container, 'bh-galaxy-sc')
    const p = viz.transitionTo('server', { index: 0 })
    expect(p).toBeInstanceOf(Promise)
    viz.destroy()
  })

  it('destroy() empties the container', () => {
    const viz = new ClusterViz(container, 'bh-galaxy')
    viz.destroy()
    expect(container._children.length).toBe(0)
  })

  it('highlight([0]) does not throw', () => {
    const viz = new ClusterViz(container, 'bh-galaxy')
    expect(() => viz.highlight([0])).not.toThrow()
    viz.destroy()
  })
})

// Regression: tiles are empty divs with no intrinsic width, so a shrink-to-fit
// parent sized the whole cluster to its one-line spec caption — Galaxy SC's
// 128 chips rendered as 2.7px dots. The grid now carries a preferred width
// derived from its column count, capped by max-width so phones still shrink it.
describe('ClusterViz grid sizing', () => {
  it('gives the tile grid a preferred width from its column count (tile mode)', () => {
    const viz = new ClusterViz(document.createElement('div'), 'bh-galaxy')
    // 8 cols × 32px tiles + 7 × 3px gaps
    expect(viz._grid.style.width).toBe((8 * 32 + 7 * 3) + 'px')
    expect(viz._grid.style.maxWidth).toBe('100%')
    viz.destroy()
  })

  it('uses smaller tiles in dot mode', () => {
    const viz = new ClusterViz(document.createElement('div'), 'bh-galaxy-sc')
    // 32 cols × 10px dots + 31 × 2px gaps
    expect(viz._grid.style.width).toBe((32 * 10 + 31 * 2) + 'px')
    viz.destroy()
  })
})
