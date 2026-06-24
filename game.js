/**
 * ============================================================
 *  CROSSY FLAMINGO — game.js
 *  Proper isometric projection: all positions are grid coords
 *  (gx = column, gy = row index), projected to screen via iso().
 * ============================================================
 */

'use strict';

/* ── Config ───────────────────────────────────────────── */
const Config = {
  COLS:        12,     // grid columns visible
  TILE_W:      128,    // iso tile width  (diamond width)
  TILE_H:      64,     // iso tile height (diamond height)
  TILE_DEPTH:  28,     // visible side face height in pixels
  HOP_SPEED:   9,      // grid cells per second during hop animation
  ROWS_AHEAD:  18,     // rows above camera to keep live
  ROWS_BEHIND: 4,      // rows below camera to keep live

  PM_INTERVAL: 100,
  PM_DURATION: 8,
  PM_SITE_RATE:0.018,
  PARTICLE_MAX:100,

  ERA_WETLANDS:     0,
  ERA_DEVELOPMENT:  30,
  ERA_CONSTRUCTION: 70,
  ERA_CONCRETE:     130,
};

/* ── Iso projection ───────────────────────────────────── */
// gx = grid column (0..COLS), gy = grid row (world row index)
// cameraRow = which world row is at the bottom of screen
function iso(gx, gy, cameraRow) {
  const dx = gx - Config.COLS / 2;
  const dy = gy - cameraRow;
  return {
    x: (dx - dy) * (Config.TILE_W / 2) + canvas.width  / 2,
    y: (dx + dy) * (Config.TILE_H / 2) + canvas.height * 0.72,
  };
}

// inverse: screen point → approximate grid gx (for obstacle placement)
function gridX_fromScreen(screenX, gy, cameraRow) {
  // from iso: screenX = (gx - COLS/2 - (gy-cameraRow)) * TILE_W/2 + W/2
  // gx = (screenX - W/2) / (TILE_W/2) + COLS/2 + (gy-cameraRow)
  return (screenX - canvas.width/2) / (Config.TILE_W/2) + Config.COLS/2 + (gy - cameraRow);
}

/* ── AssetData ────────────────────────────────────────── */
const AssetData = {
  CHARACTERS: [
    { color: '#ff88cc', label: 'Classic Flamingo',       special: null       },
    { color: '#ff4455', label: 'Angry Flamingo',          special: null       },
    { color: '#ffd700', label: 'Golden Flamingo',         special: 'sparkles' },
    { color: '#4488ff', label: 'EU Inspector Flamingo',   special: 'eu'       },
    { color: '#8866cc', label: 'Journalist Flamingo',     special: 'camera'   },
    { color: '#dd7700', label: 'Protest Flamingo',        special: 'sign'     },
    { color: '#885533', label: 'Albanian Eagle Flamingo', special: 'eagle'    },
  ],

  COLLECTIBLES: [
    { icon:'💰', title:'Public Funds',       desc:'Approved for "infrastructure." Destination: unknown.'             },
    { icon:'📄', title:'Permit #{N}',        desc:'Approved in {T} seconds. Environmental review: pending forever.' },
    { icon:'📰', title:'Newspaper Headline', desc:'"Environmental review completed before being started."'           },
    { icon:'🦐', title:'Last Shrimp',        desc:'The final shrimp from the lagoon. Frame it.'                      },
    { icon:'🪶', title:'Flamingo Feather',   desc:'Evidence of prior flamingo habitation. Now a resort lobby.'      },
    { icon:'💰', title:'EU Cohesion Funds',  desc:'Earmarked for wetland preservation. Swiftly redirected.'         },
  ],

  ERAS: [
    { name:'🌿 Pristine Wetlands',    bg1:'#0d3b2e', bg2:'#1a6b5a' },
    { name:'🚧 Development Begins',   bg1:'#1e2f10', bg2:'#3a5a20' },
    { name:'🏗️ Resort Construction',  bg1:'#1e1e0a', bg2:'#4a4420' },
    { name:'🏨 Concrete Paradise',    bg1:'#181818', bg2:'#383838' },
  ],

  // obstacle grid-column widths (in grid units)
  OBSTACLE_GW: {
    car:1.2, suv:1.5, truck:2.0, bulldozer:1.8, crane:1.4,
    log:2.2, yacht:2.8, fence:1.0, journalist:0.9, helicopter:2.0,
  },

  LEADERBOARD: [
    { category:'🥇 Most Stubborn Flamingo', name:'EU Inspector',     score:0 },
    { category:'🥇 Most Permits Dodged',    name:'Protest Flamingo', score:0 },
    { category:'🥇 Longest Protest',        name:'Journalist',       score:0 },
    { category:'🥇 Least Corrupt Run',      name:'Classic',          score:0 },
  ],
};

/* ── Utility ──────────────────────────────────────────── */
const rand    = (a,b)     => a + Math.random()*(b-a);
const randInt = (a,b)     => Math.floor(rand(a,b+1));
const clamp   = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

let canvas, ctx;

/* ============================================================
   World — rows in grid coordinates
   Each row lives at a world gy (row index).
   Obstacles have gx positions (grid columns, can be fractional).
   ============================================================ */
class World {
  constructor() {
    this.rows         = [];
    this.cameraRow    = 0;   // which world row is at bottom of screen
    this.highestRow   = 0;
  }

  createRow(gy, score) {
    const r   = Math.random();
    const era = this._era(score);

    let type, color, speed=0, obstacleType=null, obstacleCount=2;

    if (era===0) {
      if      (r<0.50) { type='grass';        color='#2d7a4f'; }
      else if (r<0.80) { type='water';        color='#1dc4a0'; speed=rand(0.04,0.10); obstacleType='log';        obstacleCount=2; }
      else             { type='road';         color='#555555'; speed=rand(0.06,0.14); obstacleType='car';        obstacleCount=2; }
    } else if (era===1) {
      if      (r<0.25) { type='grass';        color='#3d6b2a'; }
      else if (r<0.42) { type='water';        color='#1a9999'; speed=rand(0.05,0.12); obstacleType='log';        obstacleCount=2; }
      else if (r<0.68) { type='road';         color='#777777'; speed=rand(0.08,0.16); obstacleType='truck';      obstacleCount=3; }
      else             { type='construction'; color='#9b7a1a'; obstacleType='fence';       obstacleCount=3; }
    } else if (era===2) {
      if      (r<0.12) { type='grass';        color='#556644'; }
      else if (r<0.24) { type='water';        color='#2277aa'; speed=rand(0.08,0.16); obstacleType='yacht';      obstacleCount=2; }
      else if (r<0.55) { type='road';         color='#999999'; speed=rand(0.12,0.22); obstacleType='truck';      obstacleCount=4; }
      else if (r<0.78) { type='construction'; color='#bb8800'; obstacleType='bulldozer';   obstacleCount=3; }
      else             { type='road';         color='#888888'; speed=rand(0.10,0.18); obstacleType='journalist'; obstacleCount=2; }
    } else {
      if      (r<0.08) { type='grass';        color='#404040'; }
      else if (r<0.18) { type='water';        color='#225577'; speed=rand(0.12,0.22); obstacleType='yacht';      obstacleCount=3; }
      else if (r<0.45) { type='road';         color='#aaaaaa'; speed=rand(0.16,0.30); obstacleType='suv';        obstacleCount=5; }
      else if (r<0.70) { type='construction'; color='#cc9900'; obstacleType='crane';        obstacleCount=3; }
      else             { type='road';         color='#999999'; speed=rand(0.10,0.20); obstacleType='helicopter'; obstacleCount=2; }
    }

    const dir = Math.random()>0.5 ? 1 : -1;
    const row = { gy, type, color, speed, dir, obstacleType, obstacles:[], collectible:null };

    // Obstacles: gx positions in grid space (0..COLS)
    if (type==='road' || type==='water') {
      const gap = Config.COLS / obstacleCount;
      let startGx = Math.random() * Config.COLS;
      for (let i=0; i<obstacleCount; i++) {
        row.obstacles.push({ gx: (startGx + i*gap*rand(0.65,1.1)) % Config.COLS });
      }
    } else if (type==='construction') {
      for (let i=0; i<obstacleCount; i++) {
        row.obstacles.push({
          gx: (i/obstacleCount)*Config.COLS + rand(0, Config.COLS/obstacleCount*0.4),
          moving: Math.random()>0.5,
          phase: Math.random()*Math.PI*2,
        });
      }
    }

    // Collectible at random grid column
    if (Math.random()<0.11) {
      row.collectible = { gx: rand(1, Config.COLS-1), collected:false };
    }

    return row;
  }

  _era(score) {
    if (score>=Config.ERA_CONCRETE)     return 3;
    if (score>=Config.ERA_CONSTRUCTION) return 2;
    if (score>=Config.ERA_DEVELOPMENT)  return 1;
    return 0;
  }

  update(dt, score, frameCount) {
    // Move obstacles in grid-space
    this.rows.forEach(row => {
      if (row.type==='road' || row.type==='water') {
        row.obstacles.forEach(ob => {
          ob.gx += row.speed * row.dir * dt * 60;
          if (ob.gx > Config.COLS+2) ob.gx = -2;
          if (ob.gx < -2)            ob.gx = Config.COLS+2;
        });
      }
      if (row.type==='construction') {
        row.obstacles.forEach(ob => {
          if (ob.moving) ob.gx += Math.sin(frameCount*0.018+ob.phase)*0.008;
        });
      }
    });

    // Cull rows too far below camera
    this.rows = this.rows.filter(r => r.gy >= this.cameraRow - Config.ROWS_BEHIND);

    // Grow rows ahead
    while (this.rows.length < Config.ROWS_AHEAD + Config.ROWS_BEHIND) {
      this.highestRow++;
      this.rows.push(this.createRow(this.highestRow, score));
    }
  }

  reset(score) {
    this.rows       = [];
    this.cameraRow  = 0;
    this.highestRow = 0;
    for (let i=0; i<Config.ROWS_AHEAD; i++) {
      this.rows.push(this.createRow(i, score));
    }
  }

  // advance camera one row forward (player moved forward)
  advance() { this.cameraRow++; }

  // obstacle half-width in grid units
  obsHW(type) { return (AssetData.OBSTACLE_GW[type]||1.2) / 2; }
}

/* ============================================================
   Player — grid coordinates + hop animation
   gx = column (0..COLS), gy = world row index
   During a hop: animates from (gx,gy) → (tgx,tgy)
   hop = 0..1 arc height
   ============================================================ */
class Player {
  constructor() { this.reset(); }

  reset() {
    this.gx  = Config.COLS / 2;
    this.gy  = 0;                // start at row 0
    this.tgx = Config.COLS / 2;
    this.tgy = 0;
    this.startGx = this.gx;
    this.startGy = this.gy;
    this.hopDist = 1;
    this.moving  = false;
    this.alive   = true;
    this.hop     = 0;     // 0..1 arc progress
    this.hopDir  = 0;     // -1 left, 0 straight, 1 right
    this.squish  = 0;
    this.pendingForward = false;
  }

  move(direction) {
    if (!this.alive || this.moving) return;

    const dgx = direction==='left' ? -1 : direction==='right' ? 1 : 0;
    const dgy = direction==='up'   ?  1 : direction==='down'  ? -1 : 0;

    this.tgx = clamp(this.gx + dgx, 0, Config.COLS - 0.01);
    this.tgy = this.gy + dgy;

    this.startGx = this.gx;
    this.startGy = this.gy;
    this.hopDist = Math.sqrt(
      (this.tgx-this.gx)**2 + (this.tgy-this.gy)**2
    ) || 1;

    this.moving  = true;
    this.hop     = 0;
    this.hopDir  = dgx;
    this.pendingForward = (direction==='up');
  }

  update(dt) {
    let completed = false;

    if (this.squish>0) this.squish = Math.max(0, this.squish - dt*5);

    if (this.moving) {
      const speed = Config.HOP_SPEED * dt;
      const dx = this.tgx - this.gx;
      const dy = this.tgy - this.gy;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < speed*1.2 || dist < 0.02) {
        this.gx     = this.tgx;
        this.gy     = this.tgy;
        this.moving = false;
        this.hop    = 0;
        this.squish = 0.4;
        completed   = true;
      } else {
        const ratio    = speed / dist;
        this.gx += dx * ratio;
        this.gy += dy * ratio;
        const progress = 1 - dist / this.hopDist;
        this.hop = Math.sin(Math.PI * progress) * 0.7;
      }
    }
    return completed;
  }

  applyWaterDrift(rows, dt) {
    rows.forEach(row => {
      if (row.type!=='water' || !row.obstacles.length) return;
      if (Math.abs(row.gy - this.gy) > 0.6) return;
      row.obstacles.forEach(ob => {
        const hw = AssetData.OBSTACLE_GW[row.obstacleType||'log'] / 2;
        if (this.gx > ob.gx-hw && this.gx < ob.gx+hw) {
          const drift = row.speed * row.dir * dt * 60;
          this.gx  += drift;
          this.tgx += drift;
        }
      });
    });
    this.gx = clamp(this.gx, 0, Config.COLS-0.01);
  }
}

/* ============================================================
   Renderer — draws everything using iso() projection
   ============================================================ */
class Renderer {
  constructor(c) {
    this.canvas = c;
    this.ctx    = c.getContext('2d');
    this.frame  = 0;
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  get W() { return this.canvas.width;  }
  get H() { return this.canvas.height; }

  clear() { this.ctx.clearRect(0,0,this.W,this.H); }

  tick() { this.frame++; }

  /* ── Background ─────────────────────────────────────── */
  drawBackground(score, worldOffset) {
    const ctx = this.ctx;
    const era = AssetData.ERAS[
      score>=Config.ERA_CONCRETE?3:score>=Config.ERA_CONSTRUCTION?2:score>=Config.ERA_DEVELOPMENT?1:0
    ];
    const grad = ctx.createLinearGradient(0,0,0,this.H);
    grad.addColorStop(0, era.bg1);
    grad.addColorStop(1, era.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,this.W,this.H);

    // Skyline silhouette
    this._drawSkyline(score);

    // Palms fade out
    const op = Math.max(0, 1-score/80);
    if (op>0) {
      for (let i=0; i<5; i++) {
        const px = (this.W*i/4.5 + worldOffset*0.06) % (this.W+60) - 30;
        this._drawPalm(px, this.H*0.36, op);
      }
    }
  }

  _drawSkyline(score) {
    const ctx = this.ctx;
    const hy  = this.H * 0.28;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const bs = [{w:22,h:65},{w:38,h:95},{w:28,h:72},{w:52,h:125},{w:32,h:82},
                {w:20,h:58},{w:42,h:105},{w:30,h:78},{w:24,h:68}];
    let bx = this.W*0.05;
    bs.forEach((b,i)=>{
      ctx.fillRect(bx, hy-b.h, b.w, b.h);
      if (score>50 && i%3===0) {
        ctx.fillStyle='rgba(220,140,0,0.35)';
        ctx.fillRect(bx+b.w/2-2, hy-b.h-32, 4, 32);
        ctx.fillRect(bx+b.w/2-2, hy-b.h-32, 26, 3);
        ctx.fillStyle='rgba(0,0,0,0.25)';
      }
      bx += b.w+8+(i*3%12);
    });
  }

  _drawPalm(x, y, op) {
    const ctx  = this.ctx;
    const sway = Math.sin(this.frame*0.018)*0.06;
    ctx.save();
    ctx.globalAlpha = op*0.7;
    ctx.strokeStyle='#5d3a1a'; ctx.lineWidth=5; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.quadraticCurveTo(x+10,y-30, x+6+sway*18,y-60);
    ctx.stroke();
    ctx.fillStyle='#2d7a2a';
    const tx=x+6+sway*18, ty=y-60;
    for (let a=0; a<Math.PI*2; a+=Math.PI/4) {
      ctx.save(); ctx.translate(tx,ty); ctx.rotate(a+sway);
      ctx.beginPath(); ctx.ellipse(14,0,16,4,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ── Iso tile row ───────────────────────────────────── */
  // Draws a full-width iso tile strip for a world row
  drawRow(row, cameraRow) {
    const ctx = this.ctx;
    const COLS = Config.COLS;
    const TW = Config.TILE_W, TH = Config.TILE_H, TD = Config.TILE_DEPTH;

    // Draw each column tile as an iso diamond
    for (let col=0; col<COLS; col++) {
      const s  = iso(col,     row.gy, cameraRow);
      const s2 = iso(col+1,   row.gy, cameraRow);
      const s3 = iso(col+1,   row.gy+1, cameraRow);
      const s4 = iso(col,     row.gy+1, cameraRow);

      // Skip tiles off screen
      if (s.x > this.W+TW || s2.x < -TW) continue;
      if (s.y < -TH*3     || s4.y > this.H+TH*3) continue;

      // Top face (diamond)
      ctx.fillStyle = row.color;
      ctx.beginPath();
      ctx.moveTo(s.x,  s.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.lineTo(s4.x, s4.y);
      ctx.closePath();
      ctx.fill();

      // Left side face (front-left)
      const dark = this._darken(row.color, 0.35);
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(s4.x, s4.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.lineTo(s3.x, s3.y+TD);
      ctx.lineTo(s4.x, s4.y+TD);
      ctx.closePath();
      ctx.fill();

      // Right side face (front-right)
      ctx.fillStyle = this._darken(row.color, 0.55);
      ctx.beginPath();
      ctx.moveTo(s3.x, s3.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s2.x, s2.y+TD);
      ctx.lineTo(s3.x, s3.y+TD);
      ctx.closePath();
      ctx.fill();

      // Top highlight
      ctx.strokeStyle = this._lighten(row.color, 0.15);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x,s.y); ctx.lineTo(s2.x,s2.y);
      ctx.moveTo(s.x,s.y); ctx.lineTo(s4.x,s4.y);
      ctx.stroke();

      // Water shimmer
      if (row.type==='water') {
        ctx.fillStyle = `rgba(255,255,255,${0.05+Math.sin(this.frame*0.04+col)*0.04})`;
        ctx.beginPath();
        ctx.moveTo(s.x,s.y); ctx.lineTo(s2.x,s2.y);
        ctx.lineTo(s3.x,s3.y); ctx.lineTo(s4.x,s4.y);
        ctx.closePath(); ctx.fill();
      }

      // Road dash
      if (row.type==='road' && col%2===0) {
        const mid = iso(col+0.5, row.gy+0.5, cameraRow);
        ctx.fillStyle='rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.arc(mid.x, mid.y, 3, 0, Math.PI*2); ctx.fill();
      }
    }

    // Draw obstacles
    row.obstacles.forEach(ob => this._drawObstacle(ob, row, cameraRow));

    // Draw collectible
    if (row.collectible && !row.collectible.collected) {
      this._drawCollectible(row.collectible, row.gy, cameraRow);
    }
  }

  _drawObstacle(ob, row, cameraRow) {
    const ctx  = this.ctx;
    const gw   = AssetData.OBSTACLE_GW[row.obstacleType] || 1.2;
    const s    = iso(ob.gx, row.gy+0.5, cameraRow);

    ctx.save();
    ctx.translate(s.x, s.y);
    if (row.dir < 0) ctx.scale(-1, 1);

    const TW = Config.TILE_W, TH = Config.TILE_H;
    const w  = gw * TW * 0.5;  // pixel width on screen
    const h  = TH * 0.85;

    switch(row.obstacleType) {
      case 'car': case 'suv': {
        const c = row.obstacleType==='suv' ? '#1a1a2e' : '#cc3333';
        ctx.fillStyle=c;
        ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,5); ctx.fill();
        ctx.fillStyle='#aaddff';
        ctx.fillRect(-w/2+4,-h/2+4,w/3,h/2-3);
        ctx.fillStyle='#ffe840';
        ctx.fillRect(w/2-10,-h/4,8,5);
        ctx.fillStyle='#222';
        for (const wx of [-w/3, w/3]) {
          ctx.beginPath(); ctx.arc(wx,h/2-2,4,0,Math.PI*2); ctx.fill();
        }
        break;
      }
      case 'truck':
        ctx.fillStyle='#cc6600';
        ctx.fillRect(-w/2,-h/2,w*0.62,h);
        ctx.fillStyle='#cc3300';
        ctx.fillRect(-w/2+w*0.62,-h/2,w*0.38,h);
        ctx.fillStyle='#888';
        for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(-w/2+8+i*(w-16)/3,h/2-1,5,0,Math.PI*2);ctx.fill();}
        break;
      case 'bulldozer':
        ctx.fillStyle='#ddaa00';
        ctx.fillRect(-w/2,-h/3,w*0.65,h*0.6);
        ctx.fillStyle='#aa7700';
        ctx.fillRect(w/2-w*0.38,-h/2,w*0.38,h);
        ctx.fillStyle='#555';
        ctx.fillRect(-w/2,h/4,w,h/5);
        break;
      case 'crane':
        ctx.fillStyle='#dd8800';
        ctx.fillRect(-w/2,-h/2,w*0.22,h);
        ctx.fillStyle='#ffaa00';
        ctx.fillRect(-w/4,-h*1.4,w*0.1,h);
        ctx.strokeStyle='#ff8800'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-w/4,-h*1.4); ctx.lineTo(w/2,-h/2); ctx.stroke();
        break;
      case 'log':
        ctx.fillStyle='#8B5E3C';
        ctx.beginPath(); ctx.roundRect(-w/2,-h/3,w,h*0.6,7); ctx.fill();
        ctx.fillStyle='#a07040';
        for(let i=0;i<3;i++) ctx.fillRect(-w/2+8+i*(w-16)/2.5,-h/7,3,h*0.33);
        break;
      case 'yacht':
        ctx.fillStyle='#fff';
        ctx.beginPath();
        ctx.moveTo(-w/2,h/3); ctx.lineTo(w/2,h/3);
        ctx.lineTo(w/3,-h/3); ctx.lineTo(-w/3,-h/3);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle='#cc0000';
        ctx.fillRect(-w/4,-h/3,w/2,h/6);
        ctx.strokeStyle='#aaa'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(0,-h/3); ctx.lineTo(0,-h); ctx.stroke();
        break;
      case 'fence':
        ctx.strokeStyle='#ffaa00'; ctx.lineWidth=3;
        ctx.strokeRect(-w/2,-h/2,w,h);
        ctx.strokeStyle='#ff8800'; ctx.lineWidth=1.5;
        ctx.beginPath();
        for(let i=0;i<=w;i+=12){ctx.moveTo(-w/2+i,-h/2);ctx.lineTo(-w/2+i+9,h/2);}
        ctx.stroke();
        break;
      case 'journalist':
        ctx.font=`${TH*0.9}px serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('📸',0,0);
        break;
      case 'helicopter': {
        const spin=(this.frame*0.22)%(Math.PI*2);
        ctx.fillStyle='#444';
        ctx.beginPath(); ctx.ellipse(0,0,w/2,h/3,0,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#888'; ctx.lineWidth=3;
        ctx.save(); ctx.rotate(spin);
        ctx.beginPath(); ctx.moveTo(-w/2,0); ctx.lineTo(w/2,0); ctx.stroke();
        ctx.restore();
        break;
      }
    }
    ctx.restore();
  }

  _drawCollectible(col, gy, cameraRow) {
    const icons = ['💰','📄','📰','🦐','🪶','💰'];
    const s     = iso(col.gx, gy+0.5, cameraRow);
    const bob   = Math.sin(this.frame*0.09+col.gx)*4;
    this.ctx.font=`${Config.TILE_H*0.55}px serif`;
    this.ctx.textAlign='center'; this.ctx.textBaseline='middle';
    this.ctx.fillText(icons[Math.floor(col.gx*3)%icons.length], s.x, s.y+bob-8);
  }

  /* ── Player flamingo ────────────────────────────────── */
  drawPlayer(player, charIndex, cameraRow) {
    if (!player.alive) return;
    const ctx  = this.ctx;
    const char = AssetData.CHARACTERS[charIndex];

    // Project grid position to screen
    const s = iso(player.gx, player.gy, cameraRow);
    // Hop height: lift upward in screen space
    const hopH = player.hop * Config.TILE_H * 1.2;

    const TH = Config.TILE_H;
    const s2 = TH * 0.48;
    const sqX = 1 + player.squish*0.3;
    const sqY = 1 - player.squish*0.2;

    ctx.save();
    ctx.translate(s.x, s.y - hopH);
    ctx.scale(sqX, sqY);

    // Shadow on tile below (grows when hopping)
    ctx.save();
    ctx.translate(0, hopH*0.4 + s2*0.5);
    ctx.scale(1, 0.25);
    ctx.globalAlpha = 0.25 * (1 - player.hop*0.6);
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.ellipse(0,0,s2*0.65,s2*0.65,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha=1;

    // Legs
    const legSway = Math.sin(this.frame*0.3)*0.3;
    ctx.strokeStyle=char.color; ctx.lineWidth=4; ctx.lineCap='round';
    [[-0.14,-legSway],[0.14,legSway]].forEach(([lx,sw])=>{
      ctx.beginPath();
      ctx.moveTo(lx*s2*2, s2*0.28);
      ctx.lineTo((lx+sw)*s2*2, s2*0.82);
      ctx.stroke();
    });

    // Body
    ctx.fillStyle=char.color;
    ctx.beginPath(); ctx.ellipse(0,0,s2*0.55,s2*0.44,0,0,Math.PI*2); ctx.fill();

    // Wing
    const ws = player.hopDir>=0 ? 1 : -1;
    ctx.save();
    ctx.rotate(Math.sin(this.frame*0.14)*0.18);
    ctx.beginPath();
    ctx.ellipse(-s2*0.28*ws,0,s2*0.34,s2*0.17,0.36*ws,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Neck
    ctx.strokeStyle=char.color; ctx.lineWidth=s2*0.33; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(s2*0.1,-s2*0.18);
    ctx.quadraticCurveTo(s2*0.38,-s2*0.58,s2*0.18,-s2*0.9);
    ctx.stroke();

    // Head
    ctx.fillStyle=char.color;
    ctx.beginPath(); ctx.arc(s2*0.18,-s2*0.9,s2*0.22,0,Math.PI*2); ctx.fill();

    // Beak
    ctx.fillStyle='#ff8800';
    ctx.beginPath(); ctx.moveTo(s2*0.36,-s2*0.9); ctx.lineTo(s2*0.62,-s2*0.81); ctx.lineTo(s2*0.36,-s2*0.79); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#cc6600';
    ctx.beginPath(); ctx.moveTo(s2*0.36,-s2*0.87); ctx.lineTo(s2*0.62,-s2*0.81); ctx.lineTo(s2*0.36,-s2*0.84); ctx.closePath(); ctx.fill();

    // Eye
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(s2*0.24,-s2*0.93,s2*0.07,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(s2*0.25,-s2*0.93,s2*0.04,0,Math.PI*2); ctx.fill();

    // Special
    this._drawSpecial(ctx, char.special, s2);
    ctx.restore();
  }

  _drawSpecial(ctx, special, s) {
    if (!special) return;
    ctx.font=`${s*0.44}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    switch(special) {
      case 'sign':
        ctx.strokeStyle='#cc8800'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-s*0.3,-s*0.1); ctx.lineTo(-s*0.3,-s*0.92); ctx.stroke();
        ctx.fillStyle='#fff'; ctx.fillRect(-s*0.56,-s*0.94,s*0.52,s*0.28);
        ctx.fillStyle='#cc0000'; ctx.font=`bold ${s*0.17}px Arial`;
        ctx.fillText('NO!',-s*0.3,-s*0.68);
        break;
      case 'eu':    ctx.fillText('🇪🇺', s*0.52, -s*1.2); break;
      case 'camera':ctx.fillText('📸',  s*0.6,  -s*1.2); break;
      case 'sparkles':
        ctx.fillStyle='rgba(255,215,0,0.6)';
        for(let i=0;i<5;i++){
          ctx.beginPath();
          ctx.arc(Math.cos(this.frame*0.08+i*1.26)*s*0.82, Math.sin(this.frame*0.08+i*1.26)*s*0.82-s*0.5, 2,0,Math.PI*2);
          ctx.fill();
        }
        break;
    }
  }

  /* ── PM character ───────────────────────────────────── */
  drawPM(pmChar) {
    if (!pmChar) return;
    pmChar.y = Math.min(this.H*0.16, pmChar.y+1.5);
    const ctx=this.ctx;
    ctx.save(); ctx.translate(pmChar.x, pmChar.y);
    ctx.font=`${Config.TILE_H*1.8}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🧑‍💼',0,0);
    ctx.fillStyle='rgba(200,0,50,0.88)';
    ctx.beginPath(); ctx.roundRect(-90,-Config.TILE_H*2-8,180,38,8); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 13px sans-serif';
    ctx.fillText('🏗️  "This is Progress!"',0,-Config.TILE_H*2+18);
    ctx.restore();
  }

  /* ── Construction sites ─────────────────────────────── */
  drawConstructionSites(sites) {
    const ctx=this.ctx;
    sites.forEach(cs=>{
      ctx.globalAlpha=Math.min(1,cs.life/0.6)*0.85;
      ctx.font=`${Config.TILE_H*0.75}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🏗️',cs.sx,cs.sy);
      ctx.strokeStyle='#ffaa00'; ctx.lineWidth=2;
      const r=Config.TILE_H*0.5;
      ctx.strokeRect(cs.sx-r,cs.sy-r,r*2,r*2);
    });
    ctx.globalAlpha=1;
  }

  /* ── Particles ──────────────────────────────────────── */
  drawParticles(particles) {
    const ctx=this.ctx;
    particles.forEach(p=>{
      ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha=1;
  }

  /* ── Menu animated bg ───────────────────────────────── */
  drawMenuBackground(frameCount) {
    const ctx=this.ctx;
    ctx.fillStyle='#0d0918'; ctx.fillRect(0,0,this.W,this.H);
    for(let i=0;i<7;i++){
      const x=((this.W*i/6.2+frameCount*(0.18+i*0.09))%(this.W+60))-30;
      const y=this.H*0.28+Math.sin(frameCount*0.018+i*0.9)*28;
      ctx.globalAlpha=0.12;
      ctx.font=`${28+i*4}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='#ff88cc'; ctx.fillText('🦩',x,y);
    }
    ctx.globalAlpha=1;
    ctx.fillStyle='#0a3d62';
    ctx.fillRect(0,this.H*0.74,this.W,this.H);
    for(let i=0;i<9;i++){
      ctx.fillStyle=`rgba(29,196,160,${0.06+i*0.008})`;
      const wy=this.H*0.74+i*16+Math.sin(frameCount*0.025+i*0.6)*4;
      ctx.fillRect(0,wy,this.W,3+i*0.4);
    }
  }

  _darken(hex,r){
    const R=parseInt(hex.slice(1,3),16),G=parseInt(hex.slice(3,5),16),B=parseInt(hex.slice(5,7),16);
    return `rgb(${Math.round(R*(1-r))},${Math.round(G*(1-r))},${Math.round(B*(1-r))})`;
  }
  _lighten(hex,r){
    const R=parseInt(hex.slice(1,3),16),G=parseInt(hex.slice(3,5),16),B=parseInt(hex.slice(5,7),16);
    return `rgb(${Math.round(R+(255-R)*r)},${Math.round(G+(255-G)*r)},${Math.round(B+(255-B)*r)})`;
  }
}

/* ============================================================
   InputManager
   ============================================================ */
class InputManager {
  constructor(c, onAction) {
    this.onAction = onAction;
    this.tx=0; this.ty=0;
    window.addEventListener('keydown', e=>{
      const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',
                 w:'up',s:'down',a:'left',d:'right',' ':'up'};
      if(map[e.key]){e.preventDefault();this.onAction(map[e.key]);}
    });
    c.addEventListener('touchstart',e=>{this.tx=e.touches[0].clientX;this.ty=e.touches[0].clientY;},{passive:true});
    c.addEventListener('touchend',e=>{
      const dx=e.changedTouches[0].clientX-this.tx;
      const dy=e.changedTouches[0].clientY-this.ty;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<22){this.onAction('up');return;}
      if(Math.abs(dx)>Math.abs(dy)) this.onAction(dx>0?'right':'left');
      else                          this.onAction(dy>0?'down':'up');
    },{passive:true});
  }
}

/* ============================================================
   UIManager
   ============================================================ */
class UIManager {
  showScreen(id){
    document.querySelectorAll('.screen').forEach(s=>{s.classList.add('hidden');s.classList.remove('active');});
    if(id){const el=document.getElementById(id);el.classList.remove('hidden');el.classList.add('active');}
  }
  hideAllScreens(){document.querySelectorAll('.screen').forEach(s=>{s.classList.add('hidden');s.classList.remove('active');});}
  setHUD(v){
    document.getElementById('hud').classList[v?'remove':'add']('hidden');
    document.getElementById('mobileHint').classList[v?'remove':'add']('hidden');
  }
  updateScore(s){document.getElementById('scoreDisplay').textContent=`🦩 ${s}m`;}
  updateEra(s){
    const era=AssetData.ERAS[s>=Config.ERA_CONCRETE?3:s>=Config.ERA_CONSTRUCTION?2:s>=Config.ERA_DEVELOPMENT?1:0];
    document.getElementById('eraDisplay').textContent=era.name;
  }
  showPMBanner(){const e=document.getElementById('pmBanner');e.classList.remove('hidden');setTimeout(()=>e.classList.add('hidden'),3200);}
  hidePMBanner(){document.getElementById('pmBanner').classList.add('hidden');}
  showCollectible(){
    const raw=AssetData.COLLECTIBLES[randInt(0,AssetData.COLLECTIBLES.length-1)];
    const title=raw.title.replace('{N}',randInt(100,999)).replace('{T}',rand(0.1,2.9).toFixed(1));
    document.getElementById('collectibleTitle').textContent=raw.icon+' '+title;
    document.getElementById('collectibleDesc').textContent=raw.desc;
    const el=document.getElementById('collectiblePopup');
    el.classList.remove('hidden');
    clearTimeout(this._ct);
    this._ct=setTimeout(()=>el.classList.add('hidden'),2600);
  }
  showGameOver({score,bestScore,cause,charLabel,leaderboard}){
    const wetlands=Math.floor(score/8);
    const resorts=Math.max(0,Math.floor(score/40)-1);
    const flamingos=Math.floor(score*52+rand(0,1000)).toLocaleString();
    document.getElementById('deathReason').textContent=`Cause: ${cause}`;
    document.getElementById('statsBlock').innerHTML=`
      <div class="stat-row"><span class="stat-label">Distance crossed</span><span class="stat-value highlight">${score}m</span></div>
      <div class="stat-row"><span class="stat-label">Personal best</span><span class="stat-value gold">${bestScore}m</span></div>
      <div class="stat-row"><span class="stat-label">Wetlands survived (briefly)</span><span class="stat-value">${wetlands}</span></div>
      <div class="stat-row"><span class="stat-label">Luxury resorts delayed</span><span class="stat-value">${resorts}</span></div>
      <div class="stat-row"><span class="stat-label">Flamingos relocated</span><span class="stat-value">${flamingos}</span></div>
      <div class="stat-funny">"Permit #${randInt(100,999)} approved in ${rand(0.1,1.9).toFixed(1)} seconds."<br>"Environmental review completed before being started."</div>`;
    document.getElementById('lbEntries').innerHTML=leaderboard.map(hs=>
      `<div class="lb-entry"><span class="lb-category">${hs.category}</span><span class="lb-score">${hs.score}m <span class="lb-name">– ${hs.name}</span></span></div>`
    ).join('');
    this.showScreen('gameoverScreen');
  }
  bindButtons({onStart,onRestart,onMenu,onCharSelect}){
    document.getElementById('startBtn').addEventListener('click',onStart);
    document.getElementById('restartBtn').addEventListener('click',onRestart);
    document.getElementById('backMenuBtn').addEventListener('click',onMenu);
    document.getElementById('charSelector').addEventListener('click',e=>{
      const btn=e.target.closest('.char-btn'); if(!btn) return;
      document.querySelectorAll('.char-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      onCharSelect(parseInt(btn.dataset.char,10));
    });
  }
}

/* ============================================================
   Game — main loop + state machine
   ============================================================ */
class Game {
  constructor() {
    Game.instance = this;
    canvas = document.getElementById('gameCanvas');
    ctx    = canvas.getContext('2d');

    this.renderer = new Renderer(canvas);
    this.world    = new World();
    this.player   = new Player();
    this.ui       = new UIManager();
    this.input    = new InputManager(canvas, dir => this._handleInput(dir));

    this.state        = 'menu';
    this.score        = 0;
    this.bestScore    = 0;
    this.selectedChar = 0;
    this.frameCount   = 0;
    this.lastTime     = 0;

    this.pmMode   = false;
    this.pmTimer  = 0;
    this.pmChar   = null;

    this.particles         = [];
    this.constructionSites = [];
    this.leaderboard       = JSON.parse(JSON.stringify(AssetData.LEADERBOARD));

    this._bindUI();
    window.addEventListener('resize', () => this.renderer.resize());
    this.renderer.resize();
    this.ui.showScreen('menuScreen');
    requestAnimationFrame(ts => this._loop(ts));
  }

  _bindUI() {
    this.ui.bindButtons({
      onStart:      ()  => this.startGame(),
      onRestart:    ()  => this.startGame(),
      onMenu:       ()  => { this.state='menu'; this.ui.showScreen('menuScreen'); this.ui.setHUD(false); },
      onCharSelect: idx => { this.selectedChar=idx; },
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

  _handleInput(dir) {
    if (this.state!=='playing') return;
    this.player.move(dir);
  }

  _loop(ts) {
    const dt = clamp((ts-this.lastTime)/1000, 0, 0.05);
    this.lastTime = ts;
    this.frameCount++;
    this.renderer.tick();
    this.renderer.clear();

    if (this.state==='playing') { this._update(dt); this._draw(); }
    else                        { this.renderer.drawMenuBackground(this.frameCount); }

    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    // Player hop
    const hopCompleted = this.player.update(dt);

    // After forward hop lands: advance camera
    if (hopCompleted && this.player.pendingForward) {
      this.player.pendingForward = false;
      this.world.advance();
      this.score++;
      this.ui.updateScore(this.score);
      this.ui.updateEra(this.score);
    }

    // Water drift
    this.player.applyWaterDrift(this.world.rows, dt);

    // World update
    this.world.update(dt, this.score, this.frameCount);

    // PM mode
    if (this.pmMode) {
      this.pmTimer -= dt;
      if (this.pmTimer<=0) { this.pmMode=false; this.pmChar=null; }
      if (Math.random()<Config.PM_SITE_RATE*dt*60) this._dropConstructionSite();
    } else if (this.score>0 && this.score%Config.PM_INTERVAL===0 && this.score>10) {
      this._activatePMMode();
    }

    // Construction sites
    this.constructionSites = this.constructionSites.filter(cs=>(cs.life-=dt)>0);

    // Particles
    this.particles = this.particles.filter(p=>{
      p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; p.vy+=0.14*dt*60; p.life-=dt;
      return p.life>0;
    });

    // Collisions
    if (!this.player.moving && this.player.alive) this._checkCollisions();
  }

  _draw() {
    this.renderer.drawBackground(this.score, this.world.cameraRow);

    // Sort rows back-to-front for iso painter's algorithm
    const sorted = [...this.world.rows].sort((a,b) => b.gy - a.gy);
    sorted.forEach(row => this.renderer.drawRow(row, this.world.cameraRow));

    this.renderer.drawConstructionSites(this.constructionSites);
    this.renderer.drawParticles(this.particles);
    this.renderer.drawPlayer(this.player, this.selectedChar, this.world.cameraRow);
    this.renderer.drawPM(this.pmChar);
  }

  _checkCollisions() {
    const { gx, gy } = this.player;
    const tile = Config.TILE_W;

    this.world.rows.forEach(row => {
      if (Math.abs(row.gy - gy) > 0.55) return;

      if (row.type==='water') {
        let onLog = false;
        row.obstacles.forEach(ob => {
          const hw = this.world.obsHW(row.obstacleType);
          if (gx > ob.gx-hw && gx < ob.gx+hw) onLog = true;
        });
        if (!onLog) this._die('drowned in the disappearing lagoon');
      }

      if (row.type==='road' || row.type==='construction') {
        row.obstacles.forEach(ob => {
          const hw = this.world.obsHW(row.obstacleType)*0.82;
          if (Math.abs(gx-ob.gx) < hw) {
            const causes = {
              car:'hit by a luxury car', suv:'run over by an SUV',
              truck:'flattened by a cement truck', bulldozer:'demolished by a bulldozer',
              crane:'hit by a falling crane', fence:'stopped by a construction fence',
              journalist:'surrounded by journalists', helicopter:'hit by a VIP helicopter',
            };
            this._die(causes[row.obstacleType]||'an obstacle');
          }
        });
      }

      if (row.collectible && !row.collectible.collected) {
        if (Math.abs(gx-row.collectible.gx)<0.7) {
          row.collectible.collected = true;
          const s = iso(gx, gy, this.world.cameraRow);
          this._spawnParticles(s.x, s.y, '#ffdd00', 12);
          this.ui.showCollectible();
        }
      }
    });

    // Fell off back
    if (gy < this.world.cameraRow - Config.ROWS_BEHIND) this._die('left behind');
  }

  _die(cause) {
    if (!this.player.alive) return;
    this.player.alive = false;
    const s = iso(this.player.gx, this.player.gy, this.world.cameraRow);
    this._spawnParticles(s.x, s.y, '#ff88cc', 30);

    if (this.score>this.bestScore) this.bestScore=this.score;
    this.leaderboard.forEach(e=>{
      if(this.score>e.score){e.score=this.score;e.name=AssetData.CHARACTERS[this.selectedChar].label;}
    });

    setTimeout(()=>{
      this.state='dead';
      this.ui.setHUD(false);
      this.ui.showGameOver({
        score:this.score, bestScore:this.bestScore, cause,
        charLabel:AssetData.CHARACTERS[this.selectedChar].label,
        leaderboard:this.leaderboard,
      });
    }, 900);
  }

  _activatePMMode() {
    if (this.pmMode) return;
    this.pmMode=true; this.pmTimer=Config.PM_DURATION;
    this.pmChar={x:canvas.width/2, y:-140};
    this.ui.showPMBanner();
    this._spawnParticles(canvas.width/2, 0, '#ff4444', 22);
  }

  _dropConstructionSite() {
    const gx = rand(1, Config.COLS-1);
    const gy = this.player.gy + rand(2, 5);
    const s  = iso(gx, gy, this.world.cameraRow);
    this.constructionSites.push({ sx:s.x, sy:s.y, life:6 });
    this._spawnParticles(s.x, s.y, '#ffaa00', 8);
  }

  _spawnParticles(x,y,color,count){
    for(let i=0;i<count&&this.particles.length<Config.PARTICLE_MAX;i++){
      this.particles.push({
        x,y,color,
        vx:(Math.random()-0.5)*4.5,
        vy:(Math.random()-0.5)*4.5-2,
        life:rand(0.4,0.9), size:rand(3,7),
      });
    }
  }
}

/* ── Boot ────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => { new Game(); });
