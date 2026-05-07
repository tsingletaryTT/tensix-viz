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
