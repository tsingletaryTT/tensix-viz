// tests/chip.test.js
import { describe, it, expect, vi } from 'vitest'
import { TensixViz } from '../src/chip.js'

function makeCanvas() {
  const c = document.createElement('canvas')
  c.width = 340; c.height = 240
  return c
}

describe('TensixViz', () => {
  it('constructs without throwing for blackhole', () => {
    expect(() => new TensixViz(makeCanvas(), { arch: 'blackhole' })).not.toThrow()
  })

  it('constructs without throwing for wormhole', () => {
    expect(() => new TensixViz(makeCanvas(), { arch: 'wormhole' })).not.toThrow()
  })

  it('reset() does not throw', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(() => viz.reset()).not.toThrow()
  })

  it('activate("idle") does not throw', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(() => viz.activate('idle')).not.toThrow()
    viz.reset()
  })

  it('activate("inference") does not throw', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(() => viz.activate('inference')).not.toThrow()
    viz.reset()
  })

  it('activate("diffusion") does not throw', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(() => viz.activate('diffusion')).not.toThrow()
    viz.reset()
  })

  it('activate("agents") does not throw', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(() => viz.activate('agents')).not.toThrow()
    viz.reset()
  })

  it('activate("explore") does not throw', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(() => viz.activate('explore')).not.toThrow()
    viz.reset()
  })

  it('activate with unknown mode throws', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(() => viz.activate('unknown')).toThrow('Unknown animation mode: "unknown"')
  })

  it('play() accepts a valid script', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(() => viz.play([{ step: 'pause', ms: 10 }])).not.toThrow()
    viz.reset()
  })

  it('activate() writes _heatmap at chip grid coordinates after a tick', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.activate('inference')
    // Let rAF tick execute (setup.js maps RAF to setTimeout(fn, 16))
    await new Promise(resolve => setTimeout(resolve, 50))
    const hmap = viz._heatmap
    expect(hmap).not.toBeNull()
    // BH compute grid: colStart=1, colEnd=15, rowStart=1, rowEnd=10
    // So hmap[1][1] should be a number, hmap[0] should be undefined
    expect(typeof hmap[1][1]).toBe('number')
    expect(hmap[0]).toBeUndefined()
    viz.reset()
  })

  it('calling activate() twice cancels the first loop', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    viz.activate('idle')
    const gen1 = viz._animGen
    viz.activate('inference')  // calls reset() internally, increments _animGen
    const gen2 = viz._animGen
    expect(gen2).toBeGreaterThan(gen1)
    viz.reset()
  })
})
