// build.js
import esbuild from 'esbuild'
import { copyFileSync } from 'fs'

async function build() {
  const shared = {
    entryPoints: ['src/index.js'],
    bundle: true,
    loader: { '.json': 'json' },
    sourcemap: false,
    minify: false,
  }

  // IIFE: all classes on window.*
  await esbuild.build({
    ...shared,
    format: 'iife',
    globalName: '_TensixVizBundle',
    outfile: 'tensix-viz.js',
    footer: {
      js: [
        'window.TensixViz  = _TensixVizBundle.TensixViz;',
        'window.CardViz    = _TensixVizBundle.CardViz;',
        'window.SystemViz  = _TensixVizBundle.SystemViz;',
        'window.ClusterViz = _TensixVizBundle.ClusterViz;',
      ].join('\n'),
    },
  })

  // ESM: named exports for bundlers
  await esbuild.build({
    ...shared,
    format: 'esm',
    outfile: 'tensix-viz.esm.js',
  })

  // Copy build artifacts + CSS into docs/ so GitHub Pages (served from /docs) stays in sync
  for (const file of ['tensix-viz.js', 'tensix-viz.esm.js', 'tensix-viz.css']) {
    copyFileSync(file, `docs/${file}`)
  }

  console.log('Build complete: tensix-viz.js + tensix-viz.esm.js (copied to docs/)')
}

build().catch(err => { console.error(err); process.exit(1) })
