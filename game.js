/**
 * ============================================================
 *  CROSSY FLAMINGO — game.js
 *  "How many roads, resorts, and promises can a flamingo cross
 *   before the lagoon disappears?"
 *
 *  Architecture:
 *    Config       — constants & tuning values
 *    AssetData    — character & collectible definitions
 *    World        — row / obstacle / collectible management
 *    Player       — movement, hop physics, collision
 *    Renderer     — all canvas drawing
 *    InputManager — keyboard, touch, pointer
 *    UIManager    — screen transitions, HUD updates, popups
 *    Game         — main loop, state machine
 * ============================================================
 */

'use strict';

/* ── Config ───────────────────────────────────────────── */
const Config = {
  TILE_MIN:     52,
  TILE_MAX:     84,
  TILE_DIVISOR: 10,
  TARGET_Y:     0.70,   // player stays at this fraction of screen height
  HOP_SPEED:    8,      // tiles/sec movement toward target
  ROWS_AHEAD:   40,     // how many rows to keep above player
  ROWS_BELOW:   4,      // extra rows to keep below view
  PM_INTERVAL:  100,    // score milestone for Prime Minister Mode
  PM_DURATION:  8,      // seconds PM mode lasts
  PM_SITE_RATE: 0.018,  // construction site drop probability per frame
  PARTICLE_MAX: 80,

  // Isometric camera — stronger side angle
  ISO_Y:        0.42,   // vertical squish (lower = stronger iso angle)
  ISO_ORIGIN_Y: 0.88,   // vanishing point anchor (higher = more ground visible)

  // Era thresholds (score)
  ERA_WETLANDS:     0,
  ERA_DEVELOPMENT:  30,
  ERA_CONSTRUCTION: 70,
  ERA_CONCRETE:     130,
};

/* ── AssetData ────────────────────────────────────────── */
const AssetData = {
  CHARACTERS: [
    { emoji: '🦩',     color: '#ff88cc', label: 'Classic Flamingo',        special: null        },
    { emoji: '😤',     color: '#ff4455', label: 'Angry Flamingo',           special: null        },
    { emoji: '✨',     color: '#ffd700', label: 'Golden Flamingo',          special: 'sparkles'  },
    { emoji: '🇪🇺',  color: '#4488ff', label: 'EU Inspector Flamingo',    special: 'eu'        },
    { emoji: '📸',     color: '#8866cc', label: 'Journalist Flamingo',      special: 'camera'    },
    { emoji: '✊',     color: '#dd7700', label: 'Protest Flamingo',         special: 'sign'      },
    { emoji: '🦅',     color: '#885533', label: 'Albanian Eagle Flamingo',  special: 'eagle'     },
  ],

  COLLECTIBLES: [
    { icon: '💰', title: 'Public Funds',      desc: 'Approved for "infrastructure." Destination: unknown.'               },
    { icon: '📄', title: 'Permit #{N}',       desc: 'Approved in {T} seconds. Environmental review: pending forever.'   },
    { icon: '📰', title: 'Newspaper Headline',desc: '"Environmental review completed before being started."'             },
    { icon: '🦐', title: 'Last Shrimp',       desc: 'The final shrimp from the lagoon. Frame it.'                        },
    { icon: '🪶', title: 'Flamingo Feather',  desc: 'Evidence of prior flamingo habitation. Now a resort lobby.'        },
    { icon: '💰', title: 'EU Cohesion Funds', desc: 'Earmarked for wetland preservation. Swiftly redirected.'           },
  ],

  ERAS: [
    {
      name:  '🌿 Pristine Wetlands',
      bg1:   '#0d3b2e', bg2: '#1a6b5a',
      water: '#1dc4a0', road: '#4a7c59',
    },
    {
      name:  '🚧 Development Begins',
      bg1:   '#1e2f10', bg2: '#3a5a20',
      water: '#1a9999', road: '#888888',
    },
    {
      name:  '🏗️ Resort Construction',
      bg1:   '#1e1e0a', bg2: '#4a4420',
      water: '#2277aa', road: '#aaaaaa',
    },
    {
      name:  '🏨 Concrete Paradise',
      bg1:   '#181818', bg2: '#383838',
      water: '#225577', road: '#cccccc',
    },
  ],

  OBSTACLE_WIDTHS: {
    car:      1.4,
    suv:      1.8,
    truck:    2.2,
    bulldozer:2.0,
    crane:    1.5,
    log:      2.5,
    yacht:    3.0,
    fence:    1.2,
    journalist:1.0,
    helicopter:2.2,
  },

  LEADERBOARD: [
    { category: '🥇 Most Stubborn Flamingo',  name: 'EU Inspector',     score: 0 },
    { category: '🥇 Most Permits Dodged',     name: 'Protest Flamingo', score: 0 },
    { category: '🥇 Longest Protest',         name: 'Journalist',       score: 0 },
    { category: '🥇 Least Corrupt Run',       name: 'Classic',          score: 0 },
  ],
};

/* ── Utility helpers ──────────────────────────────────── */
const rand    = (min, max)   => min + Math.random() * (max - min);
const randInt = (min, max)   => Math.floor(rand(min, max + 1));
const clamp   = (v, lo, hi)  => Math.max(lo, Math.min(hi, v));
const lerp    = (a, b, t)    => a + (b - a) * t;

/* ============================================================
   World — rows, obstacles, collectibles
   ============================================================ */
class World {
  constructor() {
    this.rows          = [];
    this.worldOffset   = 0;   // vertical scroll offset in pixels
    this.highestIndex  = 0;   // largest row.yIndex ever created
  }

  get tileSize() { return Game.instance.tileSize; }

  /** Y-coordinate on canvas for a given row */
  rowY(row) {
    const H = window.innerHeight;
    return H - (row.yIndex * this.tileSize) + this.worldOffset;
  }

  /** Build a new row at the given yIndex */
  createRow(yIndex, score) {
    const r  = Math.random();
    const era = this._eraIndex(score);

    let type, color, speed = 0, obstacleType = null, obstacleCount = 2;

    if (era === 0) {
      if (r < 0.50)      { type = 'grass';        color = '#2d7a4f'; }
      else if (r < 0.80) { type = 'water';        color = '#1dc4a0'; speed = rand(0.8,1.6); obstacleType = 'log';       obstacleCount = 2; }
      else               { type = 'road';         color = '#555555'; speed = rand(1.0,2.0); obstacleType = 'car';       obstacleCount = 2; }
    } else if (era === 1) {
      if (r < 0.25)      { type = 'grass';        color = '#3d6b2a'; }
      else if (r < 0.42) { type = 'water';        color = '#1a9999'; speed = rand(1.0,2.0); obstacleType = 'log';       obstacleCount = 2; }
      else if (r < 0.68) { type = 'road';         color = '#777777'; speed = rand(1.5,2.5); obstacleType = 'truck';     obstacleCount = 3; }
      else               { type = 'construction'; color = '#9b7a1a'; obstacleType = 'fence';      obstacleCount = 3; }
    } else if (era === 2) {
      if (r < 0.12)      { type = 'grass';        color = '#556644'; }
      else if (r < 0.24) { type = 'water';        color = '#2277aa'; speed = rand(1.5,2.5); obstacleType = 'yacht';     obstacleCount = 2; }
      else if (r < 0.55) { type = 'road';         color = '#999999'; speed = rand(2.0,3.5); obstacleType = 'truck';     obstacleCount = 4; }
      else if (r < 0.78) { type = 'construction'; color = '#bb8800'; obstacleType = 'bulldozer';  obstacleCount = 3; }
      else               { type = 'road';         color = '#888888'; speed = rand(2.0,3.0); obstacleType = 'journalist';obstacleCount = 2; }
    } else {
      if (r < 0.08)      { type = 'grass';        color = '#404040'; }
      else if (r < 0.18) { type = 'water';        color = '#225577'; speed = rand(2.0,3.5); obstacleType = 'yacht';     obstacleCount = 3; }
      else if (r < 0.45) { type = 'road';         color = '#aaaaaa'; speed = rand(2.5,4.5); obstacleType = 'suv';       obstacleCount = 5; }
      else if (r < 0.70) { type = 'construction'; color = '#cc9900'; obstacleType = 'crane';      obstacleCount = 3; }
      else               { type = 'road';         color = '#999999'; speed = rand(1.5,3.0); obstacleType = 'helicopter';obstacleCount = 2; }
    }

    const dir = Math.random() > 0.5 ? 1 : -1;
    const row = { yIndex, type, color, speed, dir, obstacleType, obstacleCount, obstacles: [], collectible: null };

    // Populate obstacles
    if (type === 'road' || type === 'water') {
      const gap = window.innerWidth / obstacleCount;
      let startX = Math.random() * window.innerWidth;
      for (let i = 0; i < obstacleCount; i++) {
        row.obstacles.push({ x: (startX + i * gap * rand(0.65, 1.1)) % window.innerWidth });
      }
    } else if (type === 'construction') {
      for (let i = 0; i < obstacleCount; i++) {
        row.obstacles.push({
          x: (i / obstacleCount) * window.innerWidth + rand(0, window.innerWidth / obstacleCount * 0.5),
          moving: Math.random() > 0.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    // Random collectible
    if (Math.random() < 0.11) {
      row.collectible = { x: rand(48, window.innerWidth - 48), collected: false };
    }

    return row;
  }

  _eraIndex(score) {
    if (score >= Config.ERA_CONCRETE)     return 3;
    if (score >= Config.ERA_CONSTRUCTION) return 2;
    if (score >= Config.ERA_DEVELOPMENT)  return 1;
    return 0;
  }

  /** Called once per frame; scrolls world and culls/grows rows */
  update(dt, score, frameCount) {
    const W = window.innerWidth;

    // Move obstacles
    this.rows.forEach(row => {
      if (row.type === 'road' || row.type === 'water') {
        row.obstacles.forEach(ob => {
          ob.x += row.speed * row.dir * dt * 60;
          if (ob.x >  W + 90) ob.x = -90;
          if (ob.x < -90)     ob.x =  W + 90;
        });
      }
      if (row.type === 'construction') {
        row.obstacles.forEach(ob => {
          if (ob.moving) ob.x += Math.sin(frameCount * 0.018 + ob.phase) * 0.6;
        });
      }
    });

    // Cull rows far below view
    const H = window.innerHeight;
    this.rows = this.rows.filter(row => this.rowY(row) < H + this.tileSize * (Config.ROWS_BELOW + 1));

    // Grow rows ahead
    while (this.rows.length < Config.ROWS_AHEAD) {
      this.highestIndex++;
      this.rows.push(this.createRow(this.highestIndex, score));
    }
  }

  /** Initialise a fresh world */
  reset(score) {
    this.rows        = [];
    this.worldOffset = 0;
    this.highestIndex = 0;
    for (let i = 0; i < Config.ROWS_AHEAD; i++) {
      this.rows.push(this.createRow(-i, score));
    }
  }

  /** Width of obstacle by type */
  obstacleWidth(type) {
    return (AssetData.OBSTACLE_WIDTHS[type] || 1.6) * this.tileSize;
  }
}

/* ============================================================
   Player — position, physics, collision
   ============================================================ */
class Player {
  constructor() {
    this.reset();
  }

  reset() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Place player in world-space so after ISO_Y squish it sits at TARGET_Y on screen.
    // iso screen Y = originY + (worldY - originY) * ISO_Y
    // Solve for worldY: worldY = originY + (targetScreenY - originY) / ISO_Y
    const originY  = H * Config.ISO_ORIGIN_Y;
    const targetSY = H * Config.TARGET_Y;
    const worldY   = originY + (targetSY - originY) / Config.ISO_Y;
    this.x      = W / 2;
    this.y      = worldY;
    this.tx     = W / 2;
    this.ty     = worldY;
    this.moving = false;
    this.alive  = true;
    this.hop    = 0;
    this.hopDir = 0;
    this.squish = 0;
    this.trail  = [];
    this.startX  = W / 2;
    this.startY  = worldY;
    this.hopDist = 1;
  }

  /** Queue a movement direction */
  move(direction, tileSize) {
    if (!this.alive || this.moving) return;

    const dx = direction === 'left'  ? -tileSize
               : direction === 'right' ?  tileSize : 0;
    // All four directions move the player exactly one tile in world-space.
    // For 'up': player moves up (-tileSize) AND world scrolls +tileSize,
    // so net screen position stays fixed — but ty still differs from y so the hop arc works.
    const dy = direction === 'up'   ? -tileSize
               : direction === 'down' ?  tileSize : 0;

    this.tx = clamp(this.x + dx, tileSize / 2, window.innerWidth  - tileSize / 2);
    this.ty = this.y + dy;
    this.startX  = this.x;
    this.startY  = this.y;
    this.hopDist = Math.sqrt((this.tx-this.x)**2 + (this.ty-this.y)**2) || tileSize;
    this.moving  = true;
    this.hop     = 0;
    this.hopDir  = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
  }

  /** Per-frame physics update. Returns true if hop completed this frame. */
  update(dt, tileSize) {
    let hopCompleted = false;

    if (this.squish > 0) this.squish = Math.max(0, this.squish - dt * 4);

    if (this.moving) {
      const speed = Config.HOP_SPEED * tileSize * dt;
      const dx    = this.tx - this.x;
      const dy    = this.ty - this.y;
      const dist  = Math.sqrt(dx * dx + dy * dy);

      if (dist < speed * 1.5 || dist < 2) {
        this.x      = this.tx;
        this.y      = this.ty;
        this.moving = false;
        this.hop    = 0;
        this.squish = 0.35;
        hopCompleted = true;
      } else {
        const ratio    = speed / dist;
        this.x += dx * ratio;
        this.y += dy * ratio;
        // Progress 0→1 based on remaining distance vs total hop distance
        const progress = 1 - (dist / this.hopDist);
        this.hop = Math.sin(Math.PI * progress) * 0.65;
      }
    }

    this.x = clamp(this.x, tileSize / 2, window.innerWidth - tileSize / 2);

    // Trail
    if (this.moving) {
      this.trail.push({ x: this.x, y: this.y, life: 0.3 });
    }
    this.trail = this.trail.filter(t => (t.life -= dt) > 0);

    return hopCompleted;
  }

  applyWaterDrift(rows, worldFn, tileSize, dt) {
    rows.forEach(row => {
      if (row.type !== 'water' || !row.obstacles.length) return;
      const ry = worldFn(row);
      if (Math.abs(ry - this.y) > tileSize * 0.45) return;
      row.obstacles.forEach(ob => {
        const hw = (AssetData.OBSTACLE_WIDTHS[row.obstacleType] || 2.5) * tileSize / 2;
        if (this.x > ob.x - hw && this.x < ob.x + hw) {
          const drift = row.speed * row.dir * dt * 60;
          this.x  += drift;
          this.tx += drift;
        }
      });
    });
  }
}

/* ============================================================
   Renderer — all canvas drawing
   ============================================================ */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.frame  = 0;
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  get W() { return this.canvas.width;  }
  get H() { return this.canvas.height; }

  clear() {
    this.ctx.clearRect(0, 0, this.W, this.H);
  }

  /* ── Background ─────────────────────────────────────── */
  drawBackground(score, frameCount, worldOffset) {
    const ctx   = this.ctx;
    const eraIdx = score >= Config.ERA_CONCRETE     ? 3
                 : score >= Config.ERA_CONSTRUCTION  ? 2
                 : score >= Config.ERA_DEVELOPMENT   ? 1 : 0;
    const era   = AssetData.ERAS[eraIdx];

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, era.bg1);
    grad.addColorStop(1, era.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);

    // Horizon skyline
    this._drawSkyline(score, frameCount);

    // Palm trees (fade out as era progresses)
    const palmOpacity = Math.max(0, 1 - score / 80);
    if (palmOpacity > 0) {
      const palmSpacing = this.W / 3.8;
      const phase = (worldOffset * 0.08) % palmSpacing;
      for (let i = -1; i <= 4; i++) {
        this._drawPalm(i * palmSpacing - phase, this.H * 0.38, palmOpacity, frameCount);
      }
    }
  }

  _drawSkyline(score, frameCount) {
    const ctx     = this.ctx;
    const horizon = this.H * 0.30;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';

    const profiles = [
      { w: 20, h: 60  }, { w: 35, h: 90  }, { w: 25, h: 70  },
      { w: 50, h: 120 }, { w: 30, h: 80  }, { w: 18, h: 55  },
      { w: 40, h: 100 }, { w: 28, h: 75  }, { w: 22, h: 65  },
      { w: 45, h: 110 }, { w: 20, h: 58  }, { w: 32, h: 85  },
    ];

    let bx = this.W * 0.04;
    profiles.forEach((b, i) => {
      ctx.fillRect(bx, horizon - b.h, b.w, b.h);

      // Construction cranes appear in later eras
      if (score > 50 && i % 3 === 0) {
        ctx.fillStyle = 'rgba(220,140,0,0.38)';
        const cx = bx + b.w / 2;
        const cy = horizon - b.h;
        ctx.fillRect(cx - 2, cy - 34, 4, 34);   // mast
        ctx.fillRect(cx - 2, cy - 34, 28, 3);   // arm
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
      }
      bx += b.w + 8 + (i * 3 % 14);
    });
  }

  _drawPalm(x, y, opacity, frameCount) {
    const ctx  = this.ctx;
    const sway = Math.sin(frameCount * 0.018) * 0.07;
    ctx.save();
    ctx.globalAlpha = opacity * 0.75;
    ctx.strokeStyle = '#5d3a1a';
    ctx.lineWidth   = 5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 10, y - 32, x + 6 + sway * 20, y - 62);
    ctx.stroke();
    ctx.fillStyle = '#2d7a2a';
    const tx = x + 6 + sway * 20;
    const ty = y - 62;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(a + sway);
      ctx.beginPath();
      ctx.ellipse(16, 0, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ── Rows ───────────────────────────────────────────── */
  drawRow(row, y, tileSize, frameCount) {
    const ctx = this.ctx;
    if (y < -tileSize * 2 || y > this.H + tileSize * 2) return;

    // Top face (the walkable surface)
    ctx.fillStyle = row.color;
    ctx.fillRect(0, y - tileSize / 2, this.W, tileSize);

    // Isometric side face — darker strip along the bottom edge, giving block depth
    const sideH = Math.round(tileSize * 0.55);
    const sideColor = this._darken(row.color, 0.42);
    ctx.fillStyle = sideColor;
    ctx.fillRect(0, y + tileSize / 2 - 1, this.W, sideH);

    // Thin highlight along top edge
    ctx.fillStyle = this._lighten(row.color, 0.18);
    ctx.fillRect(0, y - tileSize / 2, this.W, 2);

    switch (row.type) {
      case 'road':
        this._drawRoadMarkings(row, y, tileSize, frameCount); break;
      case 'water':
        this._drawWaterShimmer(row, y, tileSize, frameCount); break;
      case 'grass':
        this._drawGrassTufts(row, y, tileSize); break;
      case 'construction':
        this._drawConstructionStripes(y, tileSize); break;
    }

    // Obstacles
    row.obstacles.forEach(ob => this.drawObstacle(ob, row, y, tileSize));

    // Collectible
    if (row.collectible && !row.collectible.collected) {
      this._drawCollectible(row, y, tileSize, frameCount);
    }
  }

  /** Darken a hex color by a ratio (0–1) */
  _darken(hex, ratio) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgb(${Math.round(r*(1-ratio))},${Math.round(g*(1-ratio))},${Math.round(b*(1-ratio))})`;
  }
  /** Lighten a hex color by a ratio (0–1) */
  _lighten(hex, ratio) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgb(${Math.round(r+(255-r)*ratio)},${Math.round(g+(255-g)*ratio)},${Math.round(b+(255-b)*ratio)})`;
  }

  _drawRoadMarkings(row, y, tileSize, frameCount) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    const dashW = 30, gap = 60;
    const scroll = (frameCount * row.speed * row.dir * 0.45) % gap;
    for (let x = -gap; x < this.W + gap; x += gap) {
      ctx.fillRect(x + scroll, y - 2, dashW, 4);
    }
  }

  _drawWaterShimmer(row, y, tileSize, frameCount) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    for (let x = 0; x < this.W; x += 44) {
      const wave = Math.sin(frameCount * 0.045 + x * 0.09) * 3;
      ctx.fillRect(x, y + wave - 1.5, 22, 3);
    }
  }

  _drawGrassTufts(row, y, tileSize) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 12; x < this.W; x += 32 + (Math.abs(row.yIndex) * 7 % 18)) {
      ctx.fillRect(x,     y - 1, 3, 9);
      ctx.fillRect(x + 6, y - 3, 2, 11);
    }
  }

  _drawConstructionStripes(y, tileSize) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = -24; x < this.W + 24; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x,      y - tileSize / 2);
      ctx.lineTo(x + 16, y - tileSize / 2);
      ctx.lineTo(x + 8,  y + tileSize / 2);
      ctx.lineTo(x - 8,  y + tileSize / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawCollectible(row, y, tileSize, frameCount) {
    const ctx  = this.ctx;
    const icons = ['💰','📄','📰','🦐','🪶','💰'];
    const bob   = Math.sin(frameCount * 0.09 + row.collectible.x * 0.01) * 3;
    ctx.font        = `${tileSize * 0.52}px serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle   = '#fff';
    ctx.fillText(icons[Math.abs(row.yIndex) % icons.length], row.collectible.x, y + bob);
  }

  /* ── Obstacles ──────────────────────────────────────── */
  drawObstacle(ob, row, y, tileSize) {
    const ctx = this.ctx;
    const w   = (AssetData.OBSTACLE_WIDTHS[row.obstacleType] || 1.6) * tileSize;
    const h   = tileSize * 0.78;
    const sideH = Math.round(h * 0.28);   // iso side depth

    ctx.save();
    ctx.translate(ob.x, y);
    if (row.dir < 0) ctx.scale(-1, 1);

    // Draw side face first (behind the top face)
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(-w/2, h/2, w, sideH);

    switch (row.obstacleType) {
      case 'car':        this._drawCar(ctx, w, h, tileSize, '#cc3333'); break;
      case 'suv':        this._drawCar(ctx, w, h, tileSize, '#1a1a2e'); break;
      case 'truck':      this._drawTruck(ctx, w, h, tileSize);         break;
      case 'bulldozer':  this._drawBulldozer(ctx, w, h, tileSize);     break;
      case 'crane':      this._drawCrane(ctx, w, h, tileSize);         break;
      case 'log':        this._drawLog(ctx, w, h, tileSize);           break;
      case 'yacht':      this._drawYacht(ctx, w, h, tileSize);         break;
      case 'fence':      this._drawFence(ctx, w, h);                   break;
      case 'journalist': this._drawJournalist(ctx, tileSize);           break;
      case 'helicopter': this._drawHelicopter(ctx, w, h, tileSize, this.frame); break;
    }
    ctx.restore();
  }

  _drawCar(ctx, w, h, t, bodyColor) {
    ctx.fillStyle = bodyColor;
    ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 6); ctx.fill();
    ctx.fillStyle = '#aaddff';
    ctx.fillRect(-w/2 + 4, -h/2 + 4, w/3, h/2 - 3);
    ctx.fillStyle = '#ffe840';
    ctx.fillRect(w/2 - 11, -h/4, 9, 6);
    ctx.fillStyle = '#222';
    for (const wx of [-w/4, w/4]) {
      ctx.beginPath(); ctx.arc(wx, h/2 - 2, 5, 0, Math.PI*2); ctx.fill();
    }
  }

  _drawTruck(ctx, w, h, t) {
    ctx.fillStyle = '#cc6600';
    ctx.fillRect(-w/2, -h/2, w * 0.6, h);
    ctx.fillStyle = '#cc3300';
    ctx.fillRect(-w/2 + w*0.6, -h/2, w*0.4, h);
    ctx.fillStyle = '#888';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-w/2 + 10 + i*(w-20)/3, h/2 - 1, 5, 0, Math.PI*2);
      ctx.fill();
    }
  }

  _drawBulldozer(ctx, w, h, t) {
    ctx.fillStyle = '#ddaa00';
    ctx.fillRect(-w/2, -h/3, w*0.65, h*0.6);
    ctx.fillStyle = '#aa7700';
    ctx.fillRect(w/2 - w*0.38, -h/2, w*0.38, h);
    ctx.fillStyle = '#555';
    ctx.fillRect(-w/2, h/4, w, h/4);
  }

  _drawCrane(ctx, w, h, t) {
    ctx.fillStyle = '#dd8800';
    ctx.fillRect(-w/2, -h/2, w*0.22, h);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(-w/4, -h*1.5, w*0.1, h);
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w/4, -h*1.5); ctx.lineTo(w/2, -h/2); ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.arc(w/2 - 6, -h/2 + 4, 6, 0, Math.PI*2); ctx.fill();
  }

  _drawLog(ctx, w, h, t) {
    ctx.fillStyle = '#8B5E3C';
    ctx.beginPath(); ctx.roundRect(-w/2, -h/3, w, h*0.6, 8); ctx.fill();
    ctx.fillStyle = '#a07040';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-w/2 + 10 + i*(w-20)/2.5, -h/7, 3, h*0.35);
    }
  }

  _drawYacht(ctx, w, h, t) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-w/2, h/3); ctx.lineTo(w/2, h/3);
    ctx.lineTo(w/3, -h/3); ctx.lineTo(-w/3, -h/3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(-w/4, -h/3, w/2, h/6);
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -h/3); ctx.lineTo(0, -h); ctx.stroke();
    ctx.fillStyle = 'rgba(200,220,255,0.5)';
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w/2, -h/3); ctx.lineTo(0, -h/3); ctx.closePath(); ctx.fill();
  }

  _drawFence(ctx, w, h) {
    ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 3;
    ctx.strokeRect(-w/2, -h/2, w, h);
    ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= w; i += 14) {
      ctx.moveTo(-w/2 + i, -h/2);
      ctx.lineTo(-w/2 + i + 10, h/2);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,0,0.2)';
    ctx.fillRect(-w/2, -h/2, w, h);
  }

  _drawJournalist(ctx, t) {
    ctx.font = `${t * 0.9}px serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📸', 0, 0);
  }

  _drawHelicopter(ctx, w, h, t, frame) {
    const spin = (frame * 0.25) % (Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.beginPath(); ctx.ellipse(0, 0, w/2, h/3, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 3;
    ctx.save();
    ctx.rotate(spin);
    ctx.beginPath(); ctx.moveTo(-w/2, 0); ctx.lineTo(w/2, 0); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#88aaff';
    ctx.fillRect(-w/5, -h/4, w/4, h/2);
  }

  /* ── Player ─────────────────────────────────────────── */
  drawPlayer(player, charIndex, tileSize) {
    if (!player.alive) return;
    const ctx  = this.ctx;
    const char = AssetData.CHARACTERS[charIndex];
    const s    = tileSize * 0.42;
    const hopH = Math.max(0, player.hop) * tileSize * 0.5;
    const sqX  = 1 + player.squish * 0.28;
    const sqY  = 1 - player.squish * 0.18;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(sqX, sqY);
    ctx.translate(0, -hopH);

    // Shadow
    ctx.save();
    ctx.translate(0, hopH + s * 0.62);
    ctx.scale(1, 0.22);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.6 * (1 - Math.abs(player.hop) * 0.45), 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    // Legs
    const legSway = Math.sin(this.frame * 0.28) * 0.28;
    ctx.strokeStyle = char.color;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    [[-0.15, -legSway], [0.15, legSway]].forEach(([lx, swing]) => {
      ctx.beginPath();
      ctx.moveTo(lx * s * 2, s * 0.3);
      ctx.lineTo((lx + swing) * s * 2, s * 0.78);
      ctx.stroke();
    });

    // Body
    ctx.fillStyle = char.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.54, s * 0.44, 0, 0, Math.PI*2);
    ctx.fill();

    // Wing
    const wingSide = player.hopDir >= 0 ? 1 : -1;
    ctx.save();
    ctx.rotate(Math.sin(this.frame * 0.14) * 0.18);
    ctx.beginPath();
    ctx.ellipse(-s * 0.28 * wingSide, 0, s*0.34, s*0.17, 0.38*wingSide, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Neck
    ctx.strokeStyle = char.color;
    ctx.lineWidth   = s * 0.34;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(s*0.1, -s*0.18);
    ctx.quadraticCurveTo(s*0.38, -s*0.58, s*0.18, -s*0.88);
    ctx.stroke();

    // Head
    ctx.fillStyle = char.color;
    ctx.beginPath();
    ctx.arc(s*0.18, -s*0.88, s*0.22, 0, Math.PI*2);
    ctx.fill();

    // Beak
    const beak = [
      [s*0.36, -s*0.88, s*0.62, -s*0.80, s*0.36, -s*0.78, '#ff8800'],
      [s*0.36, -s*0.85, s*0.62, -s*0.80, s*0.36, -s*0.83, '#cc6600'],
    ];
    beak.forEach(([x1,y1,x2,y2,x3,y3, c]) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill();
    });

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s*0.24, -s*0.92, s*0.07, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(s*0.25, -s*0.92, s*0.04, 0, Math.PI*2); ctx.fill();

    // Character special
    this._drawSpecial(ctx, char.special, s);
    ctx.restore();
  }

  _drawSpecial(ctx, special, s) {
    if (!special) return;
    ctx.font        = `${s * 0.42}px serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';

    switch (special) {
      case 'sign':
        ctx.strokeStyle = '#cc8800'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-s*0.3, -s*0.12); ctx.lineTo(-s*0.3, -s*0.9); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-s*0.56, -s*0.92, s*0.52, s*0.28);
        ctx.fillStyle = '#cc0000';
        ctx.font      = `bold ${s*0.17}px Arial`;
        ctx.fillText('NO!', -s*0.3, -s*0.66);
        break;
      case 'eu':
        ctx.fillText('🇪🇺', s*0.52, -s*1.18); break;
      case 'camera':
        ctx.fillText('📸', s*0.6, -s*1.2); break;
      case 'sparkles':
        ctx.fillStyle = 'rgba(255,215,0,0.6)';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(
            Math.cos(this.frame*0.08 + i*1.26)*s*0.8,
            Math.sin(this.frame*0.08 + i*1.26)*s*0.8 - s*0.5,
            2, 0, Math.PI*2
          );
          ctx.fill();
        }
        break;
    }
  }

  /* ── PM Character ───────────────────────────────────── */
  drawPM(pmChar, tileSize, frameCount) {
    if (!pmChar) return;
    const ctx = this.ctx;

    // Drift down from top
    pmChar.y = Math.min(this.H * 0.18, pmChar.y + 1.2);

    ctx.save();
    ctx.translate(pmChar.x, pmChar.y);
    ctx.font        = `${tileSize * 1.8}px serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧑‍💼', 0, 0);

    // Speech bubble
    const bx = -88, by = -tileSize*2 - 8, bw = 176, bh = 38;
    ctx.fillStyle   = 'rgba(200,0,50,0.88)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
    ctx.fillStyle   = '#fff';
    ctx.font        = `bold 13px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillText('🏗️  "This is Progress!"', 0, by + 22);
    ctx.restore();
  }

  /* ── Construction sites dropped by PM ──────────────── */
  drawConstructionSites(sites, tileSize) {
    const ctx = this.ctx;
    sites.forEach(cs => {
      ctx.globalAlpha = Math.min(1, cs.life / 0.6) * 0.82;
      ctx.font        = `${tileSize * 0.72}px serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏗️', cs.x, cs.y);

      ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 2;
      ctx.strokeRect(cs.x - tileSize*0.45, cs.y - tileSize*0.45, tileSize*0.9, tileSize*0.9);
    });
    ctx.globalAlpha = 1;
  }

  /* ── Particles ──────────────────────────────────────── */
  drawParticles(particles) {
    const ctx = this.ctx;
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /* ── Menu animated background ───────────────────────── */
  drawMenuBackground(frameCount) {
    const ctx = this.ctx;

    // Deep sky
    ctx.fillStyle = '#0d0918';
    ctx.fillRect(0, 0, this.W, this.H);

    // Floating flamingo silhouettes
    for (let i = 0; i < 7; i++) {
      const x = ((this.W * i / 6.2 + frameCount * (0.18 + i * 0.09)) % (this.W + 60)) - 30;
      const y = this.H * 0.28 + Math.sin(frameCount * 0.018 + i * 0.9) * 28;
      ctx.globalAlpha = 0.13;
      ctx.font        = `${28 + i * 4}px serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle   = '#ff88cc';
      ctx.fillText('🦩', x, y);
    }
    ctx.globalAlpha = 1;

    // Water at bottom
    ctx.fillStyle = '#0a3d62';
    ctx.fillRect(0, this.H * 0.74, this.W, this.H);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(29,196,160,${0.06 + i * 0.008})`;
      const wy = this.H * 0.74 + i * 18 + Math.sin(frameCount * 0.025 + i * 0.6) * 4;
      ctx.fillRect(0, wy, this.W, 3 + i * 0.5);
    }
  }

  tick() { this.frame++; }
}

/* ============================================================
   InputManager — keyboard, touch
   ============================================================ */
class InputManager {
  constructor(canvas, onAction) {
    this.onAction    = onAction;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this._bindKeyboard();
    this._bindTouch(canvas);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', e => {
      const map = {
        ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
        w:'up', s:'down', a:'left', d:'right', ' ':'up',
      };
      if (map[e.key]) { e.preventDefault(); this.onAction(map[e.key]); }
    });
  }

  _bindTouch(canvas) {
    canvas.addEventListener('touchstart', e => {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', e => {
      const dx   = e.changedTouches[0].clientX - this.touchStartX;
      const dy   = e.changedTouches[0].clientY - this.touchStartY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 22) { this.onAction('up'); return; }
      if (Math.abs(dx) > Math.abs(dy)) {
        this.onAction(dx > 0 ? 'right' : 'left');
      } else {
        this.onAction(dy > 0 ? 'down' : 'up');
      }
    }, { passive: true });
  }
}

/* ============================================================
   UIManager — screens, HUD, popups
   ============================================================ */
class UIManager {
  constructor() {
    this.$screen      = id => document.getElementById(id);
    this.collectPopupTimer = null;
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.classList.add('hidden');
    });
    if (screenId) {
      const el = document.getElementById(screenId);
      el.classList.remove('hidden');
      el.classList.add('active');
    }
  }

  hideAllScreens() {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.add('hidden');
      s.classList.remove('active');
    });
  }

  setHUD(visible) {
    const hud   = document.getElementById('hud');
    const hint  = document.getElementById('mobileHint');
    if (visible) {
      hud.classList.remove('hidden');
      hint.classList.remove('hidden');
    } else {
      hud.classList.add('hidden');
      hint.classList.add('hidden');
    }
  }

  updateScore(score) {
    document.getElementById('scoreDisplay').textContent = `🦩 ${score}m`;
  }

  updateEra(score) {
    const era = AssetData.ERAS[
      score >= Config.ERA_CONCRETE     ? 3 :
      score >= Config.ERA_CONSTRUCTION ? 2 :
      score >= Config.ERA_DEVELOPMENT  ? 1 : 0
    ];
    document.getElementById('eraDisplay').textContent = era.name;
  }

  showPMBanner() {
    const el = document.getElementById('pmBanner');
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3200);
  }

  hidePMBanner() {
    document.getElementById('pmBanner').classList.add('hidden');
  }

  showCollectible() {
    const raw  = AssetData.COLLECTIBLES[randInt(0, AssetData.COLLECTIBLES.length - 1)];
    const title = raw.title
      .replace('{N}', randInt(100, 999))
      .replace('{T}', rand(0.1, 2.9).toFixed(1));
    document.getElementById('collectibleTitle').textContent = raw.icon + ' ' + title;
    document.getElementById('collectibleDesc').textContent  = raw.desc;
    const el = document.getElementById('collectiblePopup');
    el.classList.remove('hidden');
    clearTimeout(this.collectPopupTimer);
    this.collectPopupTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  showGameOver({ score, bestScore, cause, charLabel, leaderboard }) {
    const wetlands = Math.floor(score / 8);
    const resorts  = Math.max(0, Math.floor(score / 40) - 1);
    const flamingos = (Math.floor(score * 52 + rand(0, 1000))).toLocaleString();

    // Cause
    document.getElementById('deathReason').textContent = `Cause: ${cause}`;

    // Stats
    const statsEl = document.getElementById('statsBlock');
    statsEl.innerHTML = `
      <div class="stat-row"><span class="stat-label">Distance crossed</span><span class="stat-value highlight">${score}m</span></div>
      <div class="stat-row"><span class="stat-label">Personal best</span><span class="stat-value gold">${bestScore}m</span></div>
      <div class="stat-row"><span class="stat-label">Wetlands survived (briefly)</span><span class="stat-value">${wetlands}</span></div>
      <div class="stat-row"><span class="stat-label">Luxury resorts delayed</span><span class="stat-value">${resorts}</span></div>
      <div class="stat-row"><span class="stat-label">Flamingos relocated</span><span class="stat-value">${flamingos}</span></div>
      <div class="stat-funny">
        "Permit #${randInt(100,999)} approved in ${rand(0.1,1.9).toFixed(1)} seconds."<br>
        "Environmental review completed before being started."
      </div>`;

    // Leaderboard
    const lbEl = document.getElementById('lbEntries');
    lbEl.innerHTML = leaderboard.map(hs =>
      `<div class="lb-entry">
         <span class="lb-category">${hs.category}</span>
         <span class="lb-score">${hs.score}m <span class="lb-name">– ${hs.name}</span></span>
       </div>`
    ).join('');

    this.showScreen('gameoverScreen');
  }

  bindButtons({ onStart, onRestart, onMenu, onCharSelect }) {
    document.getElementById('startBtn').addEventListener('click', onStart);
    document.getElementById('restartBtn').addEventListener('click', onRestart);
    document.getElementById('backMenuBtn').addEventListener('click', onMenu);
    document.getElementById('charSelector').addEventListener('click', e => {
      const btn = e.target.closest('.char-btn');
      if (!btn) return;
      document.querySelectorAll('.char-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onCharSelect(parseInt(btn.dataset.char, 10));
    });
  }
}

/* ============================================================
   Game — main loop, state machine
   ============================================================ */
class Game {
  constructor() {
    Game.instance = this;

    this.canvas   = document.getElementById('gameCanvas');
    this.renderer = new Renderer(this.canvas);
    this.world    = new World();
    this.player   = new Player();
    this.ui       = new UIManager();
    this.input    = new InputManager(this.canvas, dir => this._handleInput(dir));

    this.state        = 'menu';   // 'menu' | 'playing' | 'dead'
    this.score        = 0;
    this.bestScore    = 0;
    this.selectedChar = 0;
    this.frameCount   = 0;
    this.lastTime     = 0;

    // PM Mode
    this.pmMode      = false;
    this.pmTimer     = 0;
    this.pmChar      = null;

    // Particles & construction sites
    this.particles        = [];
    this.constructionSites = [];

    // High scores (persistent in session)
    this.leaderboard = JSON.parse(JSON.stringify(AssetData.LEADERBOARD));

    this._bindUI();
    this._bindResize();

    this.renderer.resize();
    this.ui.showScreen('menuScreen');

    requestAnimationFrame(ts => this._loop(ts));
  }

  get tileSize() {
    return clamp(window.innerWidth / Config.TILE_DIVISOR, Config.TILE_MIN, Config.TILE_MAX);
  }

  /* ── Startup ────────────────────────────────────────── */
  _bindUI() {
    this.ui.bindButtons({
      onStart:      () => this.startGame(),
      onRestart:    () => this.startGame(),
      onMenu:       () => { this.state = 'menu'; this.ui.showScreen('menuScreen'); this.ui.setHUD(false); },
      onCharSelect: idx => { this.selectedChar = idx; },
    });
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.player.reset();
    });
  }

  startGame() {
    this.state             = 'playing';
    this.score             = 0;
    this.frameCount        = 0;
    this.pmMode            = false;
    this.pmTimer           = 0;
    this.pmChar            = null;
    this.particles         = [];
    this.constructionSites = [];

    this.world.reset(0);
    this.player.reset();

    this.ui.hideAllScreens();
    this.ui.setHUD(true);
    this.ui.updateScore(0);
    this.ui.updateEra(0);
    this.ui.hidePMBanner();
  }

  /* ── Input ──────────────────────────────────────────── */
  _handleInput(direction) {
    if (this.state !== 'playing') return;
    const wasMovingForward = direction === 'up';
    this.player.move(direction, this.tileSize);

    if (wasMovingForward && !this.player.moving) {
      // will be applied next frame check
    }
  }

  /* ── Main Loop ──────────────────────────────────────── */
  _loop(ts) {
    const dt = clamp((ts - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = ts;
    this.frameCount++;
    this.renderer.tick();

    this.renderer.clear();

    if (this.state === 'playing') {
      this._update(dt);
      this._draw();
    } else {
      this.renderer.drawMenuBackground(this.frameCount);
    }

    requestAnimationFrame(t => this._loop(t));
  }

  /* ── Update ─────────────────────────────────────────── */
  _update(dt) {
    const tile = this.tileSize;

    // Player physics
    const hopCompleted = this.player.update(dt, tile);
    this.player.applyWaterDrift(
      this.world.rows,
      r => this.world.rowY(r),
      tile,
      dt
    );

    // Score advance (player moved forward)
    if (hopCompleted && this.player.y < this.player.ty + tile * 0.5) {
      // handled inside move → world.advance
    }

    // World update
    this.world.update(dt, this.score, this.frameCount);

    // PM Mode
    if (this.pmMode) {
      this.pmTimer -= dt;
      if (this.pmTimer <= 0) { this.pmMode = false; this.pmChar = null; }
      if (Math.random() < Config.PM_SITE_RATE * dt * 60) this._dropConstructionSite();
    } else if (this.score > 0 && this.score % Config.PM_INTERVAL === 0 && this.score > 10) {
      this._activatePMMode();
    }

    // Construction site lifetime
    this.constructionSites = this.constructionSites.filter(cs => (cs.life -= dt) > 0);

    // Particles
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.14 * dt * 60;
      p.life -= dt;
      return p.life > 0;
    });

    // Collision check (only when player is settled)
    if (!this.player.moving && this.player.alive) {
      this._checkCollisions();
    }
  }

  /* ── Drawing ────────────────────────────────────────── */
  _draw() {
    const tile = this.tileSize;
    const ctx  = this.renderer.ctx;

    // Background drawn in screen-space (no iso distortion)
    this.renderer.drawBackground(this.score, this.frameCount, this.world.worldOffset);

    // Apply isometric camera transform for all world-space objects
    const originY = window.innerHeight * Config.ISO_ORIGIN_Y;
    ctx.save();
    ctx.translate(0, originY);
    ctx.scale(1, Config.ISO_Y);
    ctx.translate(0, -originY);

    const sorted = [...this.world.rows].sort((a, b) => a.yIndex - b.yIndex);
    sorted.forEach(row => this.renderer.drawRow(row, this.world.rowY(row), tile, this.frameCount));

    this.renderer.drawConstructionSites(this.constructionSites, tile);
    this.renderer.drawParticles(this.particles);
    this.renderer.drawPlayer(this.player, this.selectedChar, tile);
    this.renderer.drawPM(this.pmChar, tile, this.frameCount);

    ctx.restore();
  }

  /* ── Hop advancement ────────────────────────────────── */
  advanceWorld(dir) {
    // Scroll world forward by one tile to keep player at same screen Y after hop
    this.world.worldOffset += this.tileSize;
    this.score++;
    this.ui.updateScore(this.score);
    this.ui.updateEra(this.score);
  }

  /* ── Collision ──────────────────────────────────────── */
  _checkCollisions() {
    const px = this.player.x;
    const py = this.player.y;
    const tile = this.tileSize;

    this.world.rows.forEach(row => {
      const ry = this.world.rowY(row);
      if (Math.abs(ry - py) > tile * 0.58) return;

      if (row.type === 'water') {
        let onFloating = false;
        row.obstacles.forEach(ob => {
          const hw = this.world.obstacleWidth(row.obstacleType) / 2;
          if (px > ob.x - hw && px < ob.x + hw) onFloating = true;
        });
        if (!onFloating) this._die('drowned in the disappearing lagoon');
      }

      if (row.type === 'road' || row.type === 'construction') {
        row.obstacles.forEach(ob => {
          const hw = this.world.obstacleWidth(row.obstacleType) * 0.42;
          const hh = tile * 0.36;
          if (Math.abs(px - ob.x) < hw && Math.abs(py - ry) < hh) {
            const causes = {
              car: 'hit by a luxury SUV', truck: 'flattened by a cement truck',
              suv: 'run over by an SUV', bulldozer: 'demolished by a bulldozer',
              crane: 'hit by a falling crane', fence: 'stopped by a construction fence',
              journalist: 'surrounded by journalists', helicopter: 'hit by a VIP helicopter',
              yacht: 'capsized by a yacht', log: 'crushed by a floating log',
            };
            this._die(causes[row.obstacleType] || 'an obstacle');
          }
        });
      }

      // Collect items
      if (row.collectible && !row.collectible.collected) {
        if (Math.abs(row.collectible.x - px) < tile * 0.65 && Math.abs(ry - py) < tile * 0.65) {
          row.collectible.collected = true;
          this._spawnParticles(px, py, '#ffdd00', 12);
          this.ui.showCollectible();
        }
      }
    });

    // Construction sites
    this.constructionSites.forEach(cs => {
      if (Math.abs(px - cs.x) < tile * 0.65 && Math.abs(py - cs.y) < tile * 0.65) {
        this._die('buried under a PM-ordered construction site');
      }
    });

    // Fell off bottom (in world-space, below the iso origin)
    const originY = window.innerHeight * Config.ISO_ORIGIN_Y;
    if (py > originY + this.tileSize * 2) this._die('fell into the abyss');
  }

  /* ── Death ──────────────────────────────────────────── */
  _die(cause) {
    if (!this.player.alive) return;
    this.player.alive = false;
    this._spawnParticles(this.player.x, this.player.y, '#ff88cc', 30);

    if (this.score > this.bestScore) this.bestScore = this.score;
    this.leaderboard.forEach(entry => {
      if (this.score > entry.score) {
        entry.score = this.score;
        entry.name  = AssetData.CHARACTERS[this.selectedChar].label;
      }
    });

    setTimeout(() => {
      this.state = 'dead';
      this.ui.setHUD(false);
      this.ui.showGameOver({
        score:      this.score,
        bestScore:  this.bestScore,
        cause,
        charLabel:  AssetData.CHARACTERS[this.selectedChar].label,
        leaderboard: this.leaderboard,
      });
    }, 900);
  }

  /* ── PM Mode ────────────────────────────────────────── */
  _activatePMMode() {
    if (this.pmMode) return;
    this.pmMode  = true;
    this.pmTimer = Config.PM_DURATION;
    this.pmChar  = { x: window.innerWidth / 2, y: -140 };
    this.ui.showPMBanner();
    this._spawnParticles(window.innerWidth / 2, 0, '#ff4444', 22);
  }

  _dropConstructionSite() {
    const x = rand(48, window.innerWidth - 48);
    const y = this.player.y - this.tileSize * rand(2, 5);
    this.constructionSites.push({ x, y, life: 6 });
    this._spawnParticles(x, y, '#ffaa00', 8);
  }

  /* ── Particles ──────────────────────────────────────── */
  _spawnParticles(x, y, color, count) {
    for (let i = 0; i < count && this.particles.length < Config.PARTICLE_MAX; i++) {
      this.particles.push({
        x, y, color,
        vx: (Math.random() - 0.5) * 4.5,
        vy: (Math.random() - 0.5) * 4.5 - 2,
        life: rand(0.4, 0.9),
        size: rand(3, 8),
      });
    }
  }
}

/* ── Patch Player.move to trigger world scroll ──────── */
const _origMove = Player.prototype.move;
Player.prototype.move = function(direction, tileSize) {
  if (!this.alive || this.moving) return;
  _origMove.call(this, direction, tileSize);
  if (!this.moving) return;
  // Forward: scroll world +1 tile. This offsets the player's -tileSize ty delta,
  // so after the hop the flamingo lands back at the same screen Y — one lane forward.
  // Backward: no world scroll. Player just moves down one tile on screen.
  if (direction === 'up') Game.instance.advanceWorld(+1);
};

/* ── Boot ────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => { new Game(); });
