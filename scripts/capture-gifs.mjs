/**
 * capture-gifs.mjs
 *
 * Generates animated GIFs for the README by:
 *  1. Opening each widget in headless Chromium via Playwright
 *  2. Capturing frames at the specified fps
 *  3. Encoding a looping GIF via ffmpeg (two-pass palettegen → paletteuse)
 *
 * Usage:
 *   node scripts/capture-gifs.mjs [gif-name ...]
 *
 * Without arguments, all GIFs in GIFS are regenerated.
 * With arguments, only the named GIFs are regenerated:
 *   node scripts/capture-gifs.mjs chip themes
 */

import { chromium }                       from 'playwright'
import { execFileSync }                   from 'child_process'
import { mkdirSync, rmSync, existsSync,
         statSync }                       from 'fs'
import { fileURLToPath }                  from 'url'
import { dirname, join }                  from 'path'

const __filename  = fileURLToPath(import.meta.url)
const __dirname   = dirname(__filename)
const ROOT        = join(__dirname, '..')
const ASSETS_DIR  = join(ROOT, 'docs', 'assets')
const FRAMES_DIR  = join(__dirname, '.frames-tmp')
const CAPTURE_URL = `file://${join(__dirname, 'capture.html')}`

/* ── GIF specifications ─────────────────────────────────────────────────── */

const GIFS = [
  {
    name:     'chip',
    // BH chip in thinking mode: sustained full-grid glow — clean and striking
    params:   { type: 'chip', arch: 'blackhole', mode: 'thinking' },
    fps:      12,
    seconds:  4,
    warmupMs: 600,
    maxWidth: 340,
  },
  {
    name:     'card',
    // P300c card in inference mode: column sweep across 2 chips
    params:   { type: 'card', config: 'bh-p300c', mode: 'inference' },
    fps:      12,
    seconds:  4,
    warmupMs: 600,
    maxWidth: 720,
  },
  {
    name:     'system',
    // QB2 in agents mode: random burst clusters across 4 chips
    params:   { type: 'system', config: 'qb2', mode: 'agents' },
    fps:      10,
    seconds:  4,
    warmupMs: 800,
    maxWidth: 720,
  },
  {
    name:     'cluster',
    // Galaxy BH in explore mode: sinusoidal wave across 32 chips
    params:   { type: 'cluster', config: 'bh-galaxy', mode: 'explore' },
    fps:      10,
    seconds:  5,
    warmupMs: 1200,
    maxWidth: 700,
  },
  {
    name:     'themes',
    // Dark + Light side-by-side chip comparison
    params:   { type: 'themes', arch: 'blackhole', mode: 'thinking' },
    fps:      12,
    seconds:  4,
    warmupMs: 600,
    maxWidth: 680,
  },
  {
    name:     'kernel',
    // Metalium kernel dispatch — rectangular core grids lighting up via NOC multicast
    params:   { type: 'chip', arch: 'blackhole', mode: 'kernel_dispatch' },
    fps:      12,
    seconds:  5,
    warmupMs: 1000,  // wait for a few kernel dispatches to appear before recording
    maxWidth: 340,
  },
]

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Build the capture page URL with the given query params.
 * @param {Record<string,string|number>} params
 * @returns {string}
 */
function buildUrl(params) {
  return `${CAPTURE_URL}?${new URLSearchParams(params).toString()}`
}

/**
 * Wipe and recreate a directory.
 * @param {string} dir
 */
function resetDir(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

/**
 * Encode a directory of PNG frames into a looping GIF using ffmpeg.
 *
 * Uses a two-pass approach:
 *   Pass 1 — palettegen: analyse all frames, build a 64-colour palette
 *   Pass 2 — paletteuse: encode with Bayer dithering + diff_mode for small GIFs
 *
 * @param {string} framesDir  - Directory containing frame-NNNN.png files
 * @param {string} outputPath - Destination .gif path
 * @param {number} fps        - Frames per second
 * @param {number} maxWidth   - Downscale if wider than this (keeps aspect ratio)
 */
function encodeGif(framesDir, outputPath, fps, maxWidth) {
  const framePattern = join(framesDir, 'frame-%04d.png')

  // Downscale to maxWidth if needed; ensure even dimensions (required by GIF codec).
  const scale =
    `scale='min(${maxWidth},iw)':'trunc(min(${maxWidth},iw)*ih/iw/2)*2':flags=lanczos`

  // Single-pass: split → palettegen + paletteuse in one filter_complex graph.
  // This avoids two-file reconfig bugs in ffmpeg's -lavfi when frame dims are odd.
  execFileSync('ffmpeg', [
    '-y',
    '-framerate', String(fps),
    '-i',         framePattern,
    '-filter_complex',
    `[0:v]${scale},split[a][b];[a]palettegen=max_colors=64:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-loop',      '0',
    outputPath,
  ], { stdio: 'pipe' })
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  // Determine which GIFs to generate from CLI args
  const requested = process.argv.slice(2)
  const targets   = requested.length
    ? GIFS.filter(g => requested.includes(g.name))
    : GIFS

  if (requested.length && targets.length === 0) {
    console.error(`Unknown GIF name(s): ${requested.join(', ')}`)
    console.error(`Available: ${GIFS.map(g => g.name).join(', ')}`)
    process.exit(1)
  }

  mkdirSync(ASSETS_DIR, { recursive: true })

  const browser = await chromium.launch()

  for (const spec of targets) {
    console.log(`\n▶  ${spec.name}`)

    const framesDir  = join(FRAMES_DIR, spec.name)
    const outputPath = join(ASSETS_DIR, `${spec.name}.gif`)

    resetDir(framesDir)

    /* Open capture page */
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.goto(buildUrl(spec.params), { waitUntil: 'domcontentloaded' })

    /* Wait for widget script to finish initialising */
    await page.waitForFunction(() => window.__captureReady === true, { timeout: 5_000 })

    /* Warm-up: let animation settle before recording */
    console.log(`   warming up ${spec.warmupMs} ms…`)
    await page.waitForTimeout(spec.warmupMs)

    /* Capture frames */
    const frameCount = Math.round(spec.fps * spec.seconds)
    const intervalMs = Math.round(1000 / spec.fps)
    const widget     = page.locator('#widget')

    console.log(`   capturing ${frameCount} frames at ${spec.fps} fps…`)
    for (let i = 0; i < frameCount; i++) {
      const framePath = join(framesDir, `frame-${String(i).padStart(4, '0')}.png`)
      await widget.screenshot({ path: framePath })
      if (i < frameCount - 1) await page.waitForTimeout(intervalMs)
    }

    await page.close()

    /* Encode GIF */
    console.log(`   encoding → ${outputPath}`)
    encodeGif(framesDir, outputPath, spec.fps, spec.maxWidth)

    const kb = (statSync(outputPath).size / 1024).toFixed(0)
    console.log(`   ✓  ${kb} KB  →  docs/assets/${spec.name}.gif`)
  }

  await browser.close()

  /* Clean up temp frames */
  if (existsSync(FRAMES_DIR)) rmSync(FRAMES_DIR, { recursive: true, force: true })

  console.log('\n✓  All GIFs written to docs/assets/\n')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
