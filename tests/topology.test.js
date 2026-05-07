// tests/topology.test.js
import { describe, it, expect } from 'vitest'
import { loadTopology } from '../src/topology.js'

describe('loadTopology', () => {
  it('loads bh-chip by name', () => {
    const t = loadTopology('bh-chip')
    expect(t.arch).toBe('blackhole')
    expect(t.cols).toBe(17)
    expect(t.rows).toBe(12)
  })

  it('loads wh-chip by name', () => {
    const t = loadTopology('wh-chip')
    expect(t.arch).toBe('wormhole')
    expect(t.cols).toBe(10)
    expect(t.rows).toBe(12)
  })

  it('loads bh-p300c with two chips and intra_links', () => {
    const t = loadTopology('bh-p300c')
    expect(t.chips).toHaveLength(2)
    expect(t.intra_links).toHaveLength(1)
    expect(t.intra_links[0].from.eth).toEqual([10, 11])
    expect(t.intra_links[0].to.eth).toEqual([2, 3])
  })

  it('loads wh-n300 with two chips and intra_links', () => {
    const t = loadTopology('wh-n300')
    expect(t.chips).toHaveLength(2)
    expect(t.intra_links[0].link_count).toBe(2)
  })

  it('loads qb2 with two cards', () => {
    const t = loadTopology('qb2')
    expect(t.cards).toHaveLength(2)
    expect(t.inter_links[0].connector).toBe('samtec')
  })

  it('loads t3000 with four cards in a grid', () => {
    const t = loadTopology('t3000')
    expect(t.cards).toHaveLength(4)
    expect(t.grid).toEqual([2, 4])
  })

  it('loads bh-galaxy with 32 chips', () => {
    const t = loadTopology('bh-galaxy')
    expect(t.chip_count).toBe(32)  // chip_count avoids collision with the array "chips" field used in multi-chip card configs
    expect(t.grid).toEqual([4, 8])
  })

  it('loads bh-galaxy-sc with 128 total chips', () => {
    const t = loadTopology('bh-galaxy-sc')
    expect(t.total_chips).toBe(128)
  })

  it('returns inline config objects unchanged', () => {
    const cfg = { arch: 'blackhole', cols: 17, rows: 12 }
    expect(loadTopology(cfg)).toBe(cfg)
  })

  it('throws for unknown topology name', () => {
    expect(() => loadTopology('foobar')).toThrow('Unknown topology: "foobar"')
  })

  it('throws for non-object, non-string input', () => {
    // null and primitive numbers are not valid topology names or config objects
    expect(() => loadTopology(null)).toThrow('loadTopology')
    expect(() => loadTopology(42)).toThrow('loadTopology')
  })
})
