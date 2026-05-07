// src/topology.js
//
// Topology loader for tensix-viz.
//
// Hardware topology configs are stored as static JSON files under topologies/.
// This module provides a registry of all known topology names and a single
// `loadTopology()` function that resolves a name string to its config object,
// or passes through an already-resolved inline config object unchanged.
//
// JSON import approach: We use `createRequire` from Node's built-in `module`
// package rather than `import ... assert { type: 'json' }`. The `assert`
// import-attribute syntax is supported in newer Node versions but Vite/vitest
// (which uses esbuild internally) handles `createRequire` more reliably across
// the version range this project targets. esbuild will inline the JSON into
// the final bundle when bundling for the browser.

import { createRequire } from 'module'

// `createRequire` builds a CommonJS-style require() rooted at this file's URL,
// which means all paths below are relative to src/topology.js.
const _req = createRequire(import.meta.url)

const bhChip     = _req('../topologies/bh-chip.json')
const whChip     = _req('../topologies/wh-chip.json')
const bhP300c    = _req('../topologies/bh-p300c.json')
const whN300     = _req('../topologies/wh-n300.json')
const qb2        = _req('../topologies/qb2.json')
const t3000      = _req('../topologies/t3000.json')
const bhGalaxy   = _req('../topologies/bh-galaxy.json')
const bhGalaxySc = _req('../topologies/bh-galaxy-sc.json')

/**
 * Registry of all built-in topology configs keyed by their canonical name.
 *
 * Naming conventions:
 *   bh-*   = Blackhole architecture
 *   wh-*   = Wormhole architecture
 *   -chip  = single die/chip descriptor (rows × cols grid, DRAM/ETH placement)
 *   -p300c = Blackhole dual-chip PCIe card (two BH dies on one board)
 *   -n300  = Wormhole dual-chip NIC card
 *   qb2    = QuietBox 2 — two BH-P300c cards connected via Samtec cable
 *   t3000  = T3000 system — four WH-N300 cards in a 2×4 mesh
 *   bh-galaxy    = 32-chip BH server node in a 4×8 grid
 *   bh-galaxy-sc = Super-cluster of 4 BH-Galaxy nodes (128 chips total)
 */
const REGISTRY = {
  'bh-chip':      bhChip,
  'wh-chip':      whChip,
  'bh-p300c':     bhP300c,
  'wh-n300':      whN300,
  'qb2':          qb2,
  't3000':        t3000,
  'bh-galaxy':    bhGalaxy,
  'bh-galaxy-sc': bhGalaxySc,
}

/**
 * Resolve a topology config by name, or return an inline config object as-is.
 *
 * @param {string|object} nameOrConfig
 *   - string: looked up in the built-in REGISTRY
 *   - object: returned unchanged (caller supplies a fully-formed config)
 * @returns {object} The topology config object.
 * @throws {Error} If `nameOrConfig` is a string that is not in the registry.
 *
 * @example
 * // Resolve by name
 * const chip = loadTopology('bh-chip')
 * // chip.arch === 'blackhole', chip.cols === 17, chip.rows === 12
 *
 * @example
 * // Pass-through inline config
 * const cfg = { arch: 'blackhole', cols: 17, rows: 12 }
 * loadTopology(cfg) === cfg  // true — same reference
 */
export function loadTopology(nameOrConfig) {
  if (typeof nameOrConfig === 'string') {
    const topo = REGISTRY[nameOrConfig]
    if (!topo) {
      throw new Error(
        `Unknown topology: "${nameOrConfig}". Available: ${Object.keys(REGISTRY).join(', ')}`
      )
    }
    return topo
  }
  // Inline config object — return the same reference so callers can do identity
  // checks (useful for caching and memoization in renderer code).
  return nameOrConfig
}
