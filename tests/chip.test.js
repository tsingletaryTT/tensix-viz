// tests/chip.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

describe('TensixViz._resolveTheme', () => {
  function makeCanvasInContainer(themeClass) {
    const canvas = document.createElement('canvas')
    canvas.width = 340; canvas.height = 240
    const container = document.createElement('div')
    if (themeClass) container.classList.add(themeClass)
    container.appendChild(canvas)
    return { canvas, container }
  }

  let _origMatchMedia
  beforeEach(() => { _origMatchMedia = globalThis.window.matchMedia })
  afterEach(()  => { globalThis.window.matchMedia = _origMatchMedia })

  it('returns THEME_DARK by default (no theme class on any ancestor)', () => {
    const { canvas } = makeCanvasInContainer(null)
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#0B1E28')
  })

  it('returns THEME_LIGHT when direct parent has tv-light', () => {
    const { canvas } = makeCanvasInContainer('tv-light')
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#EEF4F8')
  })

  it('returns THEME_LIGHT when grandparent has tv-light', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 340; canvas.height = 240
    const inner = document.createElement('div')
    const outer = document.createElement('div')
    outer.classList.add('tv-light')
    inner.appendChild(canvas)
    outer.appendChild(inner)
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#EEF4F8')
  })

  it('returns THEME_DARK when tv-auto and OS is dark (matchMedia returns false)', () => {
    globalThis.window.matchMedia = () => ({ matches: false })
    const { canvas } = makeCanvasInContainer('tv-auto')
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#0B1E28')
  })

  it('returns THEME_LIGHT when tv-auto and OS is light (matchMedia returns true)', () => {
    globalThis.window.matchMedia = () => ({ matches: true })
    const { canvas } = makeCanvasInContainer('tv-auto')
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const T = viz._resolveTheme()
    expect(T.bg).toBe('#EEF4F8')
  })
})

describe('TensixViz memory layer', () => {
  function makeCanvas() {
    const c = document.createElement('canvas')
    c.width = 340; c.height = 240
    return c
  }

  it('constructs with showMemory: true without throwing', () => {
    expect(() => new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })).not.toThrow()
  })

  it('setMemoryStats() stores override values', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
    expect(viz._memOverride.dram_bw).toBe(0.75)
    expect(viz._memOverride.l1_fill).toBe(0.60)
  })

  it('setMemoryStats() supports partial override (only dram_bw)', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.80 })
    expect(viz._memOverride.dram_bw).toBe(0.80)
    expect(viz._memOverride.l1_fill).toBeUndefined()
  })

  it('reset() clears _memOverride', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
    viz.reset()
    expect(viz._memOverride).toBeNull()
  })

  it('activate() clears _memOverride', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
    viz.activate('inference')
    expect(viz._memOverride).toBeNull()
    viz.reset()
  })

  it('showMemory defaults to false — _showMemory is false when omitted', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    expect(viz._showMemory).toBe(false)
  })

  it('setMemoryStats() clamps out-of-range values to [0, 1]', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 1.5, l1_fill: -0.2 })
    expect(viz._memOverride.dram_bw).toBe(1)
    expect(viz._memOverride.l1_fill).toBe(0)
  })

  it('render() does not throw with showMemory: true and no active mode', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    expect(() => viz.render()).not.toThrow()
  })

  it('render() does not throw with showMemory: true after activate()', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.activate('inference')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(() => viz.render()).not.toThrow()
    viz.reset()
  })

  it('render() does not throw with showMemory: true and setMemoryStats() override', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.setMemoryStats({ dram_bw: 0.75, l1_fill: 0.60 })
    expect(() => viz.render()).not.toThrow()
  })
})
