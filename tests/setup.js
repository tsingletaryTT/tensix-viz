// tests/setup.js
// Mock browser globals so tests can run in Node.js without jsdom.

// 2D context stub — all methods are no-ops, properties are plain values.
function makeMockContext() {
  return {
    clearRect: () => {}, fillRect: () => {}, beginPath: () => {},
    moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
    closePath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {},
    save: () => {}, restore: () => {}, scale: () => {},
    translate: () => {}, rotate: () => {}, transform: () => {}, setTransform: () => {},
    setLineDash: () => {}, fillText: () => {}, rect: () => {}, clip: () => {},
    ellipse: () => {}, drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    measureText: () => ({ width: 50 }),
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0,
  }
}

// Canvas element — works as both a standalone canvas and as a child element.
class MockCanvasElement {
  constructor() {
    this._tag = 'canvas'
    this._w = 400
    this._h = 300
    this.style = {}
    this.dataset = {}
    this.classList = makeClassList()
    this.innerHTML = ''
    this._children = []
  }
  get width()  { return this._w }
  set width(v) { this._w = Number(v) }
  get height()  { return this._h }
  set height(v) { this._h = Number(v) }
  getContext() { return makeMockContext() }
  appendChild(child) { this._children.push(child); return child }
  querySelectorAll() { return [] }
  querySelector() { return null }
  get children() { return this._children }
  addEventListener() {}
  removeEventListener() {}
  replaceChildren(...newChildren) {
    this._children = [...newChildren]
  }
}

// Generic DOM element.
class MockElement {
  constructor(tag) {
    this._tag = tag
    this._children = []
    this.style = {}
    this.dataset = {}
    this.classList = makeClassList()
    this.innerHTML = ''
  }
  appendChild(child) { this._children.push(child); return child }
  insertBefore(newChild, ref) {
    const idx = ref ? this._children.indexOf(ref) : -1
    if (idx === -1) this._children.push(newChild)
    else this._children.splice(idx, 0, newChild)
    return newChild
  }
  querySelectorAll() { return [] }
  querySelector() { return null }
  get children() { return this._children }
  addEventListener() {}
  removeEventListener() {}
  replaceChildren(...newChildren) {
    this._children = [...newChildren]
  }
  remove() {
    // no-op in isolation; parent would need to splice
  }
}

function makeClassList() {
  const classes = new Set()
  return {
    _classes: classes,
    add:     (...cs) => cs.forEach(c => classes.add(c)),
    remove:  (...cs) => cs.forEach(c => classes.delete(c)),
    contains:(c) => classes.has(c),
    toggle:  (c, force) => {
      if (force === undefined ? classes.has(c) : !force) classes.delete(c)
      else classes.add(c)
    },
  }
}

globalThis.HTMLCanvasElement = MockCanvasElement

globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? new MockCanvasElement() : new MockElement(tag),
  querySelectorAll: () => [],
  readyState: 'complete',
  addEventListener: () => {},
}

globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
// Do NOT overwrite globalThis.performance — Node.js already provides a correct monotonic clock.
// Only set it if it's missing (e.g., very old Node or certain test environments).
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() }
}
globalThis.window = {
  devicePixelRatio: 1,
  TensixViz: undefined, CardViz: undefined,
  SystemViz: undefined, ClusterViz: undefined,
  addEventListener: () => {},
  removeEventListener: () => {},
}
