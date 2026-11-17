/* =====================================================================
   Décor procédural par tronçons (chunks) le long de la route.
   Chaque tronçon est dessiné sur un canvas 2D puis uploadé comme texture PixiJS.
   Déterministe : tronçon k + seed ⇒ même image. Les objets débordant sur les voisins
   sont générés par le tronçon d'origine ET redessinés par ses voisins (pas de coutures).
   ===================================================================== */
import { mulberry32 } from '@pedale/sim';

export const PX_PER_M = 40;
export const ROAD_W = 8 * PX_PER_M;       // 8 m de chaussée
export const CHUNK_W = 1024;
export const CHUNK_H = 1600;              // y ∈ [−800, 800]
const TAU = Math.PI * 2;
const SUN = { x: 0.55, y: 0.83 };

export type BiomeKey = 'prairie' | 'desert' | 'automne';
export interface Biome {
  label: string; base: string; blobs: string[]; shoulder: string; verge: string; lake: boolean; water: string; shore: string;
  trees: [string, string][]; fields: string[]; stripes: boolean; roof: string[]; wall: string; extras: string[]; forest: number;
}
export const BIOMES: Record<BiomeKey, Biome> = {
  prairie: {
    label: 'Prairie', base: '#94ae63', blobs: ['#7f9b55', '#a8bd74', '#c5b985', '#86a45a'], shoulder: '#cdbf98', verge: '#a3bb6c', lake: true,
    water: '#5fb6ad', shore: '#e6d9aa', trees: [['#3f6e35', '#5d8f45'], ['#4b7a3a', '#6b9c4b'], ['#35603a', '#4f8546']],
    fields: ['#a9bd6a', '#c9c06b', '#7fa25b', '#d5b86a', '#b5c77a'], stripes: true, roof: ['#c8553d', '#b8472f', '#d4793f', '#8c4a3b'], wall: '#efe6d2',
    extras: ['bush', 'rock', 'hay'], forest: 1,
  },
  desert: {
    label: 'Désert', base: '#d9a863', blobs: ['#cf9a56', '#e6bb7c', '#c78848', '#e2b36e'], shoulder: '#ecd3a0', verge: '#d9ad6c', lake: false,
    water: '#5fb6ad', shore: '#e6d9aa', trees: [['#7a8a3e', '#9aa653']], fields: [], stripes: false, roof: ['#e9d4a6', '#dcc08a', '#f0e0bb'], wall: '#f1deb4',
    extras: ['cactus', 'rock', 'bush', 'bush'], forest: 0.3,
  },
  automne: {
    label: 'Automne', base: '#a9a55c', blobs: ['#928f48', '#bdb26a', '#b08a4a', '#9a9a50'], shoulder: '#cdb98f', verge: '#b2ab62', lake: true,
    water: '#4f9aa6', shore: '#d9c796', trees: [['#b9552a', '#dc7f35'], ['#c88a2e', '#e8b43f'], ['#9b3d27', '#c25a33'], ['#667a35', '#8a9d45']],
    fields: ['#c9a54d', '#b8873f', '#a8a85a', '#d1b85a'], stripes: true, roof: ['#a5432e', '#7b4a3a', '#c06a3c'], wall: '#ece0c6', extras: ['bush', 'rock', 'hay'], forest: 1,
  },
};
export const BIOME_KEYS = Object.keys(BIOMES) as BiomeKey[];

export interface SceneOpts { seed: number; biome: BiomeKey; finishPx: number }

const rr = (r: () => number, a: number, b: number) => a + r() * (b - a);
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)]!;
function hexA(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ------------------------- objets du décor ------------------------- */
type Obj =
  | { k: 'tree'; x: number; y: number; r: number; col: [string, string]; v: number; conifer: boolean }
  | { k: 'bush'; x: number; y: number; r: number; col: [string, string] }
  | { k: 'rock'; x: number; y: number; r: number; a: number; sides: number }
  | { k: 'cactus' | 'hay'; x: number; y: number; r: number }
  | { k: 'house'; x: number; y: number; w: number; h: number; a: number; roof: string; flat: boolean; wall: string; chim: boolean }
  | { k: 'person'; x: number; y: number; c: string; h: string; sk: string; kind: 'p' | 'flag' | 'umb'; fc: string; ang: number }
  | { k: 'tent'; x: number; y: number; w: number; h: number; c: string }
  | { k: 'sign'; x: number; y: number; txt: string };
interface Field { x: number; y: number; w: number; h: number; c: string; gap: number }
interface Blob { x: number; y: number; r: number; c: string; a: number }
interface Lake { x: number; y: number; r: number; seed: number }
interface Barrier { x0: number; x1: number; y: number }
interface Gen { objs: Obj[]; fields: Field[]; blobs: Blob[]; lakes: Lake[]; barriers: Barrier[] }

const cache = new Map<string, Gen>();
function generate(k: number, o: SceneOpts): Gen {
  const key = `${o.seed}|${o.biome}|${o.finishPx}|${k}`;
  const hit = cache.get(key); if (hit) return hit;
  const B = BIOMES[o.biome];
  const r = mulberry32((o.seed * 1000003 + k * 7919) | 0);
  const x0 = k * CHUNK_W;
  const g: Gen = { objs: [], fields: [], blobs: [], lakes: [], barriers: [] };
  const side = () => (r() < 0.5 ? -1 : 1);
  const half = ROAD_W / 2;

  for (let i = 0; i < 5; i++) g.blobs.push({ x: x0 + rr(r, 0, CHUNK_W), y: rr(r, -800, 800), r: rr(r, 160, 420), c: pick(r, B.blobs), a: rr(r, 0.18, 0.4) });

  // champs
  if (B.fields.length) for (let i = 0, n = Math.floor(rr(r, 0, 2.6)); i < n; i++) {
    const s = side(), h = rr(r, 200, 360), w = rr(r, 300, 520), yc = s * (half + 90 + h / 2 + rr(r, 0, 60));
    g.fields.push({ x: x0 + rr(r, 0, CHUNK_W), y: yc, w, h, c: pick(r, B.fields), gap: rr(r, 11, 19) });
  }
  // lacs
  if (B.lake && r() < 0.07) { const s = side(), rad = rr(r, 150, 260); g.lakes.push({ x: x0 + rr(r, 100, CHUNK_W - 100), y: s * (half + 150 + rad + rr(r, 0, 80)), r: rad, seed: Math.floor(r() * 1e9) }); }

  const isLake = (x: number, y: number) => g.lakes.some((l) => Math.hypot(x - l.x, y - l.y) < l.r + 30);
  const isField = (x: number, y: number, m: number) => g.fields.some((f) => Math.abs(x - f.x) < f.w / 2 + m && Math.abs(y - f.y) < f.h / 2 + m);

  // bosquets
  const nForest = Math.round(rr(r, 0.5, 3.2) * B.forest);
  for (let i = 0; i < nForest; i++) {
    const cx = x0 + rr(r, 0, CHUNK_W), s = side(), cy = s * (half + 120 + rr(r, 0, 380)), spread = rr(r, 70, 200), cnt = Math.floor(rr(r, 6, 22));
    for (let j = 0; j < cnt; j++) {
      const a = r() * TAU, d = Math.sqrt(r()) * spread, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (Math.abs(y) < half + 90 || isLake(x, y)) continue;
      g.objs.push({ k: 'tree', x, y, r: rr(r, 22, 40), col: pick(r, B.trees), v: r(), conifer: o.biome === 'automne' ? r() < 0.15 : r() < 0.25 });
    }
  }
  // alignement d'arbres le long de la route
  if (o.biome !== 'desert' && r() < 0.3) {
    const s = side(), off = half + rr(r, 62, 80), start = x0 + rr(r, 0, CHUNK_W * 0.4);
    for (let x = start; x < start + rr(r, 300, 800); x += rr(r, 52, 66)) g.objs.push({ k: 'tree', x: x + rr(r, -3, 3), y: s * off + rr(r, -4, 4), r: rr(r, 20, 27), col: pick(r, B.trees), v: r(), conifer: false });
  }
  // décor épars
  for (let i = 0; i < 16; i++) {
    const x = x0 + rr(r, 0, CHUNK_W), s = side(), y = s * (half + 90 + rr(r, 0, 460)), kind = pick(r, B.extras);
    if (isLake(x, y) || Math.abs(y) < half + 90) continue;
    if (kind === 'hay') { if (isField(x, y, -40)) g.objs.push({ k: 'hay', x, y, r: 12 }); }
    else if (kind === 'rock') g.objs.push({ k: 'rock', x, y, r: rr(r, 8, 24), a: r() * TAU, sides: 5 + Math.floor(r() * 3) });
    else if (kind === 'cactus') g.objs.push({ k: 'cactus', x, y, r: rr(r, 9, 14) });
    else g.objs.push({ k: 'bush', x, y, r: rr(r, 9, 17), col: pick(r, B.trees) });
  }
  // hameaux
  if (r() < 0.14) {
    const s = side(), cx = x0 + rr(r, 150, CHUNK_W - 150), cy = s * (half + 230 + rr(r, 0, 120));
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const x = cx + rr(r, -170, 170), y = cy + rr(r, -90, 90);
      if (Math.abs(y) < half + 150 || isLake(x, y) || isField(x, y, 20)) continue;
      if (g.objs.some((q) => q.k === 'house' && Math.hypot(q.x - x, q.y - y) < 110)) continue;
      g.objs.push({ k: 'house', x, y, w: rr(r, 64, 92), h: rr(r, 46, 62), a: r() < 0.5 ? 0 : Math.PI / 2, roof: pick(r, B.roof), flat: o.biome === 'desert', wall: B.wall, chim: r() < 0.6 });
    }
  }
  // public : départ, arrivée, petits groupes en bord de route
  const cloth = ['#e63946', '#2a6fdb', '#f4c20d', '#ffffff', '#2fa84f', '#ff7a1a', '#7b4bd6', '#ff6fae', '#222', '#19b6c9'];
  const hair = ['#2b1d14', '#5a3a22', '#c89b4a', '#e8d6a0', '#1d1d1d', '#8c3b22'], skin = ['#f1c9a5', '#d9a67c', '#a56e49', '#7a4a2e', '#f6d9c0'];
  const zones: { a: number; b: number; sides: number[]; dens: number; big: boolean }[] = [];
  const fin = o.finishPx;
  if (fin - 3600 < x0 + CHUNK_W && fin + 1600 > x0) zones.push({ a: fin - 3600, b: fin + 1600, sides: [-1, 1], dens: 1, big: true });
  if (-420 < x0 + CHUNK_W && 420 > x0) zones.push({ a: -420, b: 420, sides: [1], dens: 0.7, big: false });
  if (r() < 0.2) { const a = x0 + rr(r, 0, CHUNK_W * 0.5); zones.push({ a, b: a + rr(r, 250, 600), sides: [side()], dens: rr(r, 0.4, 0.8), big: false }); }
  for (const z of zones) {
    for (const s of z.sides) {
      const yb = s * (half + 34), a = Math.max(z.a, x0), b = Math.min(z.b, x0 + CHUNK_W);
      g.barriers.push({ x0: z.a, x1: z.b, y: yb });
      for (let x = a; x < b; x += 7) {
        const rows = z.big ? 4 : 3;
        for (let row = 0; row < rows; row++) {
          if (r() > z.dens * (1 - row * 0.12)) continue;
          const kind = r();
          g.objs.push({ k: 'person', x: x + r() * 5, y: s * (half + 48 + row * 10 + r() * 5), c: pick(r, cloth), h: pick(r, hair), sk: pick(r, skin), kind: kind < 0.08 ? 'flag' : kind < 0.14 ? 'umb' : 'p', fc: pick(r, cloth), ang: r() * TAU });
        }
      }
      if (z.big) for (let x = a + 30; x < b - 30; x += rr(r, 120, 190)) g.objs.push({ k: 'tent', x, y: s * (half + 150), w: rr(r, 44, 70), h: rr(r, 30, 42), c: pick(r, cloth) });
    }
  }
  // panneaux de distance
  for (const m of [10000, 5000, 3000, 2000, 1000, 500, 300, 200, 100, 50]) {
    const x = fin - m * PX_PER_M;
    if (x >= x0 && x < x0 + CHUNK_W) g.objs.push({ k: 'sign', x, y: half + 66, txt: m >= 1000 ? `${m / 1000} km` : `${m} m` });
  }
  cache.set(key, g);
  if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  return g;
}

/* ------------------------- dessin d'un tronçon ------------------------- */
export function drawChunk(ctx: CanvasRenderingContext2D, k: number, o: SceneOpts, q = 1): void {
  const B = BIOMES[o.biome], x0 = k * CHUNK_W, half = ROAD_W / 2;
  ctx.setTransform(q, 0, 0, q, -x0 * q, (CHUNK_H / 2) * q);
  ctx.fillStyle = B.base; ctx.fillRect(x0, -CHUNK_H / 2, CHUNK_W, CHUNK_H);
  const gens = [generate(k - 1, o), generate(k, o), generate(k + 1, o)];
  const inView = (x: number, m: number) => x > x0 - m && x < x0 + CHUNK_W + m;

  for (const g of gens) for (const b of g.blobs) {
    if (!inView(b.x, b.r)) continue;
    const gr = ctx.createRadialGradient(b.x, b.y, b.r * 0.15, b.x, b.y, b.r);
    gr.addColorStop(0, hexA(b.c, b.a)); gr.addColorStop(1, hexA(b.c, 0));
    ctx.fillStyle = gr; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
  for (const g of gens) for (const f of g.fields) {
    if (!inView(f.x, f.w / 2 + 10)) continue;
    ctx.fillStyle = f.c; ctx.fillRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
    if (B.stripes) {
      ctx.fillStyle = 'rgba(40,50,10,.13)';
      for (let x = f.x - f.w / 2; x < f.x + f.w / 2; x += f.gap) ctx.fillRect(x, f.y - f.h / 2, f.gap * 0.45, f.h);
      ctx.strokeStyle = 'rgba(40,60,20,.35)'; ctx.lineWidth = 5; ctx.strokeRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
    }
  }
  for (const g of gens) for (const l of g.lakes) {
    if (!inView(l.x, l.r * 1.4)) continue;
    const blob = (rad: number, dx: number, col: string) => {
      const rn = mulberry32(l.seed); const n = 14, pts: [number, number][] = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rd = rad * (1 + (rn() - 0.5) * 0.24); pts.push([l.x + dx + Math.cos(a) * rd, l.y + dx + Math.sin(a) * rd]); }
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const p0 = pts[i]!, p1 = pts[(i + 1) % n]!, mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p0[0], p0[1], mx, my); }
      const p0 = pts[0]!, p1 = pts[1]!; ctx.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    blob(l.r * 1.18, 0, B.shore); blob(l.r, 0, B.water); blob(l.r * 0.72, l.r * 0.05, 'rgba(20,70,90,.22)');
  }

  // route
  const xa = x0 - 4, w = CHUNK_W + 8;
  ctx.fillStyle = hexA(B.verge, 0.55); ctx.fillRect(xa, -(half + 70), w, (half + 70) * 2);
  ctx.fillStyle = B.shoulder; ctx.fillRect(xa, -(half + 24), w, (half + 24) * 2);
  ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.fillRect(xa, -(half + 6), w, (half + 6) * 2);
  ctx.fillStyle = '#4b4d55'; ctx.fillRect(xa, -half, w, ROAD_W);
  ctx.fillStyle = 'rgba(15,15,22,.20)';
  for (const oy of [-1.5 * PX_PER_M, 1.5 * PX_PER_M]) ctx.fillRect(xa, oy - 15, w, 30);
  ctx.fillStyle = '#f2f0e6'; ctx.fillRect(xa, -half + 6, w, 4); ctx.fillRect(xa, half - 10, w, 4);
  ctx.fillStyle = 'rgba(245,235,200,.8)';
  for (let x = Math.floor(x0 / 68) * 68; x < x0 + CHUNK_W; x += 68) ctx.fillRect(x, -1.75, 34, 3.5);
  const rs = mulberry32((o.seed + k * 31) | 0);
  for (let i = 0; i < 380; i++) { ctx.fillStyle = rs() < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.18)'; const s = rr(rs, 1, 2.6); ctx.fillRect(x0 + rs() * CHUNK_W, (rs() - 0.5) * (ROAD_W - 12), s, s); }

  // ligne d'arrivée (damier) + flamme rouge
  const fin = o.finishPx;
  if (inView(fin, 80)) {
    const sq = 14;
    for (let row = 0; row < 3; row++) for (let c = 0; c * sq < ROAD_W - 14; c++) { ctx.fillStyle = (row + c) % 2 ? '#15151a' : '#f4f2ea'; ctx.fillRect(fin - sq * 1.5 + row * sq, -half + 7 + c * sq, sq + 0.5, sq + 0.5); }
  }
  // barrières
  for (const g of gens) for (const b of g.barriers) {
    const a = Math.max(b.x0, x0 - 20), c = Math.min(b.x1, x0 + CHUNK_W + 20); if (c <= a) continue;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(a + 4, b.y + 4, c - a, 5);
    ctx.fillStyle = '#c9ced6'; ctx.fillRect(a, b.y - 2, c - a, 4);
    ctx.fillStyle = '#7d848f'; for (let x = Math.ceil(a / 40) * 40; x < c; x += 40) { ctx.beginPath(); ctx.arc(x, b.y, 4.2, 0, TAU); ctx.fill(); }
  }
  // objets : ombres puis corps
  const list: Obj[] = []; for (const g of gens) for (const ob of g.objs) if (inView(ob.x, 120)) list.push(ob);
  for (const ob of list) shadowOf(ctx, ob);
  for (const ob of list) bodyOf(ctx, ob);
  // portiques
  if (inView(fin, 120)) gantry(ctx, fin, ['#e4572e', '#f2f0e6', '#2a6fdb', '#f4c20d', '#e4572e', '#f2f0e6', '#2fa84f', '#f4c20d']);
  const flamme = fin - 1000 * PX_PER_M;
  if (inView(flamme, 120)) gantry(ctx, flamme, ['#d62839', '#f2f0e6', '#d62839', '#f2f0e6', '#d62839', '#f2f0e6', '#d62839', '#f2f0e6'], true);
}

function gantry(ctx: CanvasRenderingContext2D, x: number, cols: string[], thin = false) {
  const half = ROAD_W / 2 + 26, bw = thin ? 7 : 9;
  ctx.fillStyle = 'rgba(15,20,10,.30)'; ctx.fillRect(x - bw + SUN.x * 44, -half + SUN.y * 44, bw * 2, half * 2);
  for (const s of [-1, 1]) { ctx.fillStyle = '#7f8794'; ctx.beginPath(); ctx.arc(x, s * half, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#b4bcc8'; ctx.beginPath(); ctx.arc(x - 2, s * half - 2, 7, 0, TAU); ctx.fill(); }
  const seg = (half * 2) / cols.length;
  cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x - bw, -half + i * seg, bw * 2, seg + 0.5); });
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.strokeRect(x - bw, -half, bw * 2, half * 2);
}

function shadowOf(ctx: CanvasRenderingContext2D, o: Obj) {
  ctx.fillStyle = 'rgba(25,35,15,.26)';
  const e = (dx: number, dy: number, rx: number, ry: number) => { ctx.beginPath(); ctx.ellipse(o.x + dx, o.y + dy, rx, ry, 0, 0, TAU); ctx.fill(); };
  switch (o.k) {
    case 'tree': e(SUN.x * o.r * 0.9, SUN.y * o.r * 0.9, o.r * 1.02, o.r * 0.95); break;
    case 'bush': e(SUN.x * o.r * 0.7, SUN.y * o.r * 0.7, o.r, o.r * 0.9); break;
    case 'rock': e(SUN.x * o.r * 0.8, SUN.y * o.r * 0.8, o.r * 1.1, o.r * 0.9); break;
    case 'cactus': e(SUN.x * o.r * 1.3, SUN.y * o.r * 1.3, o.r * 0.9, o.r * 0.9); break;
    case 'hay': e(SUN.x * 8, SUN.y * 8, o.r, o.r); break;
    case 'house': ctx.save(); ctx.translate(o.x + SUN.x * 20, o.y + SUN.y * 20); ctx.rotate(o.a); ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.restore(); break;
    case 'tent': ctx.fillRect(o.x - o.w / 2 + SUN.x * 8, o.y - o.h / 2 + SUN.y * 8, o.w, o.h); break;
    case 'sign': ctx.fillRect(o.x - 18 + SUN.x * 8, o.y - 18 + SUN.y * 8, 36, 36); break;
    case 'person': ctx.beginPath(); ctx.ellipse(o.x + SUN.x * 3, o.y + SUN.y * 3, 4.2, 3.6, 0, 0, TAU); ctx.fill(); break;
  }
}

function bodyOf(ctx: CanvasRenderingContext2D, o: Obj) {
  switch (o.k) {
    case 'tree': tree(ctx, o); break;
    case 'bush': ctx.fillStyle = o.col[0]; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.fill(); ctx.fillStyle = o.col[1]; ctx.beginPath(); ctx.arc(o.x - o.r * 0.2, o.y - o.r * 0.2, o.r * 0.7, 0, TAU); ctx.fill(); break;
    case 'rock': {
      const poly = (sc: number, dx: number, col: string) => { ctx.beginPath(); for (let i = 0; i < o.sides; i++) { const a = o.a + (i / o.sides) * TAU, rad = o.r * sc * (0.85 + ((i * 37) % 7) / 35); const x = o.x + dx + Math.cos(a) * rad, y = o.y + dx + Math.sin(a) * rad; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
      poly(1, 0, '#a79c88'); poly(0.6, -o.r * 0.12, '#c2b8a2'); break;
    }
    case 'cactus': { ctx.fillStyle = '#4f8a45'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#3c7035'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + Math.cos(a) * o.r, o.y + Math.sin(a) * o.r); ctx.stroke(); } ctx.fillStyle = '#e86a8f'; ctx.beginPath(); ctx.arc(o.x, o.y, 2.6, 0, TAU); ctx.fill(); break; }
    case 'hay': ctx.fillStyle = '#d9b457'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#b48d34'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.55, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.2, 0, TAU); ctx.stroke(); break;
    case 'house': house(ctx, o); break;
    case 'tent': ctx.fillStyle = o.c; ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h); ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let x = o.x - o.w / 2; x < o.x + o.w / 2; x += 12) ctx.fillRect(x, o.y - o.h / 2, 6, o.h); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h); break;
    case 'sign': {
      ctx.save(); ctx.translate(o.x, o.y); ctx.fillStyle = '#e9e8e4'; rrect(ctx, -22, -18, 44, 36, 4); ctx.fill(); ctx.strokeStyle = '#b9b8b2'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#16161a'; ctx.font = `800 ${o.txt.length > 3 ? 15 : 19}px "Trebuchet MS", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.txt, 0, 1.5); ctx.restore(); break;
    }
    case 'person': person(ctx, o); break;
  }
}
function tree(ctx: CanvasRenderingContext2D, o: Extract<Obj, { k: 'tree' }>) {
  const [dark, light] = o.col, r = o.r;
  if (o.conifer) {
    ctx.fillStyle = dark; ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rad = r * (i % 2 ? 0.72 : 1.05); const x = o.x + Math.cos(a) * rad, y = o.y + Math.sin(a) * rad; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = light; ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rad = r * 0.6 * (i % 2 ? 0.6 : 1); const x = o.x - r * 0.1 + Math.cos(a) * rad, y = o.y - r * 0.1 + Math.sin(a) * rad; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); return;
  }
  ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = light; ctx.beginPath(); ctx.arc(o.x - r * 0.14, o.y - r * 0.16, r * 0.82, 0, TAU); ctx.fill();
  const rn = mulberry32(Math.floor(o.v * 1e9)); ctx.fillStyle = hexA(dark, 0.55);
  for (let i = 0; i < 4; i++) { const a = rn() * TAU, d = r * 0.45 * rn(); ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, r * 0.2, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,230,.22)'; ctx.beginPath(); ctx.arc(o.x - r * 0.38, o.y - r * 0.42, r * 0.27, 0, TAU); ctx.fill();
}
function house(ctx: CanvasRenderingContext2D, o: Extract<Obj, { k: 'house' }>) {
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a); const w = o.w, h = o.h;
  ctx.globalAlpha = 0.45; ctx.fillStyle = '#6f8f4d'; ctx.fillRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16); ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16);
  if (o.flat) { ctx.fillStyle = o.roof; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = 'rgba(120,80,30,.45)'; ctx.lineWidth = 3; ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.fillStyle = 'rgba(120,80,30,.35)'; ctx.fillRect(w * 0.1, -h * 0.2, w * 0.28, h * 0.4); }
  else {
    ctx.fillStyle = o.wall; ctx.fillRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
    ctx.fillStyle = o.roof; ctx.fillRect(-w / 2, -h / 2, w, h / 2); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-w / 2, 0, w, h / 2);
    ctx.globalAlpha = 0.55; ctx.fillStyle = o.roof; ctx.fillRect(-w / 2, 0, w, h / 2); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(-w / 2, -h / 2, w, 3); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-w / 2, -1.5, w, 3);
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; for (let x = -w / 2 + 7; x < w / 2; x += 7) { ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); ctx.stroke(); }
    if (o.chim) { ctx.fillStyle = '#6b5a52'; ctx.fillRect(w * 0.22, -h * 0.32, 9, 9); ctx.fillStyle = '#2d2623'; ctx.fillRect(w * 0.22 + 2, -h * 0.32 + 2, 5, 5); }
  }
  ctx.restore();
}
function person(ctx: CanvasRenderingContext2D, o: Extract<Obj, { k: 'person' }>) {
  const x = o.x, y = o.y;
  if (o.kind === 'umb') { ctx.fillStyle = o.fc; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 6; i += 2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 9, (i / 6) * TAU, ((i + 1) / 6) * TAU); ctx.closePath(); ctx.fill(); } return; }
  ctx.fillStyle = o.c; ctx.beginPath(); ctx.ellipse(x, y, 4.4, 3.5, o.ang, 0, TAU); ctx.fill();
  ctx.fillStyle = o.sk; ctx.beginPath(); ctx.arc(x - 0.6, y - 0.8, 2.6, 0, TAU); ctx.fill();
  ctx.fillStyle = o.h; ctx.beginPath(); ctx.arc(x - 0.6, y - 0.8, 2.7, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
  if (o.kind === 'flag') { ctx.strokeStyle = '#444'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 3, y); ctx.lineTo(x + 3, y - 14); ctx.stroke(); ctx.fillStyle = o.fc; ctx.fillRect(x + 3, y - 14, 9, 6); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x + 3, y - 12, 9, 2); }
}
