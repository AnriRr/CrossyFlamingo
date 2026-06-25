/**
 * ============================================================
 *  CROSSY FLAMINGO — game.js
 *
 *  Visual style: Crossy Road — horizontal lanes, blocky voxel
 *  objects, mild top-down angle with dark side faces for depth.
 *  Player moves bottom → top (forward = up the screen).
 *  No diamond tiles. Rows are flat horizontal strips.
 * ============================================================
 */
'use strict';

/* ─────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────── */
const CFG = {
  // Lane geometry
  LANE_H:      80,    // px height of each lane strip (top face)
  LANE_DEPTH:  30,    // px height of the dark side face below each lane
  COLS:        9,

  // Camera
  PLAYER_SCREEN_ROW: 3,
  CAMERA_SPEED:      2.5,

  // Hop animation in pixels
  HOP_PX_SPEED: 900,
  HOP_HEIGHT:   56,

  // World
  ROWS_ABOVE:  14,
  ROWS_BELOW:  5,

  // Systems
  PM_INTERVAL: 100,
  PM_DURATION: 8,
  PM_RATE:     0.018,
  MAX_PARTS:   120,

  ERA: [0, 30, 70, 130],
};

/* ─────────────────────────────────────────────────────────
   ASSET DATA
───────────────────────────────────────────────────────── */
const CHARS = [
  { color:'#ff88cc', label:'Classic Flamingo',       special:null        },
  { color:'#ff4455', label:'Angry Flamingo',          special:null        },
  { color:'#ffd700', label:'Golden Flamingo',         special:'sparkles'  },
  { color:'#4488ff', label:'EU Inspector Flamingo',   special:'eu'        },
  { color:'#8866cc', label:'Journalist Flamingo',     special:'camera'    },
  { color:'#dd7700', label:'Protest Flamingo',        special:'sign'      },
  { color:'#885533', label:'Albanian Eagle Flamingo', special:'eagle'     },
];

const COLLECTIBLES = [
  { icon:'💰', title:'Public Funds',       desc:'Approved for "infrastructure." Destination: unknown.'             },
  { icon:'📄', title:'Permit #{N}',        desc:'Approved in {T} seconds. Environmental review: pending forever.' },
  { icon:'📰', title:'Newspaper Headline', desc:'"Environmental review completed before being started."'           },
  { icon:'🦐', title:'Last Shrimp',        desc:'The final shrimp from the lagoon. Frame it.'                      },
  { icon:'🪶', title:'Flamingo Feather',   desc:'Evidence of prior flamingo habitation. Now a resort lobby.'      },
  { icon:'💰', title:'EU Cohesion Funds',  desc:'Earmarked for wetland preservation. Swiftly redirected.'         },
];

const ERAS = [
  { name:'🌿 Pristine Wetlands',   bg:'#1a4a2e' },
  { name:'🚧 Development Begins',  bg:'#1e3010' },
  { name:'🏗️ Resort Construction', bg:'#1e1e0a' },
  { name:'🏨 Concrete Paradise',   bg:'#181818' },
];

// obstacle pixel widths as fraction of lane height
const OB_W = {
  car:1.4, suv:1.8, truck:2.4, bulldozer:2.1, crane:1.6,
  log:2.6, yacht:3.2, fence:1.1, journalist:0.9, helicopter:2.2,
};

const LEADERBOARD = [
  { category:'🥇 Most Stubborn Flamingo', name:'EU Inspector',     score:0 },
  { category:'🥇 Most Permits Dodged',    name:'Protest Flamingo', score:0 },
  { category:'🥇 Longest Protest',        name:'Journalist',       score:0 },
  { category:'🥇 Least Corrupt Run',      name:'Classic',          score:0 },
];

/* ─────────────────────────────────────────────────────────
   UTILS
───────────────────────────────────────────────────────── */
const rand    = (a,b)     => a + Math.random()*(b-a);
const randInt = (a,b)     => Math.floor(rand(a,b+1));
const clamp   = (v,lo,hi) => Math.max(lo, Math.min(hi,v));

function darken(hex, t) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*(1-t))},${Math.round(g*(1-t))},${Math.round(b*(1-t))})`;
}
function lighten(hex, t) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r+(255-r)*t)},${Math.round(g+(255-g)*t)},${Math.round(b+(255-b)*t)})`;
}

/* ─────────────────────────────────────────────────────────
   LANE COORDINATE → SCREEN Y

   Lanes are indexed from the player outward.
   playerRow = the world-row the player is on.
   A row that is N lanes ahead of the player (further forward)
   appears N * LANE_STEP pixels ABOVE the player's screen Y.

   screenY(worldRow) = playerScreenY - (worldRow - playerRow) * LANE_STEP
   where LANE_STEP = LANE_H + LANE_DEPTH  (top face + side face)
───────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────
   WORLD  — lanes as horizontal strips
───────────────────────────────────────────────────────── */
class World {
  constructor() {
    this.lanes       = [];
    this.playerRow   = 0;    // integer — which world row player is on
    this.cameraRowF  = 0;    // float — smoothly follows playerRow
    this.highestRow  = 0;
  }

  get laneStep() { return CFG.LANE_H + CFG.LANE_DEPTH; }

  laneScreenY(worldRow, canvasH) {
    const playerScreenY = canvasH - CFG.PLAYER_SCREEN_ROW * this.laneStep;
    return playerScreenY - (worldRow - this.cameraRowF) * this.laneStep;
  }

  makeLane(worldRow, score, forceGrass) {
    if (forceGrass) {
      return { worldRow, type:'grass', topColor:'#4a9e58', speed:0, dir:1, obType:null, obs:[], collectible:null };
    }

    const r   = Math.random();
    const era = score>=CFG.ERA[3]?3 : score>=CFG.ERA[2]?2 : score>=CFG.ERA[1]?1 : 0;

    let type, topColor, speed=0, obType=null, obCount=2;

    if (era===0) {
      if      (r<0.45) { type='grass';        topColor='#4a9e58'; }
      else if (r<0.75) { type='water';        topColor='#2bc4a0'; speed=rand(120,200); obType='log';        obCount=2; }
      else             { type='road';         topColor='#666666'; speed=rand(150,260); obType='car';        obCount=2; }
    } else if (era===1) {
      if      (r<0.28) { type='grass';        topColor='#4a8a38'; }
      else if (r<0.45) { type='water';        topColor='#1a9999'; speed=rand(140,220); obType='log';        obCount=2; }
      else if (r<0.70) { type='road';         topColor='#777777'; speed=rand(180,300); obType='truck';      obCount=3; }
      else             { type='construction'; topColor='#b89020'; obType='fence';       obCount=3; }
    } else if (era===2) {
      if      (r<0.12) { type='grass';        topColor='#5a7040'; }
      else if (r<0.24) { type='water';        topColor='#2277aa'; speed=rand(160,260); obType='yacht';      obCount=2; }
      else if (r<0.55) { type='road';         topColor='#888888'; speed=rand(220,380); obType='truck';      obCount=4; }
      else if (r<0.78) { type='construction'; topColor='#c89a00'; obType='bulldozer';   obCount=3; }
      else             { type='road';         topColor='#888888'; speed=rand(200,320); obType='journalist'; obCount=2; }
    } else {
      if      (r<0.08) { type='grass';        topColor='#444444'; }
      else if (r<0.18) { type='water';        topColor='#225577'; speed=rand(200,320); obType='yacht';      obCount=3; }
      else if (r<0.48) { type='road';         topColor='#aaaaaa'; speed=rand(280,480); obType='suv';        obCount=5; }
      else if (r<0.72) { type='construction'; topColor='#cc9900'; obType='crane';       obCount=3; }
      else             { type='road';         topColor='#999999'; speed=rand(180,340); obType='helicopter'; obCount=2; }
    }

    const dir  = Math.random()>0.5 ? 1 : -1;
    const lane = { worldRow, type, topColor, speed, dir, obType, obs:[], collectible:null };

    if (type==='road' || type==='water') {
      const gap = 1 / obCount;
      let start = Math.random();
      for (let i=0; i<obCount; i++) {
        lane.obs.push({ frac: (start + i*gap*rand(0.65,1.1)) % 1 });
      }
    } else if (type==='construction') {
      for (let i=0; i<obCount; i++) {
        lane.obs.push({
          frac: (i/obCount) + rand(0, 0.8/obCount),
          moving: Math.random()>0.5,
          phase:  Math.random()*Math.PI*2,
        });
      }
    }

    return lane;
  }

  reset(score) {
    this.lanes       = [];
    this.playerRow   = 0;
    this.cameraRowF  = 0;
    const total = CFG.ROWS_ABOVE + CFG.ROWS_BELOW;
    this.highestRow  = total - 1;  // tracks the highest worldRow we've ever created
    for (let i = 0; i < total; i++) {
      this.lanes.push(this.makeLane(i, score, i < 3));
    }
  }

  advance() { this.playerRow++; }

  updateCamera(dt) {
    this.cameraRowF += (this.playerRow - this.cameraRowF) * Math.min(1, CFG.CAMERA_SPEED * dt);
  }

  update(dt, score, frame, W) {
    this.updateCamera(dt);

    this.lanes.forEach(lane => {
      if (lane.type==='road' || lane.type==='water') {
        lane.obs.forEach(ob => {
          ob.frac += lane.speed * lane.dir * dt / W;
          if (ob.frac >  1.2) ob.frac = -0.2;
          if (ob.frac < -0.2) ob.frac =  1.2;
        });
      }
      if (lane.type==='construction') {
        lane.obs.forEach(ob => {
          if (ob.moving) ob.frac += Math.sin(frame*0.018+ob.phase)*0.0003;
        });
      }
    });

    // Only cull rows that are fully below the camera's current view
    // Use cameraRowF - ROWS_BELOW - 1 to keep a buffer of already-seen rows
    const cutoff = Math.floor(this.cameraRowF) - CFG.ROWS_BELOW - 1;
    this.lanes = this.lanes.filter(l => l.worldRow >= cutoff);

    // Grow new rows above — only create rows we haven't made yet
    const needed = Math.ceil(this.cameraRowF) + CFG.ROWS_ABOVE;
    while (this.highestRow < needed) {
      this.highestRow++;
      this.lanes.push(this.makeLane(this.highestRow, score, false));
    }
  }

  obWidthPx(obType) {
    return (OB_W[obType]||1.4) * CFG.LANE_H;
  }
}

/* ─────────────────────────────────────────────────────────
   PLAYER
   px = x pixel position on screen
   row = world row index (integer when settled, fractional during hop)
───────────────────────────────────────────────────────── */
class Player {
  constructor() { this.reset(); }

  reset() {
    this.col  = 4;         // integer grid column (0..COLS-1)
    this.px   = 0;         // pixel x — derived from col, set by init()
    this.row  = 0;
    this.tpx  = 0;
    this.trow = 0;
    this.startPx   = 0;
    this.startRow  = 0;
    this.hopPixels = 1;
    this.moving    = false;
    this.alive     = true;
    this.hop       = 0;
    this.hopDir    = 0;
    this.squish    = 0;
    this.pendingFwd  = false;
    this.initialized = false;
  }

  init(W) {
    if (this.initialized) return;
    this.px = this.tpx = this._colToPx(this.col, W);
    this.initialized = true;
  }

  _colToPx(col, W) {
    // Center of column col, evenly distributed across canvas width
    return (col + 0.5) * (W / CFG.COLS);
  }

  move(dir, W) {
    if (!this.alive || this.moving) return;

    const laneStep = CFG.LANE_H + CFG.LANE_DEPTH;

    // Left/right: move one integer column, convert to exact pixel
    if (dir === 'left' || dir === 'right') {
      const newCol = clamp(this.col + (dir === 'left' ? -1 : 1), 0, CFG.COLS - 1);
      if (newCol === this.col) return;   // already at edge
      this.col = newCol;
      this.tpx  = this._colToPx(newCol, W);
      this.trow = this.row;
      const dpx = this.tpx - this.px;
      this.hopPixels = Math.abs(dpx) || laneStep;
      this.hopDir = dir === 'left' ? -1 : 1;
    } else {
      // Up/down: move one row
      const drow = dir === 'up' ? 1 : -1;
      this.tpx  = this.px;
      this.trow = this.row + drow;
      this.hopPixels = laneStep;
      this.hopDir = 0;
    }

    this.startPx    = this.px;
    this.startRow   = this.row;
    this.moving     = true;
    this.hop        = 0;
    this.pendingFwd = (dir === 'up');
  }

  update(dt) {
    let done = false;
    if (this.squish>0) this.squish = Math.max(0, this.squish-dt*5);

    if (this.moving) {
      const laneStep  = CFG.LANE_H + CFG.LANE_DEPTH;
      const speedPx   = CFG.HOP_PX_SPEED * dt;
      const dpx       = this.tpx  - this.px;
      const drow      = this.trow - this.row;
      const dRowPx    = drow * laneStep;
      const distPx    = Math.sqrt(dpx*dpx + dRowPx*dRowPx);

      if (distPx < speedPx * 1.2 || distPx < 0.5) {
        this.px     = this.tpx;   // snap to exact target — no float drift
        this.row    = this.trow;
        this.moving = false;
        this.hop    = 0;
        this.squish = 0.4;
        done = true;
      } else {
        const t     = speedPx / distPx;
        this.px  += dpx   * t;
        this.row += drow  * t;
        const progress = 1 - distPx / this.hopPixels;
        this.hop = Math.sin(Math.PI * progress) * 0.9;
      }
    }
    return done;
  }

  applyDrift(lanes, dt, W) {
    lanes.forEach(lane => {
      if (lane.type!=='water' || !lane.obs.length) return;
      if (Math.abs(lane.worldRow - this.row) > 0.55) return;
      lane.obs.forEach(ob => {
        const ox  = ob.frac * W;
        const ohw = (OB_W[lane.obType]||2.2)*CFG.LANE_H / 2;
        if (this.px > ox-ohw && this.px < ox+ohw) {
          const drift = lane.speed * lane.dir * dt;
          this.px  = clamp(this.px  + drift, 0, W);
          this.tpx = clamp(this.tpx + drift, 0, W);
          // Keep col in sync so next left/right hop starts from correct column
          this.col = clamp(Math.round(this.px / (W / CFG.COLS) - 0.5), 0, CFG.COLS - 1);
        }
      });
    });
  }
}

/* ─────────────────────────────────────────────────────────
   RENDERER
───────────────────────────────────────────────────────── */
class Renderer {
  constructor(canvas) {
    this.cv  = canvas;
    this.ctx = canvas.getContext('2d');
    this.f   = 0;   // frame counter
  }
  get W() { return this.cv.width;  }
  get H() { return this.cv.height; }
  resize() { this.cv.width=window.innerWidth; this.cv.height=window.innerHeight; }
  tick()   { this.f++; }
  clear()  { this.ctx.clearRect(0,0,this.W,this.H); }

  /* ── Sky ─────────────────────────────────────────────── */
  drawSky(score) {
    const ctx = this.ctx;
    const era = score>=CFG.ERA[3]?3:score>=CFG.ERA[2]?2:score>=CFG.ERA[1]?1:0;
    ctx.fillStyle = ERAS[era].bg;
    ctx.fillRect(0, 0, this.W, this.H);
    this._skyline(score);
  }

  _skyline(score) {
    const ctx = this.ctx;
    // Horizon sits where the top-most visible lane begins
    const hy = this.H * 0.08;
    const bs = [{w:22,h:55},{w:36,h:88},{w:26,h:66},{w:50,h:112},{w:30,h:75},
                {w:19,h:52},{w:40,h:98},{w:28,h:72},{w:23,h:62},{w:44,h:102}];
    let bx = this.W*0.03;
    bs.forEach((b,i) => {
      // Building body
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(bx, hy-b.h, b.w, b.h);
      // Windows
      ctx.fillStyle = 'rgba(255,220,100,0.25)';
      for (let wy=hy-b.h+6; wy<hy-6; wy+=14) {
        for (let wx=bx+4; wx<bx+b.w-6; wx+=8) {
          ctx.fillRect(wx, wy, 4, 6);
        }
      }
      // Crane in later eras
      if (score>50 && i%3===0) {
        ctx.fillStyle='rgba(220,140,0,0.35)';
        ctx.fillRect(bx+b.w/2-2, hy-b.h-28, 4, 28);
        ctx.fillRect(bx+b.w/2-2, hy-b.h-28, 24, 3);
      }
      bx += b.w + 6 + (i*3%10);
    });
  }

  /* ── Lane strip ──────────────────────────────────────── */
  // Draws one horizontal lane. topY = top of the flat face.
  drawLane(lane, topY) {
    const ctx = this.ctx;
    const W   = this.W;
    const H   = CFG.LANE_H;
    const D   = CFG.LANE_DEPTH;
    // Extend beyond canvas edges to fill screen after the skew transform
    const SKEW = 0.20;
    const OVR  = Math.ceil(SKEW * this.H) + 20;

    if (topY > this.H + H + D) return;
    if (topY + H + D < -H)     return;

    // Top face
    ctx.fillStyle = lane.topColor;
    ctx.fillRect(-OVR, topY, W + OVR*2, H);

    // Side face
    ctx.fillStyle = darken(lane.topColor, 0.42);
    ctx.fillRect(-OVR, topY + H, W + OVR*2, D);

    // Top edge highlight
    ctx.fillStyle = lighten(lane.topColor, 0.15);
    ctx.fillRect(-OVR, topY, W + OVR*2, 2);

    switch(lane.type) {
      case 'road':         this._roadLines(lane, topY, H);    break;
      case 'water':        this._waterShimmer(lane, topY, H); break;
      case 'grass':        this._grassTufts(lane, topY, H);   break;
      case 'construction': this._constructionStripes(topY, H); break;
    }

    lane.obs.forEach(ob => this._drawOb(ob, lane, topY, H));
  }

  _roadLines(lane, topY, H) {
    const ctx = this.ctx;
    ctx.fillStyle='rgba(255,255,255,0.16)';
    const dw=28, gap=56;
    const scroll = (this.f * lane.speed * lane.dir * 0.008) % gap;
    for (let x=-gap; x<this.W+gap; x+=gap) {
      ctx.fillRect(x + scroll, topY+H/2-2, dw, 4);
    }
  }

  _waterShimmer(lane, topY, H) {
    const ctx = this.ctx;
    for (let x=0; x<this.W; x+=42) {
      const alpha = 0.07 + Math.sin(this.f*0.04+x*0.08)*0.04;
      ctx.fillStyle=`rgba(255,255,255,${alpha})`;
      const wave = Math.sin(this.f*0.04+x*0.08)*3;
      ctx.fillRect(x, topY+H/2+wave-1, 22, 3);
    }
  }

  _grassTufts(lane, topY, H) {
    const ctx = this.ctx;
    ctx.fillStyle='rgba(0,0,0,0.10)';
    for (let x=10; x<this.W; x+=28+(lane.worldRow*7%14)) {
      ctx.fillRect(x,   topY+H*0.55, 3, 10);
      ctx.fillRect(x+7, topY+H*0.48, 2, 13);
    }
  }

  _constructionStripes(topY, H) {
    const ctx = this.ctx;
    ctx.fillStyle='rgba(0,0,0,0.18)';
    for (let x=-20; x<this.W+20; x+=22) {
      ctx.beginPath();
      ctx.moveTo(x, topY); ctx.lineTo(x+14, topY);
      ctx.lineTo(x+6, topY+H); ctx.lineTo(x-8, topY+H);
      ctx.closePath(); ctx.fill();
    }
  }

  /* ── Obstacle block ─────────────────────────────────── */
  _drawOb(ob, lane, topY, H) {
    const ctx = this.ctx;
    const cx  = ob.frac * this.W;
    const obW = (OB_W[lane.obType]||1.4) * H;
    const obH = H * 0.82;
    const D   = CFG.LANE_DEPTH;

    // Bounding box relative to (cx, topY + H/2)
    const x0 = cx - obW/2;
    const y0 = topY + (H - obH)/2;

    ctx.save();
    ctx.translate(cx, topY + H/2);
    if (lane.dir < 0) ctx.scale(-1,1);

    const w = obW, h = obH;

    // Side face (block depth below obstacle)
    ctx.fillStyle='rgba(0,0,0,0.32)';
    ctx.fillRect(-w/2, h/2, w, D*0.7);

    switch(lane.obType) {
      case 'car': case 'suv':
        this._car(ctx, w, h, lane.obType==='suv'?'#1a1a2e':'#cc3333'); break;
      case 'truck':    this._truck(ctx,w,h);     break;
      case 'bulldozer':this._bulldozer(ctx,w,h); break;
      case 'crane':    this._crane(ctx,w,h);     break;
      case 'log':      this._log(ctx,w,h);       break;
      case 'yacht':    this._yacht(ctx,w,h);     break;
      case 'fence':    this._fence(ctx,w,h);     break;
      case 'journalist':
        ctx.font=`${h}px serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('📸',0,0); break;
      case 'helicopter':this._heli(ctx,w,h);    break;
    }
    ctx.restore();
  }

  _car(ctx,w,h,body) {
    // Body top face
    ctx.fillStyle=body;
    ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,6); ctx.fill();
    // Side face of car body
    ctx.fillStyle=darken(body,0.4);
    ctx.fillRect(-w/2,h/2,w,CFG.LANE_DEPTH*0.5);
    // Windscreen
    ctx.fillStyle='#aaddff';
    ctx.beginPath(); ctx.roundRect(-w/4,-h/2+4,w/3,h*0.45,3); ctx.fill();
    // Headlight
    ctx.fillStyle='#ffe840';
    ctx.fillRect(w/2-10,-h/5,8,5);
    // Wheels
    ctx.fillStyle='#222';
    for (const wx of [-w/3.5, w/3.5]) {
      ctx.beginPath(); ctx.arc(wx,h/2-1,h*0.18,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#555'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(wx,h/2-1,h*0.1,0,Math.PI*2); ctx.stroke();
    }
  }

  _truck(ctx,w,h) {
    // Cargo
    ctx.fillStyle='#cc6600';
    ctx.fillRect(-w/2,-h/2,w*0.62,h);
    ctx.fillStyle=darken('#cc6600',0.4);
    ctx.fillRect(-w/2,h/2,w*0.62,CFG.LANE_DEPTH*0.5);
    // Cab
    ctx.fillStyle='#cc3300';
    ctx.beginPath(); ctx.roundRect(-w/2+w*0.62,-h/2,w*0.38,h,4); ctx.fill();
    ctx.fillStyle=darken('#cc3300',0.4);
    ctx.fillRect(-w/2+w*0.62,h/2,w*0.38,CFG.LANE_DEPTH*0.5);
    // Windscreen
    ctx.fillStyle='#88ccff';
    ctx.fillRect(-w/2+w*0.65,-h/2+5,w*0.3,h*0.45);
    // Wheels
    ctx.fillStyle='#222';
    for (let i=0;i<4;i++){
      ctx.beginPath(); ctx.arc(-w/2+10+i*(w-20)/3,h/2,h*0.18,0,Math.PI*2); ctx.fill();
    }
  }

  _bulldozer(ctx,w,h) {
    ctx.fillStyle='#ddaa00';
    ctx.fillRect(-w/2,-h/3,w*0.65,h*0.65);
    ctx.fillStyle=darken('#ddaa00',0.4);
    ctx.fillRect(-w/2,h*0.32,w*0.65,CFG.LANE_DEPTH*0.5);
    ctx.fillStyle='#aa7700';
    ctx.beginPath(); ctx.roundRect(w/2-w*0.38,-h/2,w*0.38,h,4); ctx.fill();
    ctx.fillStyle='#666';
    ctx.fillRect(-w/2,h*0.28,w,h*0.2);
  }

  _crane(ctx,w,h) {
    ctx.fillStyle='#dd8800';
    ctx.fillRect(-w/2,-h/2,w*0.22,h);
    ctx.fillStyle=darken('#dd8800',0.4);
    ctx.fillRect(-w/2,h/2,w*0.22,CFG.LANE_DEPTH*0.5);
    ctx.fillStyle='#ffaa00';
    ctx.fillRect(-w/4,-h*1.5,w*0.1,h);
    ctx.strokeStyle='#ff8800'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-w/4,-h*1.5); ctx.lineTo(w/2,-h/2); ctx.stroke();
  }

  _log(ctx,w,h) {
    ctx.fillStyle='#8B5E3C';
    ctx.beginPath(); ctx.roundRect(-w/2,-h*0.35,w,h*0.68,8); ctx.fill();
    ctx.fillStyle=darken('#8B5E3C',0.4);
    ctx.fillRect(-w/2,h*0.33,w,CFG.LANE_DEPTH*0.5);
    ctx.fillStyle='#a07040';
    for(let i=0;i<4;i++) ctx.fillRect(-w/2+8+i*(w-16)/3,-h/8,3,h*0.28);
    // End rings
    ctx.strokeStyle='#6b4020'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(-w/2+5,0,6,h*0.32,0,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w/2-5,0,6,h*0.32,0,0,Math.PI*2); ctx.stroke();
  }

  _yacht(ctx,w,h) {
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.moveTo(-w/2,h/3); ctx.lineTo(w/2,h/3);
    ctx.lineTo(w/3,-h/3); ctx.lineTo(-w/3,-h/3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=darken('#fff',0.3);
    ctx.fillRect(-w/2,h/3,w,CFG.LANE_DEPTH*0.5);
    ctx.fillStyle='#cc0000';
    ctx.fillRect(-w/4,-h/3,w/2,h/5);
    ctx.strokeStyle='#bbb'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,-h/3); ctx.lineTo(0,-h); ctx.stroke();
    ctx.fillStyle='rgba(200,220,255,0.45)';
    ctx.beginPath(); ctx.moveTo(0,-h); ctx.lineTo(w/2,-h/3); ctx.lineTo(0,-h/3); ctx.closePath(); ctx.fill();
  }

  _fence(ctx,w,h) {
    ctx.fillStyle='rgba(255,170,0,0.25)';
    ctx.fillRect(-w/2,-h/2,w,h);
    ctx.strokeStyle='#ffaa00'; ctx.lineWidth=3;
    ctx.strokeRect(-w/2,-h/2,w,h);
    ctx.lineWidth=1.5;
    ctx.beginPath();
    for(let i=0;i<=w;i+=13){ ctx.moveTo(-w/2+i,-h/2); ctx.lineTo(-w/2+i+10,h/2); }
    ctx.stroke();
  }

  _heli(ctx,w,h) {
    const spin=(this.f*0.22)%(Math.PI*2);
    ctx.fillStyle='#444';
    ctx.beginPath(); ctx.ellipse(0,0,w/2,h/3,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=darken('#444',0.4);
    ctx.fillRect(-w/2,h/3,w,CFG.LANE_DEPTH*0.4);
    ctx.strokeStyle='#888'; ctx.lineWidth=3;
    ctx.save(); ctx.rotate(spin);
    ctx.beginPath(); ctx.moveTo(-w/2,0); ctx.lineTo(w/2,0); ctx.stroke();
    ctx.restore();
    ctx.fillStyle='#88aaff';
    ctx.fillRect(-w/5,-h/4,w/4,h/2);
  }

  /* ── Flamingo player ────────────────────────────────── */
  drawPlayer(player, charIdx, world) {
    if (!player.alive) return;
    const ctx  = this.ctx;
    const char = CHARS[charIdx];
    const topY = world.laneScreenY(player.row, this.H);
    const hopPx = player.hop * CFG.HOP_HEIGHT;

    const cx = player.px;
    const cy = topY + CFG.LANE_H * 0.5 - hopPx;
    const S  = CFG.LANE_H * 0.46;   // base unit

    const sqX = 1 + player.squish * 0.3;
    const sqY = 1 - player.squish * 0.22;
    const c   = char.color;
    const cd  = darken(c, 0.38);     // darker shade for sides
    const cl  = lighten(c, 0.22);    // lighter for highlights

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sqX, sqY);

    // ── Shadow ──
    ctx.save();
    ctx.translate(0, S * 0.55 + hopPx);
    ctx.scale(1, 0.3);
    ctx.globalAlpha = 0.25 * (1 - player.hop * 0.6);
    ctx.fillStyle = '#000';
    ctx.fillRect(-S * 0.55, -S * 0.18, S * 1.1, S * 0.36);
    ctx.restore();
    ctx.globalAlpha = 1;

    // ── Legs — two blocky rectangles ──
    const legAnim = Math.sin(this.f * 0.28) * 0.12 * S;
    ctx.fillStyle = darken(c, 0.15);
    // Left leg
    ctx.fillRect(-S*0.22 - legAnim, S*0.28, S*0.14, S*0.52);
    // Right leg
    ctx.fillRect( S*0.08 + legAnim, S*0.28, S*0.14, S*0.52);
    // Feet (small horizontal blocks)
    ctx.fillRect(-S*0.28 - legAnim, S*0.76, S*0.26, S*0.1);
    ctx.fillRect( S*0.04 + legAnim, S*0.76, S*0.26, S*0.1);

    // ── Body — blocky rounded rect ──
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(-S*0.48, -S*0.30, S*0.96, S*0.60, S*0.12);
    ctx.fill();
    // Body bottom side face
    ctx.fillStyle = cd;
    ctx.beginPath();
    ctx.roundRect(-S*0.46, S*0.28, S*0.92, S*0.14, S*0.06);
    ctx.fill();
    // Body top highlight
    ctx.fillStyle = cl;
    ctx.beginPath();
    ctx.roundRect(-S*0.44, -S*0.28, S*0.88, S*0.14, S*0.06);
    ctx.fill();

    // ── Wing — flat side block ──
    const wSide = player.hopDir <= 0 ? -1 : 1;
    ctx.fillStyle = cd;
    ctx.beginPath();
    ctx.roundRect(wSide * S*0.36, -S*0.20, wSide * S*0.22, S*0.34, S*0.06);
    ctx.fill();

    // ── Neck — tall narrow block ──
    ctx.fillStyle = c;
    ctx.fillRect(-S*0.10, -S*0.82, S*0.20, S*0.54);
    // Neck side face
    ctx.fillStyle = cd;
    ctx.fillRect( S*0.10, -S*0.82, S*0.06, S*0.54);

    // ── Head — square block ──
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(-S*0.20, -S*1.18, S*0.40, S*0.36, S*0.08);
    ctx.fill();
    // Head top highlight
    ctx.fillStyle = cl;
    ctx.beginPath();
    ctx.roundRect(-S*0.18, -S*1.16, S*0.36, S*0.10, S*0.04);
    ctx.fill();
    // Head side face
    ctx.fillStyle = cd;
    ctx.beginPath();
    ctx.roundRect( S*0.18, -S*1.16, S*0.06, S*0.32, S*0.04);
    ctx.fill();

    // ── Beak — two flat blocks ──
    ctx.fillStyle = '#ff8800';
    ctx.fillRect(S*0.18, -S*1.08, S*0.28, S*0.09);   // upper
    ctx.fillStyle = '#dd6600';
    ctx.fillRect(S*0.18, -S*0.99, S*0.24, S*0.08);   // lower
    // Beak side
    ctx.fillStyle = '#bb4400';
    ctx.fillRect(S*0.44, -S*1.08, S*0.04, S*0.17);

    // ── Eye — white block + dark pupil ──
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-S*0.04, -S*1.14, S*0.14, S*0.12);
    ctx.fillStyle = '#111111';
    ctx.fillRect( S*0.02, -S*1.12, S*0.07, S*0.08);
    // Eye shine
    ctx.fillStyle = '#ffffff';
    ctx.fillRect( S*0.06, -S*1.12, S*0.025, S*0.03);

    // ── Character specials ──
    this._special(ctx, char.special, S);
    ctx.restore();
  }

  _special(ctx, sp, s) {
    if (!sp) return;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    switch(sp) {
      case 'sign':
        ctx.strokeStyle='#cc8800'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-s*0.3,-s*0.1); ctx.lineTo(-s*0.3,-s*0.92); ctx.stroke();
        ctx.fillStyle='#fff'; ctx.fillRect(-s*0.56,-s*0.94,s*0.52,s*0.28);
        ctx.fillStyle='#cc0000'; ctx.font=`bold ${s*0.17}px Arial`;
        ctx.fillText('NO!',-s*0.3,-s*0.68); break;
      case 'eu':
        ctx.font=`${s*0.42}px serif`; ctx.fillText('🇪🇺',s*0.52,-s*1.18); break;
      case 'camera':
        ctx.font=`${s*0.42}px serif`; ctx.fillText('📸',s*0.6,-s*1.2); break;
      case 'sparkles':
        ctx.fillStyle='rgba(255,215,0,0.65)';
        for(let i=0;i<5;i++){
          ctx.beginPath();
          ctx.arc(Math.cos(this.f*0.08+i*1.26)*s*0.82,
                  Math.sin(this.f*0.08+i*1.26)*s*0.82-s*0.5,2,0,Math.PI*2);
          ctx.fill();
        }
        break;
    }
  }

  /* ── PM character ───────────────────────────────────── */
  drawPM(pm) {
    if (!pm) return;
    pm.y = Math.min(this.H*0.15, pm.y+1.5);
    const ctx=this.ctx;
    ctx.save(); ctx.translate(pm.x, pm.y);
    ctx.font=`${CFG.LANE_H*1.6}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🧑‍💼',0,0);
    ctx.fillStyle='rgba(200,0,50,0.9)';
    ctx.beginPath(); ctx.roundRect(-90,-CFG.LANE_H*2,180,38,8); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 13px sans-serif';
    ctx.fillText('🏗️  "This is Progress!"',0,-CFG.LANE_H*2+20);
    ctx.restore();
  }

  /* ── Construction sites ─────────────────────────────── */
  drawSites(sites) {
    const ctx=this.ctx;
    sites.forEach(cs => {
      ctx.globalAlpha=Math.min(1,cs.life/0.6)*0.85;
      ctx.font=`${CFG.LANE_H*0.7}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🏗️',cs.x,cs.y);
      ctx.strokeStyle='#ffaa00'; ctx.lineWidth=2;
      const r=CFG.LANE_H*0.48;
      ctx.strokeRect(cs.x-r,cs.y-r,r*2,r*2);
    });
    ctx.globalAlpha=1;
  }

  /* ── Particles ──────────────────────────────────────── */
  drawParticles(parts) {
    const ctx=this.ctx;
    parts.forEach(p => {
      ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha=1;
  }

  /* ── Menu bg ────────────────────────────────────────── */
  drawMenuBg(f) {
    const ctx=this.ctx;
    ctx.fillStyle='#0d0918'; ctx.fillRect(0,0,this.W,this.H);
    for(let i=0;i<7;i++){
      const x=((this.W*i/6.2+f*(0.18+i*0.09))%(this.W+60))-30;
      const y=this.H*0.28+Math.sin(f*0.018+i*0.9)*28;
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
      ctx.fillRect(0, this.H*0.74+i*16+Math.sin(f*0.025+i*0.6)*4, this.W, 3+i*0.4);
    }
  }
}

/* ─────────────────────────────────────────────────────────
   INPUT
───────────────────────────────────────────────────────── */
class Input {
  constructor(cv, cb) {
    this.tx=0; this.ty=0;
    const MAP={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',
               w:'up',s:'down',a:'left',d:'right',' ':'up'};
    window.addEventListener('keydown', e => {
      if(MAP[e.key]){e.preventDefault(); cb(MAP[e.key]);}
    });
    cv.addEventListener('touchstart',e=>{this.tx=e.touches[0].clientX;this.ty=e.touches[0].clientY;},{passive:true});
    cv.addEventListener('touchend',e=>{
      const dx=e.changedTouches[0].clientX-this.tx;
      const dy=e.changedTouches[0].clientY-this.ty;
      if(Math.sqrt(dx*dx+dy*dy)<22){cb('up');return;}
      Math.abs(dx)>Math.abs(dy) ? cb(dx>0?'right':'left') : cb(dy>0?'down':'up');
    },{passive:true});
  }
}

/* ─────────────────────────────────────────────────────────
   UI
───────────────────────────────────────────────────────── */
class UI {
  screen(id){
    document.querySelectorAll('.screen').forEach(s=>{s.classList.add('hidden');s.classList.remove('active');});
    if(id){const e=document.getElementById(id);e.classList.remove('hidden');e.classList.add('active');}
  }
  noScreens(){document.querySelectorAll('.screen').forEach(s=>{s.classList.add('hidden');s.classList.remove('active');});}
  hud(v){
    document.getElementById('hud').classList[v?'remove':'add']('hidden');
    document.getElementById('mobileHint').classList[v?'remove':'add']('hidden');
  }
  score(s){document.getElementById('scoreDisplay').textContent=`🦩 ${s}m`;}
  era(s){
    const e=ERAS[s>=CFG.ERA[3]?3:s>=CFG.ERA[2]?2:s>=CFG.ERA[1]?1:0];
    document.getElementById('eraDisplay').textContent=e.name;
  }
  pmOn(){const e=document.getElementById('pmBanner');e.classList.remove('hidden');setTimeout(()=>e.classList.add('hidden'),3200);}
  pmOff(){document.getElementById('pmBanner').classList.add('hidden');}
  collectible(){
    const raw=COLLECTIBLES[randInt(0,COLLECTIBLES.length-1)];
    const title=raw.title.replace('{N}',randInt(100,999)).replace('{T}',rand(0.1,2.9).toFixed(1));
    document.getElementById('collectibleTitle').textContent=raw.icon+' '+title;
    document.getElementById('collectibleDesc').textContent=raw.desc;
    const el=document.getElementById('collectiblePopup');
    el.classList.remove('hidden'); clearTimeout(this._t);
    this._t=setTimeout(()=>el.classList.add('hidden'),2600);
  }
  gameOver({score,best,cause,char,lb}){
    document.getElementById('deathReason').textContent=`Cause: ${cause}`;
    const wl=Math.floor(score/8), res=Math.max(0,Math.floor(score/40)-1);
    const flam=Math.floor(score*52+rand(0,1000)).toLocaleString();
    document.getElementById('statsBlock').innerHTML=`
      <div class="stat-row"><span class="stat-label">Distance crossed</span><span class="stat-value highlight">${score}m</span></div>
      <div class="stat-row"><span class="stat-label">Personal best</span><span class="stat-value gold">${best}m</span></div>
      <div class="stat-row"><span class="stat-label">Wetlands survived</span><span class="stat-value">${wl}</span></div>
      <div class="stat-row"><span class="stat-label">Resorts delayed</span><span class="stat-value">${res}</span></div>
      <div class="stat-row"><span class="stat-label">Flamingos relocated</span><span class="stat-value">${flam}</span></div>
      <div class="stat-funny">"Permit #${randInt(100,999)} approved in ${rand(0.1,1.9).toFixed(1)}s."<br>"Environmental review: completed before starting."</div>`;
    document.getElementById('lbEntries').innerHTML=lb.map(e=>
      `<div class="lb-entry"><span class="lb-category">${e.category}</span><span class="lb-score">${e.score}m <span class="lb-name">– ${e.name}</span></span></div>`
    ).join('');
    this.screen('gameoverScreen');
  }
  bind({start,restart,menu,char}){
    document.getElementById('startBtn').addEventListener('click',start);
    document.getElementById('restartBtn').addEventListener('click',restart);
    document.getElementById('backMenuBtn').addEventListener('click',menu);
    document.getElementById('charSelector').addEventListener('click',e=>{
      const b=e.target.closest('.char-btn'); if(!b) return;
      document.querySelectorAll('.char-btn').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected'); char(+b.dataset.char);
    });
  }
}

/* ─────────────────────────────────────────────────────────
   GAME
───────────────────────────────────────────────────────── */
class Game {
  constructor() {
    Game.instance = this;
    const cv = document.getElementById('gameCanvas');

    this.rnd  = new Renderer(cv);
    this.wld  = new World();
    this.plr  = new Player();
    this.ui   = new UI();
    new Input(cv, d => this._input(d));

    this.state = 'menu';
    this.score = 0;
    this.best  = 0;
    this.char  = 0;
    this.frame = 0;
    this.last  = 0;

    this.pmMode  = false;
    this.pmTimer = 0;
    this.pmChar  = null;
    this.parts   = [];
    this.sites   = [];
    this.lb      = JSON.parse(JSON.stringify(LEADERBOARD));

    this.ui.bind({
      start:   () => this._start(),
      restart: () => this._start(),
      menu:    () => { this.state='menu'; this.ui.screen('menuScreen'); this.ui.hud(false); },
      char:    i  => { this.char=i; },
    });

    window.addEventListener('resize', () => this.rnd.resize());
    this.rnd.resize();
    this.ui.screen('menuScreen');
    requestAnimationFrame(t => this._loop(t));
  }

  _start() {
    this.state='playing'; this.score=0; this.frame=0;
    this.pmMode=false; this.pmTimer=0; this.pmChar=null;
    this.parts=[]; this.sites=[];
    this.wld.reset(0);
    this.plr.reset();
    this.plr.init(this.rnd.W);
    this.ui.noScreens(); this.ui.hud(true);
    this.ui.score(0); this.ui.era(0); this.ui.pmOff();
  }

  _input(dir) {
    if (this.state!=='playing') return;
    this.plr.init(this.rnd.W);
    this.plr.move(dir, this.rnd.W);
  }

  _loop(ts) {
    const dt = clamp((ts-this.last)/1000, 0, 0.05);
    this.last=ts; this.frame++; this.rnd.tick();
    this.rnd.clear();
    if (this.state==='playing') { this._update(dt); this._draw(); }
    else this.rnd.drawMenuBg(this.frame);
    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    this.plr.init(this.rnd.W);
    const done = this.plr.update(dt);

    // Camera advance happens exactly when forward hop lands
    if (done && this.plr.pendingFwd) {
      this.plr.pendingFwd = false;
      this.wld.advance();
      this.score++;
      this.ui.score(this.score);
      this.ui.era(this.score);
    }

    this.plr.applyDrift(this.wld.lanes, dt, this.rnd.W);
    this.wld.update(dt, this.score, this.frame, this.rnd.W);

    // PM mode
    if (this.pmMode) {
      this.pmTimer-=dt;
      if(this.pmTimer<=0){this.pmMode=false;this.pmChar=null;}
      if(Math.random()<CFG.PM_RATE*dt*60) this._dropSite();
    } else if(this.score>0 && this.score%CFG.PM_INTERVAL===0 && this.score>10) {
      this._pmActivate();
    }

    this.sites=this.sites.filter(s=>(s.life-=dt)>0);
    this.parts=this.parts.filter(p=>{
      p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; p.vy+=0.14*dt*60; p.life-=dt;
      return p.life>0;
    });

    if(!this.plr.moving && this.plr.alive) this._collide();
  }

  _draw() {
    this.rnd.drawSky(this.score);

    const ctx = this.rnd.ctx;
    const H   = this.rnd.H;
    const W   = this.rnd.W;

    // Viewing from the right looking left:
    // left side of screen = far = higher, right side = near = lower.
    // b = +SKEW shifts y DOWN as x increases (right side drops, left side rises).
    // f = -SKEW*W*0.5 re-centers so the middle of the screen stays put.
    const SKEW = 0.22;
    ctx.save();
    ctx.transform(1, SKEW, 0, 1, 0, -SKEW * W * 0.5);

    const sorted = [...this.wld.lanes].sort((a,b) => b.worldRow - a.worldRow);
    sorted.forEach(lane => {
      const topY = this.wld.laneScreenY(lane.worldRow, this.rnd.H);
      this.rnd.drawLane(lane, topY);
    });

    this.rnd.drawSites(this.sites);
    this.rnd.drawParticles(this.parts);
    this.rnd.drawPlayer(this.plr, this.char, this.wld);

    ctx.restore();
    this.rnd.drawPM(this.pmChar);
  }

  _collide() {
    const px  = this.plr.px;
    const row = Math.round(this.plr.row);

    this.wld.lanes.forEach(lane => {
      if (Math.abs(lane.worldRow - row) > 0.55) return;

      if (lane.type==='water') {
        let onLog=false;
        lane.obs.forEach(ob => {
          const ox=ob.frac*this.rnd.W, hw=this.wld.obWidthPx(lane.obType)/2;
          if(px>ox-hw && px<ox+hw) onLog=true;
        });
        if(!onLog) this._die('drowned in the disappearing lagoon');
      }

      if (lane.type==='road' || lane.type==='construction') {
        lane.obs.forEach(ob => {
          const ox=ob.frac*this.rnd.W, hw=this.wld.obWidthPx(lane.obType)*0.44;
          if(Math.abs(px-ox)<hw) {
            const c={car:'hit by a car',suv:'run over by an SUV',truck:'flattened by a cement truck',
                     bulldozer:'demolished by a bulldozer',crane:'crushed by a crane',
                     fence:'stopped by a construction fence',journalist:'surrounded by journalists',
                     helicopter:'hit by a VIP helicopter'};
            this._die(c[lane.obType]||'an obstacle');
          }
        });
      }
    });

    // Construction sites
    this.sites.forEach(s=>{
      if(Math.abs(px-s.x)<CFG.LANE_H*0.6 && Math.abs(this.wld.laneScreenY(row,this.rnd.H)+CFG.LANE_H/2-s.y)<CFG.LANE_H*0.6)
        this._die('buried under a PM construction site');
    });

    // Fell off back
    if(row < this.wld.playerRow - CFG.ROWS_BELOW) this._die('left behind');
  }

  _die(cause) {
    if(!this.plr.alive) return;
    this.plr.alive=false;
    const topY=this.wld.laneScreenY(Math.round(this.plr.row),this.rnd.H);
    this._burst(this.plr.px, topY+CFG.LANE_H/2, '#ff88cc', 30);
    if(this.score>this.best) this.best=this.score;
    this.lb.forEach(e=>{if(this.score>e.score){e.score=this.score;e.name=CHARS[this.char].label;}});
    setTimeout(()=>{
      this.state='dead'; this.ui.hud(false);
      this.ui.gameOver({score:this.score,best:this.best,cause,char:CHARS[this.char].label,lb:this.lb});
    },900);
  }

  _pmActivate() {
    if(this.pmMode) return;
    this.pmMode=true; this.pmTimer=CFG.PM_DURATION;
    this.pmChar={x:this.rnd.W/2, y:-120};
    this.ui.pmOn();
    this._burst(this.rnd.W/2, 0, '#ff4444', 22);
  }

  _dropSite() {
    const x   = rand(CFG.LANE_H, this.rnd.W-CFG.LANE_H);
    const row = this.wld.playerRow + randInt(2,5);
    const y   = this.wld.laneScreenY(row, this.rnd.H) + CFG.LANE_H/2;
    this.sites.push({x,y,life:6});
    this._burst(x,y,'#ffaa00',8);
  }

  _burst(x,y,color,n){
    for(let i=0;i<n&&this.parts.length<CFG.MAX_PARTS;i++){
      this.parts.push({x,y,color,
        vx:(Math.random()-0.5)*4.5, vy:(Math.random()-0.5)*4.5-2,
        life:rand(0.4,0.9), size:rand(3,7)});
    }
  }
}

window.addEventListener('DOMContentLoaded', () => { new Game(); });
