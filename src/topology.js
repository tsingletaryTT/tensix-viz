// src/topology.js
//
// Topology loader for tensix-viz.
//
// Hardware topology configs are stored as static JSON files under topologies/.
// This module provides a registry of all known topology names and a single
// `loadTopology()` function that resolves a name string to its config object,
// or passes through an already-resolved inline config object unchanged.
//
// JSON import approach: We use static ESM import attributes (`with { type: 'json' }`)
// introduced in Node.js 20+ (and the TC39 Import Attributes proposal). This avoids
// the `createRequire` workaround, which breaks esbuild browser-targeted builds
// because esbuild refuses to resolve the `module` built-in for browser platforms.
// With static imports, esbuild can inline the JSON at bundle time via its JSON loader.

import bhChip     from '../topologies/bh-chip.json'     with { type: 'json' }
import whChip     from '../topologies/wh-chip.json'     with { type: 'json' }
import bhP300c    from '../topologies/bh-p300c.json'    with { type: 'json' }
import whN300     from '../topologies/wh-n300.json'     with { type: 'json' }
import qb2        from '../topologies/qb2.json'         with { type: 'json' }
import t3000      from '../topologies/t3000.json'       with { type: 'json' }
import bhGalaxy   from '../topologies/bh-galaxy.json'   with { type: 'json' }
import bhGalaxySc from '../topologies/bh-galaxy-sc.json' with { type: 'json' }

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
 *   - plain object: returned unchanged (caller supplies a fully-formed config)
 * @returns {object} The topology config object.
 * @throws {Error} If `nameOrConfig` is a string that is not in the registry.
 * @throws {TypeError} If `nameOrConfig` is not a string, plain object, or is null/array.
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
  // Reject null, primitives (numbers, booleans, etc.), and arrays — none of
  // these are valid topology config objects. Arrays in particular would pass
  // a naive `typeof x === 'object'` check but have no topology fields.
  if (nameOrConfig === null || typeof nameOrConfig !== 'object' || Array.isArray(nameOrConfig)) {
    throw new TypeError(
      `loadTopology: expected a topology name (string) or config object, got ${JSON.stringify(nameOrConfig)}`
    )
  }
  // Inline config object — return the same reference so callers can do identity
  // checks (useful for caching and memoization in renderer code).
  return nameOrConfig
}
