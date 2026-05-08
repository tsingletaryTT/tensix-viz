// src/index.js — bundle entry point
export { TensixViz } from './chip.js'
export { CardViz }   from './card.js'
export { SystemViz } from './system.js'
export { ClusterViz } from './cluster.js'

import { TensixViz } from './chip.js'
import { CardViz }   from './card.js'
import { SystemViz } from './system.js'
import { ClusterViz } from './cluster.js'

/**
 * autoInit — scans the DOM for:
 *   - [data-viz] elements (new API)
 *   - .tensix-viz-container elements (legacy TensixViz API, unchanged behavior)
 *
 * For [data-viz] elements, the `data-viz` attribute selects the viz type:
 *   "chip"    => TensixViz (expects a <canvas> element)
 *   "card"    => CardViz
 *   "system"  => SystemViz
 *   "cluster" => ClusterViz
 *
 * Optional attributes on the element:
 *   data-config / data-arch  — architecture/config string (default: 'bh-chip')
 *   data-mode                — initial mode string (default: 'idle')
 *
 * The instantiated viz is stored on `el._tensixViz` for programmatic access.
 */
export function autoInit() {
  // Guard: only run in a real (or mocked) document context
  if (typeof document === 'undefined') return

  // New API: [data-viz] attribute
  document.querySelectorAll('[data-viz]').forEach(function (el) {
    const type   = el.dataset.viz
    const config = el.dataset.config != null ? el.dataset.config
                 : el.dataset.arch   != null ? el.dataset.arch
                 : 'bh-chip'
    const mode   = el.dataset.mode != null ? el.dataset.mode : 'idle'

    try {
      let viz
      switch (type) {
        case 'chip':
          // data-viz="chip" targets a <canvas> element directly
          viz = new TensixViz(el, { arch: config })
          viz.activate(mode)
          break
        case 'card':
          viz = new CardViz(el, config)
          viz.activate(mode)
          break
        case 'system':
          viz = new SystemViz(el, config)
          viz.activate(mode)
          break
        case 'cluster':
          viz = new ClusterViz(el, config)
          viz.activate(mode)
          break
        // Unknown type values are silently ignored
      }
      // Store a reference on the element for later programmatic access
      if (viz) el._tensixViz = viz
    } catch (err) {
      console.warn('[tensix-viz] autoInit failed for element', el, err)
    }
  })

  // Legacy API: .tensix-viz-container (delegates to TensixViz.autoInit)
  TensixViz.autoInit()
}

// Auto-run when the DOM is ready — browser context only.
// Guard on window.document (not just window) — test environments set a minimal
// globalThis.window stub without a .document property, so this correctly
// does not fire in Node/test environments.
if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
  if (document.readyState === 'loading') {
    // DOM not yet ready — wait for it
    document.addEventListener('DOMContentLoaded', autoInit)
  } else {
    // DOM already ready — defer to next microtask so page scripts run first
    Promise.resolve().then(autoInit)
  }
}
