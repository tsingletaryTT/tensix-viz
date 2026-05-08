// src/system.js
import { CardViz } from './card.js'
import { loadTopology } from './topology.js'

/**
 * SystemViz — renders a multi-card system (QB2: 2 cards, T3000: 4 cards).
 * Each card is a CardViz instance in its own wrapper div inside the container.
 *
 * Layout is driven by the topology JSON:
 *   qb2   → 2 × bh-p300c cards, vertical layout, Samtec inter-card link
 *   t3000 → 4 × wh-n300 cards, 2×4 grid layout, 2D mesh inter-card links
 *
 * @param {HTMLElement} container       - The div that SystemViz owns
 * @param {string|object} config        - Topology name ('qb2', 't3000') or inline config object
 */
export function SystemViz(container, config) {
  this._container  = container
  this._topo       = loadTopology(config)
  this._cards      = []    // CardViz instances, one per card in topo.cards
  this._cardEls    = []    // wrapper divs, one per card
  this._breadcrumb = null  // breadcrumb nav bar element, created lazily
  this._destroyed  = false
  this._init()
}

/**
 * Build the DOM structure: one wrapper div per card (with a label), plus
 * link divider elements between cards when inter_links are defined.
 * A CardViz instance is created for each card wrapper.
 * @private
 */
SystemViz.prototype._init = function () {
  const self      = this
  const topo      = this._topo
  const container = this._container

  // Mark the container so CSS can target .tv-system for layout rules
  container.classList.add('tv-system')

  if (!Array.isArray(topo.cards)) {
    throw new Error('SystemViz requires a system-level topology with a "cards" array (e.g. "qb2", "t3000")')
  }

  topo.cards.forEach(function (cardName, i) {
    // Card wrapper div — holds the label and the CardViz subtree
    const wrapper = document.createElement('div')
    wrapper.classList.add('tv-card-wrapper')
    // data-card-index lets CSS and JS target individual cards by position
    wrapper.dataset.cardIndex = String(i)

    // Human-readable label above the card visualization
    const label = document.createElement('div')
    label.classList.add('tv-system-card-label')
    label.textContent = (topo.labels && topo.labels[i]) || ('Card ' + i)
    wrapper.appendChild(label)

    container.appendChild(wrapper)
    self._cardEls.push(wrapper)

    // Each card gets its own CardViz; callers call activate() explicitly
    const card = new CardViz(wrapper, cardName)
    self._cards.push(card)

    // Insert an inter-card link divider between consecutive cards.
    // Only when the topology defines inter_links and this is not the last card.
    if (i < topo.cards.length - 1 && topo.inter_links && topo.inter_links.length) {
      const link = document.createElement('div')
      link.classList.add('tv-system-link')
      // Use the first link definition's label, connector, or topology field
      const linkDef = topo.inter_links[0]
      link.textContent = linkDef.label || (linkDef.connector || linkDef.topology || 'link')
      container.appendChild(link)
    }
  })
}

/**
 * Activate a named animation mode on every card (and their chips) simultaneously.
 * Cards are staggered by 150 ms so a cascade effect is visible.
 *
 * @param {string} mode  - Any mode accepted by CardViz.activate()
 */
SystemViz.prototype.activate = function (mode) {
  if (this._destroyed) return
  this._cards.forEach(function (card, i) {
    setTimeout(function () { card.activate(mode) }, i * 150)
  })
}

/**
 * Reset all card (and chip) visualizations to their blank initial state.
 */
SystemViz.prototype.reset = function () {
  if (this._destroyed) return
  this._cards.forEach(function (card) { card.reset() })
}

/**
 * Add/remove a CSS highlight class from card wrapper elements by index.
 *
 * @param {number[]} indices  - Card indices to highlight; all others are un-highlighted
 */
SystemViz.prototype.highlight = function (indices) {
  if (this._destroyed) return
  this._cardEls.forEach(function (el, i) {
    if (indices.indexOf(i) !== -1) el.classList.add('tv-highlighted')
    else el.classList.remove('tv-highlighted')
  })
}

/**
 * Zoom into a card ('card' level), into a chip within a card ('chip' level),
 * or zoom back out to system level (any other value).
 * Returns a Promise that resolves after the CSS transition finishes (~300 ms).
 *
 * @param {string} level  - 'card' | 'chip' | anything else (system zoom-out)
 * @param {object} [opts]
 *   - level === 'card' → { index: number }       card to zoom into
 *   - level === 'chip' → { card: number, chip: number }
 * @returns {Promise<void>}
 */
SystemViz.prototype.transitionTo = function (level, opts) {
  if (this._destroyed) return Promise.resolve()
  opts = opts || {}

  if (level === 'card') {
    // Use != null instead of || to avoid treating index 0 as falsy
    const idx = opts.index != null ? opts.index : 0
    this._cardEls.forEach(function (el, i) {
      if (i === idx) {
        el.classList.add('tv-active')
        el.classList.remove('tv-hidden')
      } else {
        el.classList.remove('tv-active')
        el.classList.add('tv-hidden')
      }
    })
    this._container.classList.add('tv-zoomed-in')
    this._showBreadcrumb('System \u203a Card ' + idx)
    return new Promise(function (resolve) { setTimeout(resolve, 300) })
  }

  if (level === 'chip') {
    // Zoom to card first, then delegate the chip zoom to that card's CardViz
    const cardIdx = opts.card != null ? opts.card : 0
    const chipIdx = opts.chip != null ? opts.chip : 0
    return this.transitionTo('card', { index: cardIdx }).then(function () {
      if (this._destroyed) return
      return this._cards[cardIdx].transitionTo('chip', { index: chipIdx })
    }.bind(this))
  }

  // Zoom out — restore all card wrappers to normal visibility
  this._cardEls.forEach(function (el) {
    el.classList.remove('tv-active')
    el.classList.remove('tv-hidden')
  })
  this._container.classList.remove('tv-zoomed-in')
  this._hideBreadcrumb()
  // Also reset any card-level chip zoom inside each card; resolve when all finish
  const resets = this._cards.map(function (card) { return card.transitionTo('system') })
  return Promise.all(resets)
}

/**
 * Insert (or update) a breadcrumb navigation bar at the top of the container.
 *
 * @param {string} text  - Breadcrumb text, e.g. 'System › Card 0'
 * @private
 */
SystemViz.prototype._showBreadcrumb = function (text) {
  if (!this._breadcrumb) {
    this._breadcrumb = document.createElement('div')
    this._breadcrumb.classList.add('tv-breadcrumb')
    // Place before the first child so it appears at the very top
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
 * Hide the breadcrumb bar (kept in the DOM so it can be shown again quickly).
 * @private
 */
SystemViz.prototype._hideBreadcrumb = function () {
  if (this._breadcrumb) this._breadcrumb.style.display = 'none'
}

/**
 * Tear down this SystemViz instance. Destroys all CardViz children and removes
 * every child element from the container so it is completely empty afterwards.
 *
 * After destroy() the instance must not be used.
 */
SystemViz.prototype.destroy = function () {
  this._destroyed = true
  // Destroy each CardViz — this stops chip animations and clears card DOM
  this._cards.forEach(function (card) { card.destroy() })
  this._cards      = []
  this._cardEls    = []
  this._breadcrumb = null
  // Remove all children in a single call via the standard DOM API
  this._container.replaceChildren()
}
