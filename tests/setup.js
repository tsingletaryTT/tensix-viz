// tests/setup.js
// Mock browser globals so tests can run in Node.js without jsdom.

class MockCanvas {
  constructor() { this._w = 400; this._h = 300; this.style = {} }
  get width()  { return this._w }
  set width(v) { this._w = Number(v) }
  get height()  { return this._h }
  set height(v) { this._h = Number(v) }
  getContext() {
    return {
      clearRect: () => {}, fillRect: () => {}, beginPath: () => {},
      moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
      closePath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {},
      save: () => {}, restore: () => {}, scale: () => {},
      setLineDash: () => {}, fillText: () => {},
      measureText: () => ({ width: 50 }),
      fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
      font: '', textAlign: '', textBaseline: '',
      shadowColor: '', shadowBlur: 0,
    }
  }
}

class MockElement {
  constructor(tag) {
    this._tag = tag
    this._children = []
    this.style = {}
    this.dataset = {}
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c),
    }
    this.innerHTML = ''
    if (tag === 'canvas') Object.assign(this, new MockCanvas())
  }
  appendChild(child) { this._children.push(child); return child }
  querySelectorAll(sel) { return [] }
  querySelector(sel) { return null }
  get children() { return this._children }
  addEventListener() {}
  removeEventListener() {}
}

globalThis.HTMLCanvasElement = MockCanvas

globalThis.document = {
  createElement: (tag) => new MockElement(tag),
  querySelectorAll: () => [],
  readyState: 'complete',
  addEventListener: () => {},
}

globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.performance = { now: () => Date.now() }
globalThis.window = {
  devicePixelRatio: 1,
  TensixViz: undefined, CardViz: undefined,
  SystemViz: undefined, ClusterViz: undefined,
}
