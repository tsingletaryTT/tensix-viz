# tensix-viz — project notes for Claude

Zero-dependency Canvas visualizer for Tenstorrent hardware (chip → card →
system → cluster). Source in `src/`, bundled by `npm run build` into the repo
root **and copied into `docs/`** (GitHub Pages serves `docs/`). Always rebuild
after touching `src/` or `tensix-viz.css`, or the site keeps the old bundle.

* Tests: `npm test` (vitest, Node + hand-rolled DOM mocks in `tests/setup.js`;
  no real layout, so `clientWidth` must be set by hand in tests).
* Local site preview: `.claude/launch.json` → `python3 -m http.server 8765 --directory docs`.

## Sizing contract (learned the hard way)
`TensixViz` sizes its drawing buffer **once**, at construction, capped to
`parentElement.clientWidth`. That measurement is only safe when the parent's
width doesn't depend on siblings still being built. Multi-chip layouts
(`CardViz`) pass `fitContainer: false` and let CSS fit them. After
construction, the canvas scales via CSS (`max-width: 100%`, `height: auto`,
`aspect-ratio`) — never set an inline pixel height, or shrinking distorts it.

## Session log
* **2026-09-28 (1.3.1)** — Prompt: "the website for this repo is cutting off
  widgets all over the place." Audited both pages in the browser at
  375/768/1009px by scanning for elements past the viewport edge. Found three
  separate causes: build-order chip sizing in `CardViz`, inline px height
  squishing CSS-shrunk canvases, and `1fr` grid tracks that couldn't shrink
  below a `<pre>`. Fixed in the library (not just the site) so downstream
  consumers (QB2 welcome pages, VS Code lessons) get it too. Tests written red
  first.
