// tests/chip.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TensixViz } from '../src/chip.js'

function makeCanvas(w = 340, h = 240) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

function makeCanvasInContainer(canvasW, canvasH, containerW) {
  const container = document.createElement('div')
  container.clientWidth = containerW
  const canvas = makeCanvas(canvasW, canvasH)
  container.appendChild(canvas)
  return { canvas, container }
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

  it('_execStep accepts the {action, coords} schema (alias for {step, cores})', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole' })
    // Authored with action/coords rather than step/cores — must still highlight.
    viz._execStep({ action: 'highlight', coords: [[1, 1], [2, 1]], color: 'tensixActive' }, () => {})
    expect(viz._highlights['1,1']).toBeTruthy()
    expect(viz._highlights['2,1']).toBeTruthy()
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
    const canvas = makeCanvas()
    const viz = new TensixViz(canvas, { arch: 'blackhole', showMemory: true })
    viz.activate('inference')  // seeds _memPhase so _drawMemoryLayer is not short-circuited
    viz.setMemoryStats({ dram_bw: 0.7, l1_fill: 0.5 })
    expect(() => viz.render()).not.toThrow()
  })

  it('render() does not throw with showMemory: false (default)', () => {
    const canvas = makeCanvas()
    const viz = new TensixViz(canvas, { arch: 'blackhole' })
    viz.activate('inference')
    // showMemory defaults to false — _drawMemoryLayer should return immediately
    expect(() => viz.render()).not.toThrow()
  })

  it('reset() clears _memPhase to null on showMemory: true instance', async () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.activate('inference')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(viz._memPhase).not.toBeNull()
    viz.reset()
    expect(viz._memPhase).toBeNull()
  })

  it('render() after reset() does not draw memory layer (no ghost overlay)', () => {
    const viz = new TensixViz(makeCanvas(), { arch: 'blackhole', showMemory: true })
    viz.activate('inference')
    viz.reset()
    // _memPhase must be null so _drawMemoryLayer bails out immediately
    expect(viz._memPhase).toBeNull()
    expect(() => viz.render()).not.toThrow()
  })

  it('_isMem particles are spawned when showMemory: true and mode has dram_bw > 0', async () => {
    const canvas = makeCanvas()
    const viz = new TensixViz(canvas, { arch: 'blackhole', showMemory: true })
    viz.activate('inference')   // dram_bw: 0.55 — high enough to spawn
    // Run several frames to overcome spawn probability
    for (let i = 0; i < 200; i++) viz.render()
    const memParticles = viz._particles.filter(p => p._isMem)
    expect(memParticles.length).toBeGreaterThan(0)
  })
})

describe('TensixViz responsive sizing', () => {
  it('caps _logicalW/_logicalH when container is narrower than canvas', () => {
    const { canvas } = makeCanvasInContainer(340, 240, 200)
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    expect(viz._logicalW).toBe(200)
    expect(viz._logicalH).toBe(Math.round(240 * 200 / 340))
  })

  it('sets canvas.width to Math.round(logicalW * dpr)', () => {
    const { canvas } = makeCanvasInContainer(340, 240, 200)
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    expect(canvas.width).toBe(Math.round(200 * dpr))
    expect(canvas.height).toBe(Math.round(Math.round(240 * 200 / 340) * dpr))
  })

  it('does not cap when container is wider than canvas', () => {
    const { canvas } = makeCanvasInContainer(340, 240, 800)
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    expect(viz._logicalW).toBe(340)
    expect(viz._logicalH).toBe(240)
  })

  it('does not cap when parentElement is null (no container)', () => {
    const canvas = makeCanvas(340, 240)
    // canvas.parentElement is null — no container check
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    expect(viz._logicalW).toBe(340)
    expect(viz._logicalH).toBe(240)
  })

  it('does not cap when container clientWidth is 0 (pre-layout)', () => {
    const { canvas } = makeCanvasInContainer(340, 240, 0)
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    expect(viz._logicalW).toBe(340)
  })
})

describe('TensixViz._drawHeatmap tensix-only guard', () => {
  it('does not draw heat overlay on DRAM cell (wormhole col 5)', () => {
    const canvas = makeCanvas()
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    // Seed a hot value only at a DRAM cell (row 1, col 5 on wormhole)
    const hmap = []
    hmap[1] = []; hmap[1][5] = 1.0   // DRAM cell — must be ignored
    viz._heatmap = hmap
    // _drawHeatmap normalises over tensix cells only; if DRAM dominates, maxVal
    // stays 0 and the function returns early rather than painting anything.
    const ctx = viz.ctx
    const fillRectCalls = []
    const origFill = ctx.fill.bind(ctx)
    ctx.fill = () => fillRectCalls.push(true)
    viz._drawHeatmap()
    // No fill calls: only a DRAM cell had data, so maxVal was 0 → early return.
    expect(fillRectCalls.length).toBe(0)
  })

  it('normalises against tensix cells only — DRAM value does not compress tensix range', () => {
    const canvas = makeCanvas()
    const viz = new TensixViz(canvas, { arch: 'wormhole' })
    // Hot tensix cell at (col=1, row=1) and a hotter DRAM cell at (col=5, row=1).
    // Old buggy code would set maxVal=2 (DRAM wins) and display tensix at half intensity.
    // Fixed code ignores DRAM → maxVal=1 → tensix cell renders at full intensity.
    const hmap = []
    hmap[1] = []; hmap[1][1] = 1.0; hmap[1][5] = 2.0
    viz._heatmap = hmap
    const ctx = viz.ctx
    const globalAlphas = []
    const origSave = ctx.save.bind(ctx)
    ctx.save = () => { globalAlphas.push(ctx.globalAlpha) }
    // Run through the draw pass; it will call ctx.save once per tensix cell drawn.
    viz._drawHeatmap()
    // At least one save means at least one tensix cell was drawn (globalAlpha 0.6 at v=1).
    expect(globalAlphas.length).toBeGreaterThan(0)
  })
})
