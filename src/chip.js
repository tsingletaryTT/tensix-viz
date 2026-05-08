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
      // Tensix compute grid sits at rows 1-8, cols 1-8 (0-indexed)
      // Row 0, Row 9-11 are special; col 0, col 9 are DRAM/ETH
      coreType(col, row) {
        if (row === 0 || row === 9)  return 'dram';
        if (col === 0)               return 'eth';
        if (col === 9)               return (row >= 1 && row <= 4) ? 'eth' : 'dram';
        if (row >= 1 && row <= 8 && col >= 1 && col <= 8) return 'tensix';
        return 'empty';
      },
      computeGrid: { colStart: 1, colEnd: 8, rowStart: 1, rowEnd: 8 }, // inclusive
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
  const THEME = {
    bg:          '#0F2A35',
    grid:        '#1A3C47',
    tensix:      '#1E4A58',
    tensixBorder:'#2D6675',
    tensixActive:'#4FD1C5',
    tensixPulse: '#81E6D9',
    dram:        '#1A2540',
    dramBorder:  '#2D3F6A',
    eth:         '#2A1A40',
    ethBorder:   '#5B3DA0',
    pcie:        '#2A2010',
    pcieBorder:  '#8B6914',
    empty:       '#0D2030',
    text:        '#E8F0F2',
    textMuted:   '#607D8B',
    teal:        '#4FD1C5',
    tealLight:   '#81E6D9',
    pink:        '#EC96B8',
    gold:        '#F4C471',
    green:       '#27AE60',
    red:         '#FF6B6B',
    particle:    '#4FD1C5',
    heatLow:     '#1E4A58',
    heatMid:     '#F4C471',
    heatHigh:    '#FF6B6B',
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

    this._cellW = 0;
    this._cellH = 0;
    this._padX  = 0;
    this._padY  = 0;

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
  };

  // ─── Rendering ─────────────────────────────────────────────────────────────

  TensixViz.prototype.render = function () {
    const ctx  = this.ctx;
    const chip = this.chip;
    const lw   = this._logicalW;
    const lh   = this._logicalH;
    ctx.clearRect(0, 0, lw, lh);

    // Background
    ctx.fillStyle = THEME.bg;
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

    let fill   = THEME[type]       || THEME.empty;
    let border = THEME[type + 'Border'] || fill;

    ctx.fillStyle = fill;
    this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.fill();

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
    ctx.stroke();

    // Core type indicator (tiny label for non-tensix)
    if (type !== 'tensix' && type !== 'empty' && r.w > 14) {
      ctx.fillStyle = THEME.textMuted;
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

    ctx.strokeStyle = 'rgba(45,102,117,0.25)';
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

  TensixViz.prototype._drawHighlight = function (col, row, hl) {
    const ctx   = this.ctx;
    const r     = this._cellRect(col, row);
    const alpha = hl.alpha !== undefined ? hl.alpha : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    const color  = THEME[hl.color] || hl.color || THEME.tensixActive;
    const bright = hl.color === 'pink' ? THEME.pink : THEME.tensixPulse;

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
    ctx.fillStyle = THEME.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 4;
    ctx.fillText(text.length > 5 ? text.slice(0, 4) + '…' : text, c.x, c.y);
    ctx.restore();
  };

  TensixViz.prototype._drawParticle = function (p) {
    const ctx   = this.ctx;
    const color = p.color || THEME.particle;
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
        const color = this._heatColor(v);
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle   = color;
        this._roundRect(ctx, r.x, r.y, r.w, r.h, 3);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  TensixViz.prototype._heatColor = function (t) {
    // 0 → cool (teal), 0.5 → warm (gold), 1 → hot (red)
    function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
    function hex(r, g, b) { return `rgb(${r},${g},${b})`; }
    const low  = [30,  74, 88];  // THEME.heatLow  ≈ #1E4A58
    const mid  = [244,196,113];  // THEME.heatMid  ≈ #F4C471
    const high = [255,107,107];  // THEME.heatHigh ≈ #FF6B6B
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
    const items = [
      { color: THEME.tensixActive, label: 'Active compute core' },
      { color: THEME.tensix,       label: 'Idle Tensix core' },
      { color: THEME.dramBorder,   label: 'DRAM controller' },
      { color: THEME.ethBorder,    label: 'Ethernet link' },
      { color: THEME.particle,     label: 'Data tile (NOC transfer)' },
    ];
    legendEl.innerHTML = items.map(i =>
      `<span class="tv-legend-item">
        <span class="tv-legend-dot" style="background:${i.color}"></span>
        ${i.label}
      </span>`
    ).join('');
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
    this._scriptQueue   = [];
    this._resolveStep   = null;
    this.render();
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
    const color = THEME[step.color] || THEME.particle;
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
    };

    var fn = MODES[mode];
    if (!fn) throw new Error('Unknown animation mode: "' + mode + '"');

    self._running = true;

    function tick() {
      if (self._animGen !== gen) return;
      t += 0.012;

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
      ctx.fillStyle   = 'rgba(15,42,53,0.88)';
      ctx.strokeStyle = THEME.teal;
      ctx.lineWidth   = 1;
      this._roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle    = THEME.tealLight;
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
          if (icon === '▶' || icon === '▶') {
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
