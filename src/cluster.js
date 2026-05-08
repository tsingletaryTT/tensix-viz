// src/cluster.js
import { loadTopology } from './topology.js'

// Threshold: above this chip count, use dot mode instead of tile mode
const DOT_MODE_THRESHOLD = 64

/**
 * ClusterViz — renders an abstract chip grid for server/cluster-scale views.
 * Tiles represent chips; clicking a tile triggers transitionTo('server', {index}).
 *
 * At ≤32 chips: tile mode (colored divs, slightly larger).
 * At >64 chips: dot mode (tiny tiles, CSS class tv-cluster-dot-mode applied).
 * No per-core rendering — this is an abstract cluster-scale overview.
 *
 * @param {HTMLElement} container
 * @param {string|object} config  - 'bh-galaxy', 'bh-galaxy-sc', or inline config
 */
export function ClusterViz(container, config) {
  this._container  = container
  this._topo       = loadTopology(config)
  this._tiles      = []
  this._activeMode = 'idle'
  this._animFrame  = null
  this._breadcrumb = null
  this._destroyed  = false
  this._zoomed     = -1

  // Resolve chip count — handle both chip_count (bh-galaxy) and total_chips (bh-galaxy-sc).
  // Fall back to chips array length or a computed value from server count.
  if (this._topo.total_chips) {
    this.chipCount = this._topo.total_chips
  } else if (typeof this._topo.chip_count === 'number') {
    this.chipCount = this._topo.chip_count
  } else if (Array.isArray(this._topo.chips)) {
    this.chipCount = this._topo.chips.length
  } else {
    // Fall back: assume 32 chips per server node
    this.chipCount = (this._topo.servers || 1) * 32
  }

  // Use dot mode for large chip counts so tiles remain visible at density
  this._dotMode = this.chipCount > DOT_MODE_THRESHOLD
  this._init()
}

/**
 * Build the DOM structure: a spec strip at the top, then a grid of tile divs.
 * One tile div is created per chip. Animation begins immediately in idle mode.
 * @private
 */
ClusterViz.prototype._init = function () {
  const self      = this
  const container = this._container
  const topo      = this._topo

  // Mark the container so CSS can target .tv-cluster for layout rules
  container.classList.add('tv-cluster')
  // In dot mode, tiles are rendered tiny — add a modifier class for CSS
  if (this._dotMode) container.classList.add('tv-cluster-dot-mode')

  // Spec strip: summarizes chip count and key topology facts in plain text
  const spec = document.createElement('div')
  spec.classList.add('tv-cluster-spec')
  spec.textContent = [
    this.chipCount + ' chips',
    topo.eth_ports ? topo.eth_ports + '\u00d7 ' + (topo.eth_speed || '') + ' ETH' : '',
    topo.topology  ? topo.topology : (topo.mesh_links ? '2D mesh' : ''),
  ].filter(Boolean).join(' \u00b7 ')
  container.appendChild(spec)

  // Tile grid — one div per chip, laid out by CSS grid
  const grid = document.createElement('div')
  grid.classList.add('tv-cluster-grid')
  container.appendChild(grid)
  this._grid = grid

  // Create one tile element per chip and register a click handler.
  // The handler maps each tile to the server node that contains it (32 chips/server).
  // `let i` creates a new binding per iteration, so each click closure captures the
  // correct index without needing an IIFE.
  for (let i = 0; i < this.chipCount; i++) {
    const tile = document.createElement('div')
    tile.classList.add('tv-cluster-tile')
    // data-chip-index lets CSS and JS target individual tiles by chip position
    tile.dataset.chipIndex = String(i)
    tile.title = 'Chip ' + i
    tile.addEventListener('click', function () {
      // Each group of 32 chips belongs to one server node
      self.transitionTo('server', { index: Math.floor(i / 32) })
    })
    grid.appendChild(tile)
    self._tiles.push(tile)
  }

  // Begin the idle background-heat animation immediately
  this._startAnimation()
}

/**
 * Drive tile background colors each animation frame based on the current mode.
 * Modes: 'idle', 'inference', 'diffusion', 'agents', 'explore'.
 * Color maps heat value 0..1 from cool teal → warm gold → hot red.
 * @private
 */
ClusterViz.prototype._startAnimation = function () {
  const self  = this
  const tiles = this._tiles

  // Cancel any in-flight animation before starting a new one
  if (this._animFrame) {
    cancelAnimationFrame(this._animFrame)
    this._animFrame = null
  }

  // Snapshot mode and grid dimensions at start time; these are stable per call
  var mode = this._activeMode
  var cols = this._topo.grid ? this._topo.grid[1] : 8
  var rows = this._topo.grid ? this._topo.grid[0] : 4
  var t = 0

  function tick() {
    // Stop immediately if the instance was destroyed between frames
    if (self._destroyed) return
    t += 0.02

    tiles.forEach(function (tile, i) {
      var col = i % cols
      var row = Math.floor(i / cols)
      var heat

      switch (mode) {
        // Inference: a wavefront sweeps left-to-right across columns
        case 'inference':
          heat = Math.max(0, 1 - Math.abs(col - (t % 1) * cols) / 3)
          break

        // Diffusion: concentric rings expand outward from the grid center
        case 'diffusion': {
          var cx = cols / 2, cy = rows / 2
          var dist = Math.sqrt((col - cx) * (col - cx) + (row - cy) * (row - cy))
          var ring = (t % 1) * Math.sqrt(cx * cx + cy * cy)
          heat = Math.max(0, 1 - Math.abs(dist - ring) / 2)
          break
        }

        // Agents: sporadic random spikes that decay exponentially each frame
        case 'agents':
          heat = Math.random() < 0.04
            ? Math.random()
            : parseFloat(tile.dataset.heat || '0') * 0.85
          break

        // Explore: sinusoidal wave across columns, fast oscillation
        case 'explore':
          heat = (Math.sin(col * 0.6 + t * Math.PI * 4) + 1) / 2
          break

        // Idle: very slow random flicker, low intensity, exponential decay
        default:
          heat = Math.random() < 0.02
            ? Math.random() * 0.35
            : parseFloat(tile.dataset.heat || '0') * 0.92
      }

      // Store current heat so decay modes can read it next frame
      tile.dataset.heat = String(heat.toFixed(3))

      // Map 0..1 heat to color:
      //   0.0 → cool teal  (30,  74,  88)
      //   0.5 → warm gold  (244, 196, 113)
      //   1.0 → hot red    (255, 107, 107)
      var r, g, b
      if (heat < 0.5) {
        const s = heat * 2
        r = Math.round(30  + (244 - 30)  * s)
        g = Math.round(74  + (196 - 74)  * s)
        b = Math.round(88  + (113 - 88)  * s)
      } else {
        const s = (heat - 0.5) * 2
        r = Math.round(244 + (255 - 244) * s)
        g = Math.round(196 + (107 - 196) * s)
        b = Math.round(113 + (107 - 113) * s)
      }
      tile.style.background = 'rgb(' + r + ',' + g + ',' + b + ')'
    })

    self._animFrame = requestAnimationFrame(tick)
  }

  this._animFrame = requestAnimationFrame(tick)
}

/**
 * Activate a named animation mode, restarting the animation loop with the new mode.
 *
 * @param {string} mode  - 'inference' | 'diffusion' | 'agents' | 'explore' | 'idle'
 */
ClusterViz.prototype.activate = function (mode) {
  if (this._destroyed) return
  this._activeMode = mode
  this._startAnimation()
}

/**
 * Reset all tiles to their blank state and restart the idle animation.
 */
ClusterViz.prototype.reset = function () {
  if (this._destroyed) return
  this._activeMode = 'idle'
  // Stop current animation before clearing tile styles
  if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null }
  this._tiles.forEach(function (tile) {
    tile.style.background = ''
    tile.dataset.heat = '0'
  })
  this._startAnimation()
}

/**
 * Add/remove a CSS highlight class from tiles by index.
 *
 * @param {number[]} indices  - Chip indices to highlight; all others are un-highlighted
 */
ClusterViz.prototype.highlight = function (indices) {
  if (this._destroyed) return
  this._tiles.forEach(function (tile, i) {
    if (indices.indexOf(i) !== -1) tile.classList.add('tv-highlighted')
    else tile.classList.remove('tv-highlighted')
  })
}

/**
 * Zoom into a server node ('server' level) or zoom back out to cluster level.
 * Tiles belonging to the target server get tv-active; others get tv-hidden.
 * Returns a Promise that resolves after the CSS transition finishes (~300 ms).
 *
 * @param {string} level  - 'server' to zoom in; any other value to zoom out
 * @param {object} [opts]
 *   - level === 'server' → { index: number }  zero-based server node index
 * @returns {Promise<void>}
 */
ClusterViz.prototype.transitionTo = function (level, opts) {
  if (this._destroyed) return Promise.resolve()
  opts = opts || {}

  if (level === 'server') {
    // Use != null (not ||) so index 0 is correctly treated as a valid index
    const serverIdx = opts.index != null ? opts.index : 0
    const tilesPerServer = 32
    const start = serverIdx * tilesPerServer
    this._tiles.forEach(function (tile, i) {
      if (i >= start && i < start + tilesPerServer) tile.classList.add('tv-active')
      else tile.classList.add('tv-hidden')
    })
    this._container.classList.add('tv-zoomed-in')
    this._zoomed = serverIdx
    // Breadcrumb shows hierarchy: Cluster › Server N
    this._showBreadcrumb('Cluster \u203a Server ' + serverIdx)
  } else {
    // Zoom back out — restore all tiles to normal visibility
    this._tiles.forEach(function (tile) {
      tile.classList.remove('tv-active')
      tile.classList.remove('tv-hidden')
    })
    this._container.classList.remove('tv-zoomed-in')
    this._zoomed = -1
    this._hideBreadcrumb()
  }

  return new Promise(function (resolve) { setTimeout(resolve, 300) })
}

/**
 * Insert (or update) a breadcrumb navigation bar at the top of the container.
 * The breadcrumb is created lazily on first call and reused thereafter.
 *
 * @param {string} text  - Breadcrumb text, e.g. 'Cluster › Server 0'
 * @private
 */
ClusterViz.prototype._showBreadcrumb = function (text) {
  if (!this._breadcrumb) {
    this._breadcrumb = document.createElement('div')
    this._breadcrumb.classList.add('tv-breadcrumb')
    // Place before the first child so the breadcrumb appears at the very top
    if (this._container.children[0]) {
      this._container.insertBefore(this._breadcrumb, this._container.children[0])
    } else {
      this._container.appendChild(this._breadcrumb)
    }
  }
  this._breadcrumb.textContent = text
  this._breadcrumb.style.display = 'block'
}

/**
 * Hide the breadcrumb bar (kept in the DOM for quick re-display).
 * @private
 */
ClusterViz.prototype._hideBreadcrumb = function () {
  if (this._breadcrumb) this._breadcrumb.style.display = 'none'
}

/**
 * Tear down this ClusterViz instance. Cancels animation, clears tile references,
 * and removes every child element from the container (via replaceChildren).
 *
 * After destroy() the instance must not be used.
 */
ClusterViz.prototype.destroy = function () {
  this._destroyed = true
  // Cancel any pending animation frame before releasing tile references
  if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null }
  this._tiles      = []
  this._breadcrumb = null
  // replaceChildren() with no args removes all children — standard DOM API
  this._container.replaceChildren()
}
