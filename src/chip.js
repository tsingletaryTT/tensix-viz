'use strict';
// tensix-viz.js — Tenstorrent Tensix Grid Visualizer
// Self-contained Canvas renderer. No build step, no framework.
// Usage: new TensixViz(canvasElement, { arch: 'wormhole' })
// ES module — export: TensixViz (named + default)

  // ─── Chip topology definitions ─────────────────────────────────────────────
  // Each chip has a full grid (cols × rows). Core types:
  //   'tensix'   — programmable compute core (the main teaching subject)
  //   'dram'     — DRAM controller (memory bandwidth)
  //   'eth'      — ethernet link (inter-chip NOC)
  //   'pcie'     — host PCIe bridge
  //   'empty'    — harvested or unused

  const CHIPS = {
    wormhole: {
      label: 'Wormhole (N150/N300)',
      cols: 10,
      rows: 12,
      // Actual Wormhole NOC grid: 10 cols (x=0..9) × 12 rows (y=0..11).
      // ETH:    full rows 0 and 6 (10 ETH cores each row, 20 total)
      // DRAM:   cols 0 and 5 at all non-ETH rows (y=1-5, 7-11 → 20 DRAM cells)
      // Tensix: cols 1-4 and 6-9 at all non-ETH rows (8 × 10 = 80 compute cores)
      coreType(col, row) {
        if (row === 0 || row === 6)  return 'eth';
        if (col === 0 || col === 5)  return 'dram';
        return 'tensix';
      },
      // Bounding rectangle covering all Tensix/DRAM/ETH within the active grid.
      // Note: col 5 (DRAM) and row 6 (ETH) fall inside this rectangle — they
      // render with their correct core-type styling via coreType().
      computeGrid: { colStart: 1, colEnd: 9, rowStart: 1, rowEnd: 11 }, // inclusive
    },
    blackhole: {
      label: 'Blackhole (P100/P150/P300c)',
      cols: 17,
      rows: 12,
      coreType(col, row) {
        if (row === 0 || row === 11) return 'dram';
        if (col === 0 || col === 16) return 'eth';
        if (col === 8)               return 'pcie';
        if (row >= 1 && row <= 10)   return 'tensix';
        return 'empty';
      },
      computeGrid: { colStart: 1, colEnd: 15, rowStart: 1, rowEnd: 10 },
    },
  };

  // ─── Theme ─────────────────────────────────────────────────────────────────
  // THEME_DARK — improved contrast (border #3A7A8C gives clear delta from fill #163848)
  const THEME_DARK = {
    bg:            '#0B1E28',
    grid:          '#1A3C47',
    tensix:        '#163848',
    tensixBorder:  '#3A7A8C',
    tensixActive:  '#4FD1C5',
    tensixPulse:   '#81E6D9',
    dram:          '#152035',
    dramBorder:    '#2D4A6A',
    eth:           '#221638',
    ethBorder:     '#5B3DA0',
    pcie:          '#2A2010',
    pcieBorder:    '#8B6914',
    empty:         '#0A1820',
    text:          '#E8F0F2',
    textMuted:     '#607D8B',
    teal:          '#4FD1C5',
    tealLight:     '#81E6D9',
    pink:          '#EC96B8',
    gold:          '#F4C471',
    green:         '#27AE60',
    red:           '#FF6B6B',
    particle:      '#4FD1C5',
    heatLow:       '#163848',
    heatMid:       '#F4C471',
    heatHigh:      '#FF6B6B',
    heatLowRgb:    [22,  56,  72],
    heatMidRgb:    [244, 196, 113],
    heatHighRgb:   [255, 107, 107],
    nocLine:       'rgba(45,102,117,0.25)',
    floatLabelBg:  'rgba(13,31,45,0.88)',
    floatLabelFg:  '#81E6D9',
  };

  // THEME_LIGHT — Cool Slate palette (legible on light-background pages)
  const THEME_LIGHT = {
    bg:            '#EEF4F8',
    grid:          '#B8D4E0',
    tensix:        '#CCDDE8',
    tensixBorder:  '#6AACBE',
    tensixActive:  '#0D9488',
    tensixPulse:   '#0A7A70',
    dram:          '#C5D8E8',
    dramBorder:    '#5A9AB8',
    eth:           '#C5C5E0',
    ethBorder:     '#7070B8',
    pcie:          '#E0D8C8',
    pcieBorder:    '#A0906A',
    empty:         '#E4EDF4',
    text:          '#1A2C38',
    textMuted:     '#4A6878',
    teal:          '#0D9488',
    tealLight:     '#0A7A70',
    pink:          '#B01060',
    gold:          '#B45309',
    green:         '#15803D',
    red:           '#DC2626',
    particle:      '#0D9488',
    heatLow:       '#CCDDE8',
    heatMid:       '#D97706',
    heatHigh:      '#DC2626',
    heatLowRgb:    [204, 221, 232],
    heatMidRgb:    [217, 119,   6],
    heatHighRgb:   [220,  38,  38],
    nocLine:       'rgba(70,140,160,0.35)',
    floatLabelBg:  'rgba(238,244,248,0.92)',
    floatLabelFg:  '#0A4A58',
  };

  // ─── Memory visualization colours ──────────────────────────────────────────
  // Used by _drawMemoryLayer() when showMemory: true.
  // Two palettes mirror THEME_DARK / THEME_LIGHT; color entries are [r, g, b]
  // arrays so the caller can compose rgba() strings with a variable alpha.
  const MEM_COLORS = {
    dark: {
      dram:  [  0, 210, 190],   // bright teal — DRAM row glow
      l1:    [255, 180,  50],   // warm amber  — L1 fill bar
      load:  [  0, 210, 190],   // teal        — DRAM→L1 read particles
      burst: [255, 200,  80],   // gold        — prefetch / burst load
      write: [220,  80, 160],   // vivid pink  — L1→DRAM writeback particles
    },
    light: {
      dram:  [  0, 140, 130],   // deeper teal
      l1:    [160,  80,  10],   // darker amber
      load:  [  0, 140, 130],
      burst: [190, 130,   0],   // darker gold
      write: [180,  40, 120],   // deeper rose
    },
  };

  // ─── Memory signal presets (per animation mode) ─────────────────────────────
  // Fields:
  //   dram_bw   0–1  DRAM row glow intensity + read particle density
  //   l1_fill   0–1  L1 fill bar height (fraction of cell height)
  //   burst     bool periodic burst envelope (true) vs. gentle steady breath (false)
  //   burstHz   num  bursts per second; only used when burst: true
  //              'kd' means burst is event-driven by kernel_dispatch _kd state
  //   writeback 0–1  writeback particle density (L1→DRAM direction)
  //   loadColor str  'load' | 'burst'  dominant read particle color key in MEM_COLORS
  const MEM_PRESETS = {
    idle:            { dram_bw: 0.05, l1_fill: 0.02, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    inference:       { dram_bw: 0.55, l1_fill: 0.45, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    prefill:         { dram_bw: 0.90, l1_fill: 0.85, burst: true,  burstHz: 0.5, writeback: 0.20, loadColor: 'burst' },
    thinking:        { dram_bw: 0.12, l1_fill: 0.92, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    agents:          { dram_bw: 0.45, l1_fill: 0.40, burst: true,  burstHz: 0.8, writeback: 0,    loadColor: 'load'  },
    diffusion:       { dram_bw: 0.65, l1_fill: 0.60, burst: true,  burstHz: 1.2, writeback: 0,    loadColor: 'load'  },
    video:           { dram_bw: 0.70, l1_fill: 0.65, burst: true,  burstHz: 1.6, writeback: 0,    loadColor: 'load'  },
    batch:           { dram_bw: 0.80, l1_fill: 0.60, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    explore:         { dram_bw: 0.30, l1_fill: 0.35, burst: false, burstHz: 0,   writeback: 0,    loadColor: 'load'  },
    kernel_dispatch: { dram_bw: 0.15, l1_fill: 0.55, burst: true,  burstHz: 'kd', writeback: 0.50, loadColor: 'burst' },
  };

  // ─── TensixViz class ───────────────────────────────────────────────────────
  function TensixViz(canvas, opts) {
    opts = opts || {};
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.arch    = opts.arch || 'wormhole';
    this.speed   = opts.speed || 1.0;
    this.chip    = CHIPS[this.arch] || CHIPS.wormhole;

    this._highlights = {};   // key: "col,row" → { color, alpha, label }
    this._particles  = [];   // active NOC transfer animations
    this._heatmap    = null; // 2D array or null
    this._labels     = {};   // key: "col,row" → string

    this._scriptQueue = [];
    this._running     = false;
    this._stepMode    = false;
    this._rafId       = null;
    this._animGen     = 0;      // incremented on reset(); guards stale async callbacks
    this._resolveStep = null;
    this._floatLabelData = null;  // floating label data, cleared by reset() and unhighlight
    this._loop           = false; // whether activate/play should loop on completion
    this._loopScript     = null;  // script to replay when _loop is true
    this._showMemory  = !!(opts.showMemory);  // true → render memory layer each frame
    this._memOverride = null;                  // set by setMemoryStats(); null = use preset
    this._currentMode = null;                  // set by activate(); used by _drawMemoryLayer

    this._cellW   = 0;
    this._cellH   = 0;
    this._padX    = 0;
    this._padY    = 0;
    this._dram    = [];   // array of { col, row } for every dram-type cell
    this._compute = [];   // array of { col, row } for every tensix-type cell

    // Store logical (CSS-pixel) dimensions before any DPR scaling so
    // _computeLayout and render() always work in CSS-pixel coordinates.
    this._logicalW = canvas.width;
    this._logicalH = canvas.height;

    // Scale the canvas buffer up by devicePixelRatio so it renders crisply
    // on HiDPI / Retina screens (VSCode webview, high-DPI monitors).
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (dpr > 1) {
      canvas.width        = Math.round(this._logicalW * dpr);
      canvas.height       = Math.round(this._logicalH * dpr);
      canvas.style.width  = this._logicalW + 'px';
      canvas.style.height = this._logicalH + 'px';
      this.ctx.scale(dpr, dpr);
    }

    this._computeLayout();
    this.render();
  }

  // ─── Theme resolution ──────────────────────────────────────────────────────
  // Walk up the DOM from the canvas to find the active theme class.
  // Returns THEME_DARK (default) or THEME_LIGHT.
  TensixViz.prototype._resolveTheme = function () {
    var node = this.canvas.parentElement;
    while (node) {
      if (node.classList && node.classList.contains('tv-light')) return THEME_LIGHT;
      if (node.classList && node.classList.contains('tv-auto')) {
        return (typeof window !== 'undefined' && window.matchMedia &&
                window.matchMedia('(prefers-color-scheme: light)').matches)
          ? THEME_LIGHT : THEME_DARK;
      }
      node = node.parentElement;
    }
    return THEME_DARK;
  };

  TensixViz.prototype._computeLayout = function () {
    const chip = this.chip;
    const pad = 8;
    // Use logical (CSS-pixel) dimensions — _logicalW/H are set before DPR scaling.
    const w = this._logicalW;
    const h = this._logicalH;
    this._padX  = pad;
    this._padY  = pad;
    this._cellW = Math.floor((w - pad * 2) / chip.cols);
    this._cellH = Math.floor((h - pad * 2) / chip.rows);

    // Build cell-type lists used by _drawMemoryLayer() for glow and particle spawning.
    // Populated once per layout so _drawMemoryLayer does not rebuild them each frame.
    this._dram    = [];
    this._compute = [];
    for (var row = 0; row < chip.rows; row++) {
      for (var col = 0; col < chip.cols; col++) {
        var t = chip.coreType(col, row);
        if (t === 'dram')   this._dram.push({ col: col, row: row });
        if (t === 'tensix') this._compute.push({ col: col, row: row });
      }
    }
  };

  // ─── Rendering ─────────────────────────────────────────────────────────────

  TensixViz.prototype.render = function () {
    this._theme = this._resolveTheme();  // cache for this render call
    const ctx  = this.ctx;
    const chip = this.chip;
    const lw   = this._logicalW;
    const lh   = this._logicalH;
    ctx.clearRect(0, 0, lw, lh);

    // Background
    ctx.fillStyle = this._theme.bg;
    ctx.fillRect(0, 0, lw, lh);

    // Draw each core cell
    for (let row = 0; row < chip.rows; row++) {
      for (let col = 0; col < chip.cols; col++) {
        this._drawCell(col, row);
      }
    }

    // Heatmap overlay
    if (this._heatmap) {
      this._drawHeatmap();
    }

    // Highlights overlay
    Object.entries(this._highlights).forEach(([key, hl]) => {
      const [col, row] = key.split(',').map(Number);
      this._drawHighlight(col, row, hl);
    });

    // Labels overlay
    Object.entries(this._labels).forEach(([key, text]) => {
      const [col, row] = key.split(',').map(Number);
      this._drawCellLabel(col, row, text);
    });

    // Particles
    this._particles.forEach(p => this._drawParticle(p));

    // Memory visualization layer (opt-in — DRAM glow, transfer streams, L1 bars)
    this._drawMemoryLayer();

    // NOC grid lines (subtle)
    this._drawNocLines();
  };

  TensixViz.prototype._cellRect = function (col, row) {
    const gap = 2;
    return {
      x: this._padX + col * this._cellW + gap / 2,
      y: this._padY + row * this._cellH + gap / 2,
      w: this._cellW - gap,
      h: this._cellH - gap,
    };
  };

  TensixViz.prototype._cellCenter = function (col, row) {
    const r = this._cellRect(col, row);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  TensixViz.prototype._drawCell = function (col, row) {
    const ctx  = this.ctx;
    const type = this.chip.coreType(col, row);
    const r    = this._cellRect(col, row);
    const T    = this._theme;

    let fill   = T[type]       || T.empty;
    let border = T[type + 'Border'] || fill;

    ctx.fillStyle = fill;
    this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.fill();

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.stroke();

    // Core type indicator (tiny label for non-tensix)
    if (type !== 'tensix' && type !== 'empty' && r.w > 14) {
      ctx.fillStyle = T.textMuted;
      ctx.font = `bold ${Math.max(7, r.w * 0.3)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labels = { dram: 'D', eth: 'E', pcie: 'P' };
      if (labels[type]) ctx.fillText(labels[type], r.x + r.w / 2, r.y + r.h / 2);
    }
  };

  TensixViz.prototype._drawNocLines = function () {
    const ctx  = this.ctx;
    const chip = this.chip;
    const cg   = chip.computeGrid;

    ctx.strokeStyle = this._theme.nocLine;
    ctx.lineWidth   = 0.5;
    ctx.setLineDash([2, 4]);

    // Horizontal NOC wires
    for (let row = cg.rowStart; row <= cg.rowEnd; row++) {
      const y = this._padY + row * this._cellH + this._cellH / 2;
      const x0 = this._padX + cg.colStart * this._cellW;
      const x1 = this._padX + (cg.colEnd + 1) * this._cellW;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }

    // Vertical NOC wires
    for (let col = cg.colStart; col <= cg.colEnd; col++) {
      const x = this._padX + col * this._cellW + this._cellW / 2;
      const y0 = this._padY + cg.rowStart * this._cellH;
      const y1 = this._padY + (cg.rowEnd + 1) * this._cellH;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    }

    ctx.setLineDash([]);
  };

  // ─── Memory visualization layer ────────────────────────────────────────────
  // Renders three sub-layers on top of the chip grid when this._showMemory is true:
  //   1. DRAM row glow  — alpha-tinted overlay on dram-type cells
  //   2. Transfer particles — read (DRAM→L1) and writeback (L1→DRAM) streams
  //   3. L1 fill bars  — thin bar at bottom of each tensix compute cell
  //
  // Visual values come from MEM_PRESETS[_currentMode] unless _memOverride is set.
  // Colors follow the resolved theme (dark or light).
  //
  // Early exit: returns immediately if showMemory is off OR _memPhase has not yet
  // been written by the animation loop (i.e. activate() hasn't ticked yet and no
  // manual override is being used in a pure-render scenario).
  TensixViz.prototype._drawMemoryLayer = function () {
    if (!this._showMemory || !this._memPhase) return;

    const ctx    = this.ctx;
    const chip   = this.chip;
    const cg     = chip.computeGrid;
    const T      = this._theme;
    const isDark = (T === THEME_DARK);
    const mc     = isDark ? MEM_COLORS.dark : MEM_COLORS.light;

    // ── Resolve effective dram_bw and l1_fill ─────────────────────────────────
    const mode   = this._currentMode || 'idle';
    const preset = MEM_PRESETS[mode] || MEM_PRESETS.idle;
    // _memPhase is guaranteed non-null by the early-exit guard above.
    const mem    = this._memPhase;

    // ── Envelope calculation ──────────────────────────────────────────────────
    // kernel_dispatch: envelope is the decayed DRAM-glow value from the KD state.
    // burst:           cosine wave tracking burstPhase (0 → 1 → 0 per cycle).
    // steady:          gentle sinusoidal breath around 0.85.
    let env;
    if (preset.burstHz === 'kd') {
      env = mem.kdGlow;
    } else if (preset.burst) {
      env = 0.5 + 0.5 * Math.cos(mem.burstPhase * Math.PI * 2);
    } else {
      env = 0.85 + 0.15 * Math.sin(mem.phase * Math.PI * 2);
    }

    const dramBw = (this._memOverride && this._memOverride.dram_bw !== undefined)
                   ? this._memOverride.dram_bw : preset.dram_bw;
    const l1Fill = (this._memOverride && this._memOverride.l1_fill !== undefined)
                   ? this._memOverride.l1_fill : preset.l1_fill;

    // ── 1. DRAM row glow ──────────────────────────────────────────────────────
    // Alpha is the raw product of bandwidth and envelope — no clamping — so very
    // low-bandwidth modes produce a near-invisible glow rather than a hard floor.
    const dramAlpha = dramBw * env * 0.55;
    if (dramAlpha > 0.005) {
      const dramColor = mc.dram;  // [r, g, b] array — renamed from dc to avoid collision with loop var dc
      ctx.save();
      ctx.globalAlpha = dramAlpha;
      ctx.fillStyle = 'rgb(' + dramColor[0] + ',' + dramColor[1] + ',' + dramColor[2] + ')';
      // Iterate this._dram directly (pre-built in _computeLayout) instead of
      // scanning the full grid on every frame — avoids O(cols*rows) coreType checks.
      for (let di = 0; di < this._dram.length; di++) {
        const dc = this._dram[di];  // renamed from dc2 now that dc (color) is dramColor
        const r = this._cellRect(dc.col, dc.row);
        this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── 2. Spawn transfer particles (DRAM→L1 reads and L1→DRAM writebacks) ───
    // Guard: only spawn when both cell lists are populated (no-op if topology has
    // no DRAM or no compute cells, which should never happen in practice).
    const spawnRate = dramBw * env;
    if (spawnRate > 0 && this._compute.length > 0 && this._dram.length > 0) {
      // Load particle: DRAM → compute (read direction)
      if (Math.random() < spawnRate * 0.3) {
        const fromCell     = this._dram[Math.floor(Math.random() * this._dram.length)];
        const toCell       = this._compute[Math.floor(Math.random() * this._compute.length)];
        const fromRect     = this._cellRect(fromCell.col, fromCell.row);
        const toRect       = this._cellRect(toCell.col, toCell.row);
        const loadColorArr = mc[preset.loadColor] || mc.load;
        this._particles.push({
          x:        fromRect.x + fromRect.w / 2,
          y:        fromRect.y + fromRect.h / 2,
          startX:   fromRect.x + fromRect.w / 2,
          startY:   fromRect.y + fromRect.h / 2,
          toX:      toRect.x + toRect.w / 2,
          toY:      toRect.y + toRect.h / 2,
          progress: 0,
          speed:    0.008 + Math.random() * 0.012,
          color:    'rgb(' + loadColorArr[0] + ',' + loadColorArr[1] + ',' + loadColorArr[2] + ')',
          radius:   1.5,
          alpha:    0.8,
          _isMem:   true,
        });
      }
      // Writeback particle: compute → DRAM (write direction), separate probability roll.
      if (preset.writeback > 0 && Math.random() < preset.writeback * spawnRate * 0.15) {
        const wbFrom       = this._compute[Math.floor(Math.random() * this._compute.length)];
        const wbTo         = this._dram[Math.floor(Math.random() * this._dram.length)];
        const wbFromRect   = this._cellRect(wbFrom.col, wbFrom.row);
        const wbToRect     = this._cellRect(wbTo.col,   wbTo.row);
        const writeColorArr = mc.write;
        this._particles.push({
          x:        wbFromRect.x + wbFromRect.w / 2,
          y:        wbFromRect.y + wbFromRect.h / 2,
          startX:   wbFromRect.x + wbFromRect.w / 2,
          startY:   wbFromRect.y + wbFromRect.h / 2,
          toX:      wbToRect.x + wbToRect.w / 2,
          toY:      wbToRect.y + wbToRect.h / 2,
          progress: 0,
          speed:    0.008 + Math.random() * 0.012,
          color:    'rgb(' + writeColorArr[0] + ',' + writeColorArr[1] + ',' + writeColorArr[2] + ')',
          radius:   1.5,
          alpha:    0.8,
          _isMem:   true,
        });
      }
    }

    // ── Advance memory particles and remove completed ones ────────────────────
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      if (!p._isMem) continue;
      p.progress = Math.min(1, p.progress + p.speed);
      p.x = p.startX + (p.toX - p.startX) * p.progress;
      p.y = p.startY + (p.toY - p.startY) * p.progress;
      if (p.progress >= 1) {
        this._particles.splice(i, 1);
      }
    }

    // ── 3. L1 fill bars ───────────────────────────────────────────────────────
    if (l1Fill > 0.01) {
      const lc = mc.l1;
      ctx.save();
      ctx.globalAlpha = 0.75;  // set once before the loop — avoids repeated property writes
      ctx.fillStyle = 'rgb(' + lc[0] + ',' + lc[1] + ',' + lc[2] + ')';
      for (let lrow = cg.rowStart; lrow <= cg.rowEnd; lrow++) {
        for (let lcol = cg.colStart; lcol <= cg.colEnd; lcol++) {
          if (chip.coreType(lcol, lrow) !== 'tensix') continue;
          const cr    = this._cellRect(lcol, lrow);
          const noise = 1 + 0.15 * Math.sin(lcol * 3.7 + lrow * 2.9 + mem.phase * Math.PI);
          const fillH = Math.min(cr.h * 0.9, cr.h * l1Fill * noise);
          const barW  = cr.w * 0.70;
          const barX  = cr.x + (cr.w - barW) / 2;
          const barY  = cr.y + cr.h - fillH;
          ctx.fillRect(barX, barY, barW, fillH);
        }
      }
      ctx.restore();
    }
  };

  TensixViz.prototype._drawHighlight = function (col, row, hl) {
    const ctx   = this.ctx;
    const r     = this._cellRect(col, row);
    const alpha = hl.alpha !== undefined ? hl.alpha : 1;
    const T     = this._theme;

    ctx.save();
    ctx.globalAlpha = alpha;

    const color  = T[hl.color] || hl.color || T.tensixActive;
    const bright = hl.color === 'pink' ? T.pink : T.tensixPulse;

    // Fill
    ctx.fillStyle = color;
    this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.fill();

    // Bright border — no shadowBlur (too expensive for 64 cores per frame)
    ctx.strokeStyle = bright;
    ctx.lineWidth   = 1.5;
    this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.stroke();

    ctx.restore();
  };

  TensixViz.prototype._drawCellLabel = function (col, row, text) {
    const ctx = this.ctx;
    const c   = this._cellCenter(col, row);
    const r   = this._cellRect(col, row);

    ctx.save();
    ctx.font      = `bold ${Math.max(7, r.w * 0.28)}px sans-serif`;
    ctx.fillStyle = this._theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 4;
    ctx.fillText(text.length > 5 ? text.slice(0, 4) + '…' : text, c.x, c.y);
    ctx.restore();
  };

  TensixViz.prototype._drawParticle = function (p) {
    const ctx   = this.ctx;
    const color = p.color || this._theme.particle;
    const r     = p.radius || 4;
    ctx.save();
    // Outer halo (translucent, larger)
    ctx.fillStyle   = color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Solid core
    ctx.globalAlpha = 1;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  TensixViz.prototype._drawHeatmap = function () {
    const ctx  = this.ctx;
    const chip = this.chip;
    const cg   = chip.computeGrid;

    // Find max value for normalisation
    let maxVal = 0;
    for (let row = cg.rowStart; row <= cg.rowEnd; row++) {
      for (let col = cg.colStart; col <= cg.colEnd; col++) {
        const v = (this._heatmap[row] || [])[col] || 0;
        if (v > maxVal) maxVal = v;
      }
    }
    if (maxVal === 0) return;

    for (let row = cg.rowStart; row <= cg.rowEnd; row++) {
      for (let col = cg.colStart; col <= cg.colEnd; col++) {
        const v    = ((this._heatmap[row] || [])[col] || 0) / maxVal;
        const r    = this._cellRect(col, row);
        const color = this._heatColor(v, this._theme);
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle   = color;
        this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  TensixViz.prototype._heatColor = function (t, T) {
    // 0 → cool, 0.5 → warm, 1 → hot
    function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
    function hex(r, g, b) { return 'rgb(' + r + ',' + g + ',' + b + ')'; }
    const low  = T.heatLowRgb;
    const mid  = T.heatMidRgb;
    const high = T.heatHighRgb;
    if (t < 0.5) {
      const s = t * 2;
      return hex(lerp(low[0], mid[0], s), lerp(low[1], mid[1], s), lerp(low[2], mid[2], s));
    } else {
      const s = (t - 0.5) * 2;
      return hex(lerp(mid[0], high[0], s), lerp(mid[1], high[1], s), lerp(mid[2], high[2], s));
    }
  };

  TensixViz.prototype._roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // ─── Legend ────────────────────────────────────────────────────────────────

  TensixViz.prototype.renderLegend = function (legendEl) {
    const T = this._resolveTheme();
    const items = [
      { color: T.tensixActive, label: 'Active compute core' },
      { color: T.tensix,       label: 'Idle Tensix core' },
      { color: T.dramBorder,   label: 'DRAM controller' },
      { color: T.ethBorder,    label: 'Ethernet link' },
      { color: T.particle,     label: 'Data tile (NOC transfer)' },
    ];
    // Build legend DOM with safe DOM API (avoids innerHTML injection risk when
    // theme values are ever sourced from outside the hard-coded THEME objects).
    legendEl.replaceChildren ? legendEl.replaceChildren() : (legendEl.innerHTML = '');
    items.forEach(function (item) {
      var span = document.createElement('span');
      span.className = 'tv-legend-item';
      var dot = document.createElement('span');
      dot.className = 'tv-legend-dot';
      dot.style.background = item.color;   // safe: style property, not attribute string
      span.appendChild(dot);
      span.appendChild(document.createTextNode(' ' + item.label));
      legendEl.appendChild(span);
    });
  };

  // ─── Script step execution ─────────────────────────────────────────────────

  TensixViz.prototype.play = function (script) {
    this._loopScript  = script;
    this._stepMode    = false;
    this._scriptQueue = script.slice();
    if (!this._running) this._runLoop();
    return this;
  };

  TensixViz.prototype.stepThrough = function (script) {
    this._stepMode = true;
    this._scriptQueue = script.slice();
    this._running = false;
    return this;
  };

  TensixViz.prototype.next = function () {
    if (this._resolveStep) {
      const fn = this._resolveStep;
      this._resolveStep = null;
      fn();
    } else if (this._scriptQueue.length > 0) {
      this._runNextStep();
    }
  };

  TensixViz.prototype.reset = function () {
    this._animGen++;             // invalidate any pending async callbacks from prior play()
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._highlights    = {};
    this._particles     = [];
    this._heatmap       = null;
    this._labels        = {};
    this._floatLabelData = null;
    this._memOverride = null;
    this._currentMode = null;
    this._scriptQueue   = [];
    this._resolveStep   = null;
    this.render();
  };

  // ─── Memory stats override ─────────────────────────────────────────────────
  // Call with live bandwidth/fill data to override the simulation preset.
  // Each call replaces the entire override — unprovided keys fall back to the
  // mode preset, not to values from a prior call.
  // Cleared by reset() (called automatically by activate()).
  TensixViz.prototype.setMemoryStats = function (stats) {
    if (!stats || typeof stats !== 'object') return;
    this._memOverride = {};
    if (typeof stats.dram_bw === 'number') this._memOverride.dram_bw = Math.max(0, Math.min(1, stats.dram_bw));
    if (typeof stats.l1_fill === 'number') this._memOverride.l1_fill = Math.max(0, Math.min(1, stats.l1_fill));
  };

  TensixViz.prototype._runLoop = function () {
    const self = this;
    self._running = true;
    const gen = self._animGen;   // snapshot; if reset() fires, _animGen increments past this

    function next() {
      if (!self._running || self._animGen !== gen) return;
      if (self._scriptQueue.length === 0) {
        if (self._loop && self._loopScript) {
          // Pause briefly before looping
          setTimeout(function () {
            if (!self._running || self._animGen !== gen) return;
            self._highlights    = {};
            self._particles     = [];
            self._heatmap       = null;
            self._labels        = {};
            self._floatLabelData = null;
            self.render();
            self._scriptQueue = self._loopScript.slice();
            next();
          }, 600);
          return;
        }
        self._running = false;
        return;
      }
      const step = self._scriptQueue.shift();
      self._execStep(step, function () {
        if (self._stepMode) {
          self._resolveStep = next;
        } else {
          next();
        }
      });
    }
    next();
  };

  TensixViz.prototype._runNextStep = function () {
    const self = this;
    if (self._scriptQueue.length === 0) return;
    const step = self._scriptQueue.shift();
    self._execStep(step, function () {
      self._resolveStep = self._runNextStep.bind(self);
    });
  };

  TensixViz.prototype._execStep = function (step, done) {
    const self = this;
    switch (step.step) {
      case 'highlight':   return self._stepHighlight(step, done);
      case 'unhighlight': return self._stepUnhighlight(step, done);
      case 'transfer':    return self._stepTransfer(step, done);
      case 'heatmap':     return self._stepHeatmap(step, done);
      case 'label':       return self._stepLabel(step, done);
      case 'clear':       return self._stepClear(step, done);
      case 'pause':       return self._stepPause(step, done);
      default:            done(); break;
    }
  };

  // ─── Step implementations ──────────────────────────────────────────────────

  TensixViz.prototype._stepHighlight = function (step, done) {
    const self  = this;
    const cores = step.cores || [];
    const color = step.color || 'tensixActive';
    const label = step.label || '';
    const ms    = (step.ms || 600) / self.speed;
    const gen   = self._animGen;

    // Pulse animation: alpha 0 → 1 over ms/2, hold, then done
    const start = performance.now();
    const half  = ms / 2;

    cores.forEach(([col, row]) => {
      self._highlights[col + ',' + row] = { color, alpha: 0, label };
    });

    // Show floating label above the highlighted group if provided
    if (label) self._floatLabel(cores, label);

    function tick(now) {
      if (self._animGen !== gen) return;
      const elapsed = now - start;
      const alpha   = elapsed < half ? elapsed / half : 1;
      cores.forEach(([col, row]) => {
        if (self._highlights[col + ',' + row]) {
          self._highlights[col + ',' + row].alpha = alpha;
        }
      });
      self.render();
      if (elapsed < ms) {
        self._rafId = requestAnimationFrame(tick);
      } else {
        cores.forEach(([col, row]) => {
          if (self._highlights[col + ',' + row]) {
            self._highlights[col + ',' + row].alpha = 1;
          }
        });
        self.render();
        done();
      }
    }
    self._rafId = requestAnimationFrame(tick);
  };

  TensixViz.prototype._stepUnhighlight = function (step, done) {
    const self  = this;
    const cores = step.cores
      ? step.cores
      : Object.keys(this._highlights).map(function (k) { return k.split(',').map(Number); });
    const ms = (step.ms !== undefined ? step.ms : 250) / this.speed;

    // Clear float label immediately
    this._floatLabelData = null;

    if (ms <= 0 || cores.length === 0) {
      cores.forEach(function (cr) { delete self._highlights[cr[0] + ',' + cr[1]]; });
      this.render();
      done();
      return;
    }

    // Snapshot current alphas for a smooth fade-out
    const initial = {};
    cores.forEach(function (cr) {
      const key = cr[0] + ',' + cr[1];
      initial[key] = self._highlights[key] ? (self._highlights[key].alpha || 1) : 1;
    });

    const start = performance.now();
    const gen   = self._animGen;
    function tick(now) {
      if (self._animGen !== gen) return;
      const t = Math.min(1, (now - start) / ms);
      cores.forEach(function (cr) {
        const key = cr[0] + ',' + cr[1];
        if (self._highlights[key]) {
          self._highlights[key].alpha = (initial[key] || 1) * (1 - t);
        }
      });
      self.render();
      if (t < 1) {
        self._rafId = requestAnimationFrame(tick);
      } else {
        cores.forEach(function (cr) { delete self._highlights[cr[0] + ',' + cr[1]]; });
        self.render();
        done();
      }
    }
    self._rafId = requestAnimationFrame(tick);
  };

  TensixViz.prototype._stepTransfer = function (step, done) {
    const self  = this;
    const from  = step.from;
    const to    = step.to;
    const T     = this._resolveTheme();
    const color = T[step.color] || T.particle;
    const ms    = (step.ms || 800) / self.speed;

    const start = performance.now();
    const p0    = self._cellCenter(from[0], from[1]);
    const p1    = self._cellCenter(to[0],   to[1]);

    // Row-first NOC routing: go horizontal then vertical
    const mid = { x: p1.x, y: p0.y };

    const particle = { x: p0.x, y: p0.y, color, radius: Math.max(3, self._cellW * 0.15) };
    self._particles.push(particle);
    const gen = self._animGen;

    function tick(now) {
      if (self._animGen !== gen) return;
      const t = Math.min(1, (now - start) / ms);
      // Ease in-out
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      if (e < 0.5) {
        // Horizontal segment
        const s = e * 2;
        particle.x = p0.x + (mid.x - p0.x) * s;
        particle.y = p0.y;
      } else {
        // Vertical segment
        const s = (e - 0.5) * 2;
        particle.x = mid.x;
        particle.y = p0.y + (p1.y - p0.y) * s;
      }

      self.render();

      if (t < 1) {
        self._rafId = requestAnimationFrame(tick);
      } else {
        const idx = self._particles.indexOf(particle);
        if (idx !== -1) self._particles.splice(idx, 1);
        self.render();
        done();
      }
    }
    self._rafId = requestAnimationFrame(tick);
  };

  TensixViz.prototype._stepHeatmap = function (step, done) {
    const self = this;
    const gen  = self._animGen;
    self._heatmap = step.data || null;
    self.render();
    setTimeout(function () { if (self._animGen === gen) done(); }, (step.ms || 200) / self.speed);
  };

  TensixViz.prototype._stepLabel = function (step, done) {
    const core = step.core;
    if (core) this._labels[core[0] + ',' + core[1]] = step.text || '';
    this.render();
    done();
  };

  TensixViz.prototype._stepClear = function (step, done) {
    if (step.what === 'highlights' || !step.what) { this._highlights = {}; this._floatLabelData = null; }
    if (step.what === 'labels'     || !step.what) this._labels     = {};
    if (step.what === 'heatmap'    || !step.what) this._heatmap    = null;
    if (step.what === 'particles'  || !step.what) this._particles  = [];
    this.render();
    done();
  };

  TensixViz.prototype._stepPause = function (step, done) {
    const self = this;
    const gen  = self._animGen;
    setTimeout(function () { if (self._animGen === gen) done(); }, (step.ms || 500) / self.speed);
  };

  // ─── Named animation modes (continuous RAF loop) ──────────────────────────

  TensixViz.prototype.activate = function (mode, opts) {
    this.reset();                                // stop any existing animation
    this._currentMode = mode;
    opts = opts || {};

    var chip = this.chip;
    var cg   = chip.computeGrid;
    var W    = cg.colEnd   - cg.colStart + 1;   // number of compute cols
    var H    = cg.rowEnd   - cg.rowStart + 1;   // number of compute rows

    var t    = opts.phaseOffset || 0;           // animation time, increments each frame
    var gen  = this._animGen;
    var self = this;

    // prev[r][c] = 0..1, 0-based compute grid indices (for decay-based modes)
    var prev = [];
    for (var r = 0; r < H; r++) {
      prev[r] = [];
      for (var c = 0; c < W; c++) prev[r][c] = 0;
    }

    // ── Kernel dispatch state — used only by the kernel_dispatch mode ──────────
    // Maintained in the activate() closure so it resets cleanly on each activate() call.
    // Each entry: { c, r, w, h, age, maxAge, seed }
    //   c/r      — top-left corner of the kernel's compute grid (0-based)
    //   w/h      — width/height of the kernel grid in cores
    //   age      — frames elapsed since dispatch
    //   maxAge   — total lifetime before the kernel is culled
    //   seed     — per-kernel random seed for stable per-core activity noise
    //
    // Pre-seed one kernel at mid-age so the mode is instantly visible on
    // every chip (no blank warmup period confusing the user), then keep
    // nextDispatch: 1 so the second kernel fires on the very first frame.
    var _kd = {
      list: [{
        c: Math.floor((W - 4) / 2),  // center a 4×3 seed kernel
        r: Math.floor((H - 3) / 2),
        w: 4,
        h: 3,
        age: 12,                      // already propagated, mid-life bright
        maxAge: 40,
        seed: 37
      }],
      nextDispatch: 1               // dispatch another kernel on the first frame
    };

    // ── Memory layer animation state ─────────────────────────────────────────
    // Drives smooth per-frame envelopes in _drawMemoryLayer().
    var _mem = {
      phase:      0,   // continuously incrementing phase counter
      burstPhase: 0,   // fractional phase within a burst cycle (0–1)
      kdGlow:     0,   // current DRAM glow for kernel_dispatch (decays per frame)
    };

    var MODES = {
      idle: function (c, r) {
        return Math.min(1, prev[r][c] * 0.90 + (Math.random() < 0.03 ? Math.random() * 0.35 : 0));
      },
      inference: function (c, r) {
        var wave = (t % 1) * W;
        return Math.max(0, 1 - Math.abs(c - wave) / 3) * 0.9;
      },
      diffusion: function (c, r) {
        var cx = W / 2, cy = H / 2;
        var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        var ring = (t % 1) * Math.sqrt(cx * cx + cy * cy);
        return Math.max(0, 1 - Math.abs(dist - ring) / 2) * 0.9;
      },
      agents: function (c, r) {
        return Math.min(1, prev[r][c] * 0.85 + (Math.random() < 0.06 ? Math.random() * 0.8 : 0));
      },
      explore: function (c, r) {
        return (Math.sin(c * 0.6 + t * Math.PI * 4) * Math.cos(r * 0.4 + t * Math.PI * 2) + 1) / 2 * 0.85;
      },
      // ── LLM-specific states ──────────────────────────────────────────────────
      thinking: function (c, r) {
        // Chain-of-thought / extended reasoning — sustained full-grid glow with
        // slow gentle oscillation. All cores moderately active; occasional
        // brighter wave as the model "considers" a new reasoning step.
        return (Math.sin(t * Math.PI * 0.7 + c * 0.18 + r * 0.12) + 1) / 2 * 0.4 + 0.45;
      },
      prefill: function (c, r) {
        // Prompt ingestion — all tokens processed in parallel. Wide bright band
        // sweeps the full grid quickly (high utilisation, short burst per cycle).
        var wave = (t * 1.5 % 1) * (W + 6) - 3;
        return Math.max(0, 1 - Math.abs(c - wave) / (W * 0.5)) * 0.95;
      },
      video: function (c, r) {
        // Temporal diffusion — two phase-offset expanding rings simulating
        // denoising across consecutive video frames.
        var cx = W / 2, cy = H / 2;
        var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        var maxR = Math.sqrt(cx * cx + cy * cy);
        var r1   = Math.max(0, 1 - Math.abs(dist - (t          % 1) * maxR) / 1.8) * 0.9;
        var r2   = Math.max(0, 1 - Math.abs(dist - ((t + 0.5)  % 1) * maxR) / 1.8) * 0.9;
        return Math.max(r1, r2);
      },
      batch: function (c, r) {
        // Batched inference — three concurrent decode streams at equal phase
        // offsets crossing the grid simultaneously.
        var speed = 0.7;
        var w1 = Math.max(0, 1 - Math.abs(c - ((t * speed)        % 1) * W) / 2) * 0.85;
        var w2 = Math.max(0, 1 - Math.abs(c - ((t * speed + 0.33) % 1) * W) / 2) * 0.85;
        var w3 = Math.max(0, 1 - Math.abs(c - ((t * speed + 0.66) % 1) * W) / 2) * 0.85;
        return Math.max(w1, w2, w3);
      },
      kernel_dispatch: function (c, r) {
        // Metalium kernel dispatch — programs are launched onto rectangular Tensix
        // core grids via NOC multicast from the dispatch core.  Each kernel "lights
        // up" its assigned rectangle with a ripple that propagates from the
        // top-left corner (dispatch origin), holds while the kernel executes, then
        // fades out.  Multiple kernels can be in flight simultaneously, matching
        // the Metalium programming model where independent programs run on disjoint
        // (or overlapping) grid regions.
        //
        // Per-core activation noise uses a deterministic formula (c, r, seed) so
        // the pattern stays visually stable across frames rather than flickering.

        // Advance kernel state exactly once per frame (on the first cell c=0, r=0).
        if (c === 0 && r === 0) {
          // Age existing kernels and cull expired ones (iterate backwards so splice is safe).
          for (var i = _kd.list.length - 1; i >= 0; i--) {
            _kd.list[i].age++;
            if (_kd.list[i].age >= _kd.list[i].maxAge) _kd.list.splice(i, 1);
          }

          // Dispatch new kernel(s) when the countdown fires.
          if (--_kd.nextDispatch <= 0) {
            // Kernel grid dimensions — constrained to realistic sizes
            // (Metalium grids are typically 1–N cores per axis up to chip width).
            var kw = 1 + Math.floor(Math.random() * Math.min(8, W - 1));
            var kh = 1 + Math.floor(Math.random() * Math.min(6, H - 1));
            var kc = Math.floor(Math.random() * (W - kw));
            var kr = Math.floor(Math.random() * (H - kh));
            _kd.list.push({ c: kc, r: kr, w: kw, h: kh,
                            age: 0, maxAge: 38 + Math.floor(Math.random() * 50),
                            seed: Math.random() * 100 });

            // 40 % chance a second kernel co-dispatches in the same "program"
            // (common in Metalium: matmul op = reader + compute + writer kernels)
            if (Math.random() < 0.4) {
              kw = 1 + Math.floor(Math.random() * Math.min(6, W - 1));
              kh = 1 + Math.floor(Math.random() * Math.min(4, H - 1));
              kc = Math.floor(Math.random() * (W - kw));
              kr = Math.floor(Math.random() * (H - kh));
              _kd.list.push({ c: kc, r: kr, w: kw, h: kh,
                              age: 0, maxAge: 38 + Math.floor(Math.random() * 50),
                              seed: Math.random() * 100 });
            }

            _kd.nextDispatch = 18 + Math.floor(Math.random() * 28);
          }
        }

        // Compute activation level for this core by checking every active kernel.
        var val = 0;
        for (var i = 0; i < _kd.list.length; i++) {
          var k = _kd.list[i];
          if (c < k.c || c >= k.c + k.w || r < k.r || r >= k.r + k.h) continue;

          // NOC multicast ripple: distance from dispatch origin (top-left corner).
          // Each hop ~1.5 frames to propagate — smaller grids fully lit in ~10 frames.
          var dist        = (c - k.c) + (r - k.r);           // Manhattan from top-left
          var effectiveAge = k.age - dist * 1.5;
          if (effectiveAge < 0) continue;                     // not yet reached this core

          // Fade in over 4 frames, sustain, fade out over 10 frames before expiry.
          var fadeIn  = Math.min(1, effectiveAge / 4);
          var fadeOut = Math.min(1, (k.maxAge - k.age) / 10);

          // Stable per-core activity variation using a deterministic sinusoidal noise
          // (avoids per-frame random() flicker while still giving texture).
          var noise = 0.72 + 0.28 * Math.sin(c * 7.3 + r * 4.1 + k.seed + t * 6);

          val = Math.max(val, fadeIn * fadeOut * noise * 0.88);
        }
        return val;
      },
    };

    var fn = MODES[mode];
    if (!fn) throw new Error('Unknown animation mode: "' + mode + '"');

    self._running = true;

    // Pre-seed _memPhase immediately so that callers who invoke render() synchronously
    // before the first RAF tick (e.g. tests that call viz.render() in a loop) see a
    // valid phase object and the memory layer isn't skipped by the !_memPhase guard.
    if (self._showMemory) {
      self._memPhase = _mem;
    }

    function tick() {
      if (self._animGen !== gen) return;
      t += 0.012;

      // Advance memory animation state (only when memory layer is enabled)
      if (self._showMemory) {
        _mem.phase += 0.012;
        var preset = MEM_PRESETS[mode] || MEM_PRESETS.idle;
        if (preset.burst && preset.burstHz !== 'kd') {
          _mem.burstPhase = (_mem.burstPhase + preset.burstHz * 0.012) % 1;
        }
        if (preset.burstHz === 'kd') {
          var kdActive = _kd.list.length > 0 ? 1 : 0;
          _mem.kdGlow = _mem.kdGlow * 0.92 + kdActive * 0.08;
        }
        self._memPhase = _mem;
      }

      var next = [];
      var hmap = [];

      for (var r = 0; r < H; r++) {
        next[r] = [];
        var row = r + cg.rowStart;
        if (!hmap[row]) hmap[row] = [];
        for (var c = 0; c < W; c++) {
          var col = c + cg.colStart;
          var v   = fn(c, r);
          next[r][c]   = v;
          hmap[row][col] = v;
        }
      }

      prev         = next;
      self._heatmap = hmap;
      self.render();
      self._rafId  = requestAnimationFrame(tick);
    }

    self._rafId = requestAnimationFrame(tick);
  };

  // ─── Floating label (above the highlighted region) ──────────────────────────

  TensixViz.prototype._floatLabel = function (cores, text) {
    if (!cores.length) return;
    const self = this;
    const ctx  = this.ctx;

    // Find bounding box
    let minCol = Infinity, maxCol = -Infinity, minRow = Infinity;
    cores.forEach(([col, row]) => {
      minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row);
    });

    const leftCenter  = self._cellCenter(minCol, minRow);
    const rightCenter = self._cellCenter(maxCol, minRow);
    const cx = (leftCenter.x + rightCenter.x) / 2;
    const cy = leftCenter.y - self._cellH * 0.8;

    // Draw pill label — done during render so just store it
    this._floatLabelData = { cx, cy, text };
  };

  // Override render to also draw float label
  const _origRender = TensixViz.prototype.render;
  TensixViz.prototype.render = function () {
    _origRender.call(this);
    if (this._floatLabelData) {
      const ctx  = this.ctx;
      const { cx, cy, text } = this._floatLabelData;
      const pad  = 6;
      ctx.font   = 'bold 11px sans-serif';
      const w    = ctx.measureText(text).width + pad * 2;
      const h    = 18;
      const T = this._theme;   // set by _origRender → render() → _resolveTheme()
      ctx.fillStyle   = T.floatLabelBg;
      ctx.strokeStyle = T.teal;
      ctx.lineWidth   = 1;
      this._roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle    = T.floatLabelFg;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);
    }
  };

  // ─── Static factory helpers ─────────────────────────────────────────────────

  // Build a parallelism script: animate adding cores 1 → N showing serial fraction
  TensixViz.makeParallelismScript = function (totalCores, serialFraction) {
    serialFraction = serialFraction || 0.1;
    const steps = [];
    const allCores = [];
    for (let row = 1; row <= 8; row++) {
      for (let col = 1; col <= 8; col++) {
        allCores.push([col, row]);
        if (allCores.length >= totalCores) break;
      }
      if (allCores.length >= totalCores) break;
    }

    steps.push({ step: 'highlight', cores: [allCores[0]], color: 'pink', label: '1 core (serial)' });
    steps.push({ step: 'pause', ms: 900 });
    for (let n = 2; n <= totalCores; n += Math.ceil(totalCores / 5)) {
      const active = allCores.slice(0, n);
      const speedup = (1 / (serialFraction + (1 - serialFraction) / n)).toFixed(1);
      steps.push({ step: 'unhighlight' });
      steps.push({ step: 'highlight', cores: active, color: 'tensixActive', label: n + ' cores · ' + speedup + 'x' });
      steps.push({ step: 'pause', ms: 700 });
    }
    return steps;
  };

  // Build a NOC routing script: show packet traveling from src to dst
  TensixViz.makeNocScript = function (src, dst) {
    src = src || [1, 1];
    dst = dst || [7, 7];
    return [
      { step: 'highlight', cores: [src], color: 'teal',  label: 'src' },
      { step: 'highlight', cores: [dst], color: 'pink',  label: 'dst' },
      { step: 'pause', ms: 400 },
      { step: 'transfer', from: src, to: dst, ms: 1000 },
      { step: 'pause', ms: 300 },
    ];
  };

  // ─── Auto-init from data attributes ────────────────────────────────────────
  // Finds all .tensix-viz-container elements and initialises them.
  // JSON script is stored in data-script attribute (DOMPurify strips <script> tags).
  // Controls are children of the container div.
  // NOTE: TensixViz.autoInit is kept here for use from src/index.js (Task 7).
  // The auto-init CALL (DOMContentLoaded listener) has been removed; call it explicitly.

  TensixViz.autoInit = function () {
    document.querySelectorAll('.tensix-viz-container').forEach(function (container) {
      const canvas    = container.querySelector('.tensix-viz-canvas');
      const playBtn   = container.querySelector('.tv-play');
      const stepBtn   = container.querySelector('.tv-step');
      const legendEl  = container.querySelector('.tv-legend');

      if (!canvas) return;

      const arch   = container.dataset.arch || 'wormhole';
      const viz    = new TensixViz(canvas, { arch });

      let script = [];
      try { script = JSON.parse(container.dataset.script || '[]'); } catch (e) {}

      if (legendEl) viz.renderLegend(legendEl);

      // Defer auto-play until the browser is idle so Mermaid diagram rendering
      // doesn't compete with the first animation frame. Falls back to a plain
      // timeout for Safari, which lacks requestIdleCallback.
      var startViz = function () { viz._loop = true; viz.play(script); };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(startViz, { timeout: 3000 });
      } else {
        setTimeout(startViz, 1500);
      }

      if (playBtn) {
        playBtn.addEventListener('click', function () {
          const icon = playBtn.textContent.trim();
          if (icon.startsWith('▶')) {
            playBtn.textContent = '⏸';
            viz.reset();
            viz.play(script);
          } else {
            playBtn.textContent = '▶';
            viz.reset();
          }
        });
      }

      if (stepBtn) {
        stepBtn.addEventListener('click', function () {
          if (!viz._stepMode) {
            viz.stepThrough(script);
          }
          viz.next();
        });
      }
    });
  };

  // ─── Export ────────────────────────────────────────────────────────────────
  export { TensixViz };
  export default TensixViz;
