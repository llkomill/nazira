/* =========================================================
   Назира — сюрприз для сестры.
   Каждая фигура рисуется тысячами коротких «волосков»,
   как в референсе (turtle-сердце), только на canvas.
   Тексты можно поменять в CONFIG.
   ========================================================= */

const CONFIG = {
  name: 'Назира',
  nameFont: '"Lobster", "Pacifico", "Brush Script MT", cursive',
  scenes: [
    {
      main: 'Однажды ночью на небе зажглась новая звёздочка…',
      sub: ''
    },
    {
      main: '…и в нашу семью пришли самые маленькие ножки',
      sub: ''
    },
    {
      main: 'Добро пожаловать в этот мир, наша маленькая принцесса',
    }
  ],
  music: true
};

/* ---------- helpers ---------- */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (s) => document.querySelector(s);

const sky = $('#sky');
const art = $('#art');
const skyCtx = sky.getContext('2d');
const artCtx = art.getContext('2d');
const captionEl = $('#caption');
const captionMain = captionEl.querySelector('.main');
const captionSub = captionEl.querySelector('.sub');
const replayBtn = $('#replay');
const soundBtn = $('#sound');

let W = 0, H = 0, DPR = 1;

function resizeCanvases() {
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  for (const [c, ctx] of [[sky, skyCtx], [art, artCtx]]) {
    c.width = Math.round(W * DPR);
    c.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
}

/* ---------- palettes (h, s, l) ---------- */
const PALETTES = {
  gold:  () => [rand(34, 50),   rand(70, 95), rand(60, 82)],
  star:  () => [rand(42, 56),   rand(60, 90), rand(70, 86)],
  pink:  () => [rand(322, 350), rand(70, 95), rand(62, 82)],
  rose:  () => [rand(296, 332), rand(55, 85), rand(66, 84)],
  name:  () => Math.random() < 0.12 ? [rand(330, 345), 40, rand(88, 96)] : [rand(325, 352), rand(75, 95), rand(64, 82)]
};

/* =========================================================
   Field: rasterise a shape, build a distance field, then
   generate strokes that grow outward from the shape's core.
   ========================================================= */
function buildStrokes(layer) {
  const { x: bx, y: by, w, h } = layer.box;
  const cell = Math.max(1, Math.max(w, h) / 360);
  const pad = 2;
  const gw = Math.ceil(w / cell) + pad * 2;
  const gh = Math.ceil(h / cell) + pad * 2;

  const oc = document.createElement('canvas');
  oc.width = gw;
  oc.height = gh;
  const c = oc.getContext('2d');
  c.translate(pad, pad);
  c.scale(1 / cell, 1 / cell);
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  layer.draw(c, w, h);
  const px = c.getImageData(0, 0, gw, gh).data;

  // chamfer distance transform (distance to the outside, in cells)
  const N = gw * gh;
  const d = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % gw, y = (i / gw) | 0;
    const border = x === 0 || y === 0 || x === gw - 1 || y === gh - 1;
    d[i] = !border && px[i * 4 + 3] > 110 ? 1e9 : 0;
  }
  const S = Math.SQRT2;
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i - 1] + 1, d[i - gw] + 1, d[i - gw - 1] + S, d[i - gw + 1] + S);
    }
  }
  for (let y = gh - 2; y > 0; y--) {
    for (let x = gw - 2; x > 0; x--) {
      const i = y * gw + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i + 1] + 1, d[i + gw] + 1, d[i + gw + 1] + S, d[i + gw - 1] + S);
    }
  }

  const inside = [];
  const edge = [];
  const buckets = [];
  for (let i = 0; i < N; i++) {
    const v = d[i];
    if (!v) continue;
    inside.push(i);
    if (v < 1.6) edge.push(i);
    const b = Math.floor(v);
    (buckets[b] || (buckets[b] = [])).push(i);
  }
  const levels = buckets.filter(Boolean);
  if (!inside.length) return { strokes: [] };

  // outward direction = against the gradient of the distance field
  const outward = (i) => {
    const gx = d[i + 1] - d[i - 1];
    const gy = d[i + gw] - d[i - gw];
    if (Math.abs(gx) + Math.abs(gy) < 1e-3) return rand(0, TAU);
    return Math.atan2(-gy, -gx);
  };
  const pos = (i) => [
    bx + ((i % gw) - pad + Math.random()) * cell,
    by + (Math.floor(i / gw) - pad + Math.random()) * cell
  ];

  const k = clamp(Math.max(w, h) / 560, 0.55, 1.35) * (layer.lenMul || 1);
  const pal = PALETTES[layer.palette || 'pink'];
  const area = inside.length * cell * cell;
  const fillCount = clamp(Math.round(area * 0.15 * (layer.density || 1)), 500, 16000);
  const edgeCount = clamp(Math.round(edge.length * cell * 1.5 * (layer.density || 1)), 200, 4200);

  const fill = [];
  for (let n = 0; n < fillCount; n++) {
    // half the strokes pick a depth level first → bright glowing core, like the reference
    let i;
    if (Math.random() < 0.55) {
      const lvl = levels[(Math.random() * levels.length) | 0];
      i = lvl[(Math.random() * lvl.length) | 0];
    } else {
      i = inside[(Math.random() * inside.length) | 0];
    }
    const [x, y] = pos(i);
    const a = outward(i) + rand(-0.5, 0.5);
    const len = rand(4, 14) * k;
    const [hh, ss, ll] = pal();
    fill.push({
      x, y,
      x2: x + Math.cos(a) * len,
      y2: y + Math.sin(a) * len,
      w: rand(0.5, 1.25),
      c: `hsla(${hh},${ss}%,${ll}%,${rand(0.25, 0.55).toFixed(2)})`
    });
  }

  const halo = [];
  for (let n = 0; n < edgeCount; n++) {
    const i = edge[(Math.random() * edge.length) | 0];
    const [x, y] = pos(i);
    const a = outward(i) + rand(-0.7, 0.7);
    const len = rand(5, 22) * k * (layer.haloMul || 1);
    const [hh, ss, ll] = pal();
    halo.push({
      x, y,
      x2: x + Math.cos(a) * len,
      y2: y + Math.sin(a) * len,
      w: rand(0.35, 0.9),
      c: `hsla(${hh},${ss}%,${Math.min(ll + 8, 96)}%,${rand(0.18, 0.45).toFixed(2)})`
    });
  }

  // one pass: fill + halo, ordered along the layer's sweep so the shape
  // "grows" in a direction instead of appearing everywhere at once
  const sweep = layer.sweep || SWEEPS.random;
  const keyed = [];
  for (const s of fill) keyed.push([sweep((s.x - bx) / w, (s.y - by) / h) + rand(0, 0.12), s]);
  for (const s of halo) keyed.push([sweep((s.x - bx) / w, (s.y - by) / h) + rand(0.04, 0.2), s]);
  keyed.sort((a, b) => a[0] - b[0]);
  return { strokes: keyed.map((k) => k[1]) };
}

// sweep orders, (u, v) are 0..1 inside the layer box
const SWEEPS = {
  random: () => Math.random(),
  leftToRight: (u) => u,
  bottomUp: (u, v) => 1 - v,
  fromCenter: (u, v) => Math.hypot(u - 0.5, v - 0.5) * 2,
  fromCenterX: (u) => Math.abs(u - 0.5) * 2,
  around: (cx, cy, start) => (u, v) => {
    const a = Math.atan2(v - cy, u - cx);
    return (((start - a) % TAU) + TAU) % TAU / TAU;
  },
  from: (cx, cy) => (u, v) => Math.hypot(u - cx, v - cy) * 4
};

/* =========================================================
   Shapes (drawn into a w×h box, filled with white)
   ========================================================= */
function starPath(c, cx, cy, r, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = rot + (i * Math.PI) / 5;
    c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = r * 0.18;
  c.fill();
  c.stroke();
}

const shapes = {
  moon(c, w, h) {
    c.beginPath();
    c.arc(w * 0.46, h * 0.5, w * 0.36, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(w * 0.61, h * 0.40, w * 0.30, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  },
  bigStar(c, w, h) { starPath(c, w * 0.70, h * 0.57, w * 0.09, -Math.PI / 2 + 0.15); },
  smallStar(c, w, h) { starPath(c, w * 0.85, h * 0.24, w * 0.05, -Math.PI / 2 - 0.2); },

  // baby foot in unit space (y down, big toe on the inside), mirrored for the left foot
  sole(mirror, cx, cy, rot) {
    return (c, w) => {
      const u = w * 0.24;
      c.save();
      c.translate(w * cx, w * cy);
      c.rotate(rot);
      c.scale(mirror ? -u : u, u);
      c.beginPath(); c.ellipse(0.02, -0.33, 0.43, 0.44, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(-0.04, 0.52, 0.31, 0.37, 0, 0, TAU); c.fill();
      c.beginPath();
      c.moveTo(-0.3, -0.3);
      c.lineTo(0.44, -0.3);
      c.quadraticCurveTo(0.36, 0.2, 0.26, 0.52);
      c.lineTo(-0.3, 0.52);
      c.quadraticCurveTo(-0.16, 0.1, -0.3, -0.3);
      c.fill();
      c.restore();
    };
  },
  toes(mirror, cx, cy, rot) {
    const T = [[-0.30, -1.02, 0.18], [-0.01, -1.06, 0.125], [0.21, -0.99, 0.11], [0.38, -0.87, 0.095], [0.50, -0.70, 0.08]];
    return (c, w) => {
      const u = w * 0.24;
      c.save();
      c.translate(w * cx, w * cy);
      c.rotate(rot);
      c.scale(mirror ? -u : u, u);
      for (const [x, y, r] of T) {
        c.beginPath();
        c.ellipse(x, y, r, r * 1.12, 0, 0, TAU);
        c.fill();
      }
      c.restore();
    };
  },

  bow(c, w, h) {
    const cx = w / 2, cy = h * 0.37;
    for (const s of [-1, 1]) {
      // wing: narrow at the knot, wide at the outer end
      c.beginPath();
      c.moveTo(cx, cy);
      c.bezierCurveTo(cx + s * w * 0.1, cy - h * 0.45, cx + s * w * 0.4, cy - h * 0.66, cx + s * w * 0.49, cy - h * 0.32);
      c.bezierCurveTo(cx + s * w * 0.54, cy - h * 0.1, cx + s * w * 0.51, cy + h * 0.16, cx + s * w * 0.42, cy + h * 0.22);
      c.bezierCurveTo(cx + s * w * 0.3, cy + h * 0.28, cx + s * w * 0.12, cy + h * 0.12, cx, cy);
      c.fill();
      // inner fold of the ribbon
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.lineWidth = w * 0.022;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(cx + s * w * 0.12, cy - h * 0.04);
      c.quadraticCurveTo(cx + s * w * 0.28, cy - h * 0.16, cx + s * w * 0.4, cy - h * 0.08);
      c.stroke();
      c.restore();
      // ribbon tail
      c.beginPath();
      c.moveTo(cx + s * w * 0.02, cy + h * 0.04);
      c.quadraticCurveTo(cx + s * w * 0.12, cy + h * 0.32, cx + s * w * 0.24, cy + h * 0.56);
      c.lineTo(cx + s * w * 0.16, cy + h * 0.52);
      c.lineTo(cx + s * w * 0.13, cy + h * 0.62);
      c.quadraticCurveTo(cx + s * w * 0.04, cy + h * 0.34, cx - s * w * 0.03, cy + h * 0.08);
      c.fill();
    }
    c.beginPath();
    c.ellipse(cx, cy, w * 0.075, h * 0.15, 0, 0, TAU);
    c.fill();
  },

  name(text, fontSize) {
    return (c, w, h) => {
      c.font = `${fontSize}px ${CONFIG.nameFont}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h * 0.52);
    };
  }
};

/* =========================================================
   Scenes
   ========================================================= */
function artSquare() {
  const portrait = H > W;
  const s = Math.min(W * 0.9, H * (portrait ? 0.56 : 0.62));
  const cy = H * (portrait ? 0.43 : 0.4);
  return { x: (W - s) / 2, y: cy - s / 2, w: s, h: s };
}

function nameMetrics() {
  const c = document.createElement('canvas').getContext('2d');
  c.font = `100px ${CONFIG.nameFont}`;
  const tw = c.measureText(CONFIG.name).width || 300;
  const fs = Math.min((W * 0.86) / tw * 100, H * 0.2, 210);
  return { fs, tw: (tw * fs) / 100 };
}

// dur — how long a layer draws; overlap — start the next layer this much before the end
const SCENES = [
  {
    hold: 2200,
    layers: () => {
      const box = artSquare();
      return [
        { box, draw: shapes.moon, palette: 'gold', dur: 3600, overlap: 700, sweep: SWEEPS.around(0.46, 0.5, -1.15), burst: 40 },
        { box, draw: shapes.bigStar, palette: 'star', dur: 1000, overlap: 500, sweep: SWEEPS.from(0.7, 0.57), lenMul: 0.6, haloMul: 1.6, density: 0.8, burst: 50 },
        { box, draw: shapes.smallStar, palette: 'star', dur: 800, sweep: SWEEPS.from(0.85, 0.24), lenMul: 0.5, haloMul: 1.6, density: 0.8, burst: 35 }
      ];
    }
  },
  {
    hold: 2200,
    layers: () => {
      const box = artSquare();
      return [
        { box, draw: shapes.sole(true, 0.35, 0.57, -0.12), palette: 'pink', dur: 1300, overlap: 250, sweep: SWEEPS.bottomUp },
        { box, draw: shapes.toes(true, 0.35, 0.57, -0.12), palette: 'pink', dur: 650, overlap: 0, sweep: SWEEPS.leftToRight, burst: 45 },
        { box, draw: shapes.sole(false, 0.65, 0.46, 0.12), palette: 'pink', dur: 1300, overlap: 250, sweep: SWEEPS.bottomUp },
        { box, draw: shapes.toes(false, 0.65, 0.46, 0.12), palette: 'pink', dur: 650, sweep: SWEEPS.leftToRight, burst: 45 }
      ];
    }
  },
  {
    hold: 0,
    final: true,
    layers: () => {
      const { fs, tw } = nameMetrics();
      const nameH = fs * 1.9;
      const bowW = clamp(tw * 0.42, 110, 300);
      const bowH = bowW * 0.62;
      const portrait = H > W;
      const groupH = bowH + nameH * 0.85;
      const top = (portrait ? H * 0.4 : H * 0.38) - groupH / 2;
      const nameBox = { x: (W - tw * 1.2) / 2, y: top + bowH * 0.85, w: tw * 1.2, h: nameH };
      const bowBox = { x: (W - bowW) / 2, y: top, w: bowW, h: bowH };
      return [
        { box: bowBox, draw: shapes.bow, palette: 'rose', dur: 1800, overlap: 600, sweep: SWEEPS.fromCenterX, lenMul: 0.75 },
        { box: nameBox, draw: shapes.name(CONFIG.name, fs), palette: 'name', dur: 3800, sweep: SWEEPS.leftToRight, lenMul: 0.45, haloMul: 0.75, density: 1.2, glow: 0.22, burst: 220 }
      ];
    }
  }
];

/* =========================================================
   Player
   ========================================================= */
class Cancelled extends Error {}
let runToken = 0;
let currentScene = 0;
let started = false;
let finalMode = false;
let artDirty = false;

const guard = (t) => { if (t !== runToken) throw new Cancelled(); };
const wait = (ms, t) => new Promise((r) => setTimeout(r, ms)).then(() => guard(t));
const easeInOut = (x) => 0.5 - Math.cos(Math.PI * x) / 2;

const easeOut = (x) => 1 - Math.pow(1 - x, 2.2);

// draws the strokes along the sweep; magic dust trails the drawing front
function drawStrokes(list, dur, t) {
  return new Promise((resolve) => {
    let done = 0;
    const t0 = performance.now();
    const step = (now) => {
      if (t !== runToken) return resolve();
      const p = Math.min(1, (now - t0) / dur);
      const target = Math.floor(list.length * easeOut(p));
      artCtx.globalCompositeOperation = 'lighter';
      artCtx.lineCap = 'round';
      for (; done < target; done++) {
        const s = list[done];
        artCtx.strokeStyle = s.c;
        artCtx.lineWidth = s.w;
        artCtx.beginPath();
        artCtx.moveTo(s.x, s.y);
        artCtx.lineTo(s.x2, s.y2);
        artCtx.stroke();
        if (done % 18 === 0) spawnSpark(s.x2, s.y2, 0.6);
      }
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  }).then(() => guard(t));
}

// a puff of glitter out of a finished shape
function burst(list, n) {
  for (let i = 0; i < n && list.length; i++) {
    const s = list[(Math.random() * list.length) | 0];
    spawnSpark(s.x, s.y, rand(1.2, 3.2), true);
  }
}

function fadeOutArt(t) {
  art.classList.add('out');
  return wait(1000, t).then(() => {
    artCtx.clearRect(0, 0, W, H);
    art.style.transition = 'none';
    art.classList.remove('out', 'pulse');
    void art.offsetWidth;
    art.style.transition = '';
  });
}

// soft light under the strokes, fades in so the shape reads clearly
function glowLayer(L, dur, t) {
  const oc = document.createElement('canvas');
  oc.width = art.width;
  oc.height = art.height;
  const c = oc.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.translate(L.box.x, L.box.y);
  c.fillStyle = 'rgb(255, 175, 212)';
  c.strokeStyle = 'rgb(255, 175, 212)';
  c.shadowColor = 'rgba(255, 120, 180, 0.9)';
  c.shadowBlur = 22;
  L.draw(c, L.box.w, L.box.h);

  return new Promise((resolve) => {
    let shown = 0;
    const t0 = performance.now();
    const step = (now) => {
      if (t !== runToken) return resolve();
      const p = easeInOut(Math.min(1, (now - t0) / dur));
      artCtx.save();
      artCtx.setTransform(1, 0, 0, 1, 0, 0);
      artCtx.globalCompositeOperation = 'lighter';
      artCtx.globalAlpha = Math.max(0, L.glow * (p - shown));
      artCtx.drawImage(oc, 0, 0);
      artCtx.restore();
      shown = p;
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  }).then(() => guard(t));
}

function setCaption(scene) {
  captionMain.textContent = scene.main;
  captionSub.textContent = scene.sub || '';
}

async function runScene(i, t) {
  const scene = SCENES[i];
  const text = CONFIG.scenes[i];
  currentScene = i;

  captionEl.classList.remove('show');
  if (artDirty) await fadeOutArt(t);
  artDirty = true;

  if (scene.final) await fontsReady;
  guard(t);

  const layers = scene.layers().map((L) => ({ ...L, ...buildStrokes(L) }));
  const showCaption = () => {
    if (t !== runToken) return;
    setCaption(text);
    captionEl.classList.add('show');
  };
  if (!scene.final) setTimeout(showCaption, 500);

  // layers overlap a little, so the drawing flows without pauses
  const running = [];
  for (const L of layers) {
    const p = drawStrokes(L.strokes, L.dur, t).then(() => { if (L.burst) burst(L.strokes, L.burst); });
    p.catch(() => {});
    running.push(p);
    await wait(L.dur - (L.overlap || 0), t);
  }
  await Promise.all(running);

  if (scene.final) {
    const nameLayer = layers[layers.length - 1];
    art.classList.add('pulse');
    await glowLayer(nameLayer, 1400, t);
    showCaption();
    finalMode = true;
    await wait(3500, t);
    replayBtn.classList.add('visible');
  } else {
    await wait(scene.hold, t);
  }
}

async function play(from = 0) {
  const t = ++runToken;
  finalMode = false;
  replayBtn.classList.remove('visible');
  try {
    for (let i = from; i < SCENES.length; i++) await runScene(i, t);
  } catch (e) {
    if (!(e instanceof Cancelled)) console.error(e);
  }
}

const fontsReady = Promise.race([
  document.fonts ? document.fonts.load(`100px ${CONFIG.nameFont}`, CONFIG.name) : Promise.resolve(),
  new Promise((r) => setTimeout(r, 3000))
]).catch(() => {});

/* =========================================================
   Night sky: twinkling stars, a rare shooting star,
   and soft rising motes in the final scene
   ========================================================= */
let stars = [];
let motes = [];
let sparks = [];

// glitter: tiny bright dots that drift, flicker and fade
function spawnSpark(x, y, speed, big = false) {
  if (sparks.length > 700) return;
  const a = rand(0, TAU);
  sparks.push({
    x, y,
    vx: Math.cos(a) * speed * rand(0.3, 1),
    vy: Math.sin(a) * speed * rand(0.3, 1) - (big ? 0.4 : 0.15),
    r: big ? rand(0.8, 2) : rand(0.5, 1.3),
    life: 0,
    max: big ? rand(60, 130) : rand(35, 75),
    hue: Math.random() < 0.5 ? rand(320, 345) : rand(40, 55)
  });
}
let shooting = null;
let nextShoot = performance.now() + 9000;

function makeStars() {
  const count = Math.round(clamp((W * H) / 5200, 70, 260));
  stars = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() < 0.9 ? rand(0.4, 1.1) : rand(1.2, 1.8),
    a: rand(0.25, 0.85),
    sp: rand(0.4, 1.4),
    ph: rand(0, TAU),
    hue: Math.random() < 0.3 ? rand(320, 345) : rand(40, 60)
  }));
}

function skyLoop(now) {
  const time = now / 1000;
  skyCtx.clearRect(0, 0, W, H);

  for (const s of stars) {
    const tw = 0.55 + 0.45 * Math.sin(time * s.sp + s.ph);
    skyCtx.fillStyle = `hsla(${s.hue},60%,90%,${(s.a * tw).toFixed(3)})`;
    skyCtx.beginPath();
    skyCtx.arc(s.x * W, s.y * H, s.r, 0, TAU);
    skyCtx.fill();
  }

  if (started && !shooting && now > nextShoot) {
    const fromLeft = Math.random() < 0.5;
    shooting = {
      x: fromLeft ? rand(0.05, 0.4) * W : rand(0.6, 0.95) * W,
      y: rand(0.04, 0.25) * H,
      vx: (fromLeft ? 1 : -1) * rand(5, 8),
      vy: rand(1.6, 2.8),
      life: 0
    };
  }
  if (shooting) {
    const s = shooting;
    s.x += s.vx; s.y += s.vy; s.life++;
    const fade = Math.sin(Math.min(1, s.life / 70) * Math.PI);
    const g = skyCtx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
    g.addColorStop(0, `rgba(255,240,248,${0.8 * fade})`);
    g.addColorStop(1, 'rgba(255,240,248,0)');
    skyCtx.strokeStyle = g;
    skyCtx.lineWidth = 1.2;
    skyCtx.beginPath();
    skyCtx.moveTo(s.x, s.y);
    skyCtx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14);
    skyCtx.stroke();
    if (s.life > 70) { shooting = null; nextShoot = now + rand(10000, 18000); }
  }

  if (finalMode && motes.length < 46 && Math.random() < 0.18) {
    motes.push({ x: rand(0.05, 0.95) * W, y: H + 10, r: rand(1, 2.6), vy: rand(0.25, 0.6), sw: rand(0, TAU), life: 0, max: rand(500, 900) });
  }
  skyCtx.globalCompositeOperation = 'lighter';
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.life++;
    m.y -= m.vy;
    m.x += Math.sin(m.sw + m.life / 80) * 0.25;
    const a = Math.sin((m.life / m.max) * Math.PI) * 0.55;
    if (m.life > m.max) { motes.splice(i, 1); continue; }
    const g = skyCtx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
    g.addColorStop(0, `rgba(255,190,220,${a})`);
    g.addColorStop(1, 'rgba(255,190,220,0)');
    skyCtx.fillStyle = g;
    skyCtx.beginPath();
    skyCtx.arc(m.x, m.y, m.r * 4, 0, TAU);
    skyCtx.fill();
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life++;
    if (s.life > s.max) { sparks.splice(i, 1); continue; }
    s.x += s.vx; s.y += s.vy;
    s.vx *= 0.97; s.vy = s.vy * 0.97 + 0.008;
    const k = 1 - s.life / s.max;
    const flick = 0.6 + 0.4 * Math.sin(s.life * 0.9 + i);
    skyCtx.fillStyle = `hsla(${s.hue},90%,85%,${(k * flick).toFixed(3)})`;
    skyCtx.beginPath();
    skyCtx.arc(s.x, s.y, s.r * (0.5 + k * 0.5), 0, TAU);
    skyCtx.fill();
  }
  skyCtx.globalCompositeOperation = 'source-over';

  requestAnimationFrame(skyLoop);
}

/* =========================================================
   Music box lullaby (Twinkle Twinkle), generated with WebAudio
   ========================================================= */
const Music = {
  ctx: null,
  muted: false,
  start() {
    if (this.ctx || !CONFIG.music) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());

    this.master = c.createGain();
    this.master.gain.setValueAtTime(0, c.currentTime);
    this.master.gain.linearRampToValueAtTime(0.2, c.currentTime + 4);
    this.master.connect(c.destination);

    // soft echo for a dreamy room feel
    this.bus = c.createGain();
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = c.createGain();
    fb.gain.value = 0.3;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    this.bus.connect(this.master);
    this.bus.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(this.master);

    const A = [72, 72, 79, 79, 81, 81, [79, 2]];
    const B = [77, 77, 76, 76, 74, 74, [72, 2]];
    const C = [79, 79, 77, 77, 76, 76, [74, 2]];
    const bassA = [48, 48, 53, 48], bassB = [53, 48, 55, 48], bassC = [48, 53, 48, 55];
    this.events = [];
    let beat = 0;
    for (const [mel, bass] of [[A, bassA], [B, bassB], [C, bassC], [C, bassC], [A, bassA], [B, bassB]]) {
      bass.forEach((n, j) => this.events.push({ beat: beat + j * 2, note: n, bass: true }));
      for (const e of mel) {
        const [n, len] = Array.isArray(e) ? e : [e, 1];
        this.events.push({ beat, note: n });
        beat += len;
      }
    }
    this.events.sort((a, b) => a.beat - b.beat);
    this.loopBeats = beat + 4;
    this.beatSec = 0.55;
    this.idx = 0;
    this.loopStart = c.currentTime + 0.8;

    this.timer = setInterval(() => this.schedule(), 200);
    this.schedule();
  },
  schedule() {
    const c = this.ctx;
    const ev = this.events;
    while (true) {
      if (this.idx >= ev.length) { this.idx = 0; this.loopStart += this.loopBeats * this.beatSec; }
      const e = ev[this.idx];
      const when = this.loopStart + e.beat * this.beatSec;
      if (when > c.currentTime + 1.2) break;
      if (when > c.currentTime - 0.05) this.note(e.note, when, e.bass);
      this.idx++;
    }
  },
  note(midi, when, bass) {
    const c = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = c.createGain();
    const peak = bass ? 0.13 : 0.24;
    const decay = bass ? 3.2 : 2.4;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + (bass ? 0.06 : 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    g.connect(this.bus);
    const partials = bass ? [[1, 1], [1.5, 0.25]] : [[1, 1], [2, 0.22], [4.02, 0.06]];
    for (const [mul, amp] of partials) {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * mul;
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(when);
      o.stop(when + decay + 0.1);
    }
  },
  toggle() {
    if (!this.ctx) return;
    this.muted = !this.muted;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.2, now + 0.6);
    soundBtn.classList.toggle('muted', this.muted);
  }
};

/* =========================================================
   Boot
   ========================================================= */
resizeCanvases();
makeStars();
requestAnimationFrame(skyLoop);

$('#open').addEventListener('click', () => {
  if (started) return;
  started = true;
  try { Music.start(); } catch (e) { /* no audio — fine */ }
  $('#intro').classList.add('hidden');
  if (CONFIG.music && Music.ctx) soundBtn.classList.add('visible');
  setTimeout(() => play(0), 1300);
});

soundBtn.addEventListener('click', () => Music.toggle());

replayBtn.addEventListener('click', () => {
  motes = [];
  play(0);
});

let lastW = W, lastH = H, resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // ignore small height jumps from the mobile address bar
    if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) return;
    lastW = window.innerWidth;
    lastH = window.innerHeight;
    resizeCanvases();
    makeStars();
    sparks = [];
    if (started) {
      artDirty = false;
      art.classList.remove('out', 'pulse');
      play(currentScene);
    }
  }, 300);
});
