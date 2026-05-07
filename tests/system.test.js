// tests/system.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import { SystemViz } from '../src/system.js'

function makeDiv() {
  const el = document.createElement('div')
  el._children = []
  return el
}

describe('SystemViz', () => {
  let container

  beforeEach(() => { container = makeDiv() })

  it('creates two card wrappers for qb2', () => {
    const viz = new SystemViz(container, 'qb2')
    expect(container.children.length).toBeGreaterThanOrEqual(2)
    viz.destroy()
  })

  it('creates four card wrappers for t3000', () => {
    const viz = new SystemViz(container, 't3000')
    expect(container.children.length).toBeGreaterThanOrEqual(4)
    viz.destroy()
  })

  it('activate("inference") does not throw', () => {
    const viz = new SystemViz(container, 'qb2')
    expect(() => viz.activate('inference')).not.toThrow()
    viz.destroy()
  })

  it('reset() does not throw', () => {
    const viz = new SystemViz(container, 'qb2')
    expect(() => viz.reset()).not.toThrow()
    viz.destroy()
  })

  it('transitionTo("card", {index:0}) returns a Promise', () => {
    const viz = new SystemViz(container, 'qb2')
    const p = viz.transitionTo('card', { index: 0 })
    expect(p).toBeInstanceOf(Promise)
    viz.destroy()
  })

  it('transitionTo("chip", {card:0, chip:1}) returns a Promise', () => {
    const viz = new SystemViz(container, 'qb2')
    const p = viz.transitionTo('chip', { card: 0, chip: 1 })
    expect(p).toBeInstanceOf(Promise)
    viz.destroy()
  })

  it('destroy() empties the container', () => {
    const viz = new SystemViz(container, 'qb2')
    viz.destroy()
    expect(container._children.length).toBe(0)
  })
})
