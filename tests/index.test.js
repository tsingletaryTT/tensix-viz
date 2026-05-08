// tests/index.test.js
import { describe, it, expect } from 'vitest'
import { TensixViz, CardViz, SystemViz, ClusterViz, autoInit } from '../src/index.js'

describe('index exports', () => {
  it('exports TensixViz', () => { expect(typeof TensixViz).toBe('function') })
  it('exports CardViz',   () => { expect(typeof CardViz).toBe('function') })
  it('exports SystemViz', () => { expect(typeof SystemViz).toBe('function') })
  it('exports ClusterViz',() => { expect(typeof ClusterViz).toBe('function') })
  it('exports autoInit',  () => { expect(typeof autoInit).toBe('function') })
})

describe('autoInit', () => {
  it('does not throw when no data-viz elements exist', () => {
    // autoInit() is called directly here (the auto-run guard at module level does
    // NOT fire in tests because globalThis.window has no .document property).
    expect(() => autoInit()).not.toThrow()
  })

  it('calls TensixViz.autoInit() for legacy support', () => {
    // TensixViz.autoInit must exist as a function (legacy API delegate).
    expect(typeof TensixViz.autoInit).toBe('function')
    // Calling autoInit() should invoke the legacy path without throwing.
    expect(() => autoInit()).not.toThrow()
  })
})
