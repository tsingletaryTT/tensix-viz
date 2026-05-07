// src/card.js
import { TensixViz } from './chip.js'
import { loadTopology } from './topology.js'

/**
 * CardViz — renders a 2-chip card (P300c BH or n300 WH) with intra-card ETH
 * link visualization. Manages its own child canvases inside the container div.
 *
 * @param {HTMLElement} container  - The div that CardViz owns
 * @param {string|object} config   - Topology name ('bh-p300c', 'wh-n300') or inline config
 */
export function CardViz(container, config, options) {
  this._container = container
  this._topo      = loadTopology(config)   // throws for unknown names
  this._options   = options || {}
  this._chips     = []   // TensixViz instances, one per chip
  this._chipEls   = []   // wrapper divs
  this._zoomed    = -1   // index of currently zoomed chip, or -1
  this._breadcrumb = null
  this._destroyed  = false
  this._init()
}

CardViz.prototype._init = function () {
  const self   = this
  const topo   = this._topo
  const container = this._container

  container.classList.add('tv-card')

  topo.chips.forEach(function (chipName, i) {
    // Chip wrapper div
    const wrapper = document.createElement('div')
    wrapper.classList.add('tv-chip-wrapper')
    wrapper.dataset.chipIndex = String(i)

    // Label
    const label = document.createElement('div')
    label.classList.add('tv-chip-label')
    label.textContent = (topo.labels && topo.labels[i]) || ('Chip ' + i)
    wrapper.appendChild(label)

    // Canvas — dimensions come from options if provided, else sensible defaults
    const canvas = document.createElement('canvas')
    canvas.width  = self._options.chipWidth  || 340
    canvas.height = self._options.chipHeight || 240
    wrapper.appendChild(canvas)

    container.appendChild(wrapper)
    self._chipEls.push(wrapper)

    // Resolve chip topology and build a TensixViz for it.
    // Callers can invoke activate('idle') explicitly if they want the RAF loop.
    const chipTopo = loadTopology(chipName)
    const viz = new TensixViz(canvas, { arch: chipTopo.arch })
    self._chips.push(viz)

    // ETH link divider between chips (except after last)
    if (i < topo.chips.length - 1) {
      const link = document.createElement('div')
      link.classList.add('tv-card-link')
      link.title = 'Intra-card ETH link'
      container.appendChild(link)
    }
  })
}

/**
 * Activate a named animation mode on every chip simultaneously.
 * Chips are staggered by 120 ms so the visual cascade is apparent.
 *
 * @param {string} mode  - Any mode accepted by TensixViz.activate()
 */
CardViz.prototype.activate = function (mode) {
  if (this._destroyed) return
  this._chips.forEach(function (chip, i) {
    setTimeout(function () { chip.activate(mode) }, i * 120)
  })
}

/**
 * Reset all chip visualizations to their blank initial state.
 */
CardViz.prototype.reset = function () {
  if (this._destroyed) return
  this._chips.forEach(function (chip) { chip.reset() })
}

/**
 * Add/remove a CSS highlight class from chip wrapper elements by index.
 *
 * @param {number[]} indices  - Array of chip indices to highlight (others are un-highlighted)
 */
CardViz.prototype.highlight = function (indices) {
  if (this._destroyed) return
  const self = this
  this._chipEls.forEach(function (el, i) {
    if (indices.indexOf(i) !== -1) {
      el.classList.add('tv-highlighted')
    } else {
      el.classList.remove('tv-highlighted')
    }
  })
}

/**
 * Zoom into a specific chip ('chip' level) or zoom back out to card view.
 * Returns a Promise that resolves after the CSS transition finishes (~300 ms).
 *
 * @param {string} level  - 'chip' to zoom in, anything else to zoom out
 * @param {object} [opts] - { index: number } when level === 'chip'
 * @returns {Promise<void>}
 */
CardViz.prototype.transitionTo = function (level, opts) {
  if (this._destroyed) return Promise.resolve()
  const self = this
  opts = opts || {}

  if (level === 'chip') {
    // Use != null instead of || to avoid treating index 0 as falsy
    const idx = opts.index != null ? opts.index : 0
    this._zoomed = idx
    this._chipEls.forEach(function (el, i) {
      if (i === idx) {
        el.classList.add('tv-active')
        el.classList.remove('tv-hidden')
      } else {
        el.classList.remove('tv-active')
        el.classList.add('tv-hidden')
      }
    })
    this._container.classList.add('tv-zoomed-in')
    this._showBreadcrumb('Card \u203a Chip ' + idx)
  } else {
    // Zoom out — restore all wrappers to normal visibility
    this._zoomed = -1
    this._chipEls.forEach(function (el) {
      el.classList.remove('tv-active')
      el.classList.remove('tv-hidden')
    })
    this._container.classList.remove('tv-zoomed-in')
    this._hideBreadcrumb()
  }

  return new Promise(function (resolve) { setTimeout(resolve, 300) })
}

/**
 * Insert (or update) a breadcrumb navigation bar at the top of the container.
 *
 * @param {string} text  - Breadcrumb text, e.g. 'Card › Chip 0'
 * @private
 */
CardViz.prototype._showBreadcrumb = function (text) {
  if (!this._breadcrumb) {
    this._breadcrumb = document.createElement('div')
    this._breadcrumb.classList.add('tv-breadcrumb')
    // Place it before the first child so it appears at the top
    this._container.insertBefore(this._breadcrumb, this._container.children[0])
  }
  this._breadcrumb.textContent = text
  this._breadcrumb.style.display = 'block'
}

/**
 * Hide the breadcrumb bar (it remains in the DOM so it can be shown again quickly).
 * @private
 */
CardViz.prototype._hideBreadcrumb = function () {
  if (this._breadcrumb) this._breadcrumb.style.display = 'none'
}

/**
 * Tear down this CardViz instance. Stops all chip animations and removes every
 * child element from the container so it is completely empty afterwards.
 *
 * After destroy() the instance must not be used.
 */
CardViz.prototype.destroy = function () {
  this._destroyed = true
  // Stop all chip animations before clearing references
  this._chips.forEach(function (chip) { chip.reset() })
  this._chips   = []
  this._chipEls = []
  this._breadcrumb = null
  // Use the standard DOM API to remove all children in a single call
  this._container.replaceChildren()
}
