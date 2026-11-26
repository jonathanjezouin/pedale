/* =====================================================================
   Décor procédural autour d'une route qui tourne.
   Le monde est découpé en tuiles carrées (TILE px) dessinées à la demande sur un canvas 2D puis
   uploadées comme textures PixiJS. Tout est déterministe : (seed, route, tuile) ⇒ même image.
   Les objets qui débordent sur les tuiles voisines sont redessinés par ces voisines (pas de coutures).
   Unité : 1 m = PX_PER_M pixels, y vers le bas, nord en haut.
   ===================================================================== */
import { mulberry32 } from '@pedale/sim';
import type { Road } from '@pedale/sim';

export const PX_PER_M = 40;
export const TILE = 1024;
export const ROAD_W = 8 * PX_PER_M;        // 8 m de chaussée
const HALF = ROAD_W / 2;
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

const rr = (r: () => number, a: number, b: number) => a + r() * (b - a);
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)]!;
const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const hash = (a: number, b: number, c: number) => ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) | 0;
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ------------------------- objets ------------------------- */
type Obj =
  | { k: 'tree'; x: number; y: number; r: number; col: [string, string]; v: number; conifer: boolean }
  | { k: 'bush'; x: number; y: number; r: number; col: [string, string] }
  | { k: 'rock'; x: number; y: number; r: number; a: number; sides: number }
  | { k: 'cactus' | 'hay'; x: number; y: number; r: number }
  | { k: 'house'; x: number; y: number; w: number; h: number; a: number; roof: string; flat: boolean; wall: string; chim: boolean }
  | { k: 'person'; x: number; y: number; c: string; h: string; sk: string; kind: 'p' | 'flag' | 'umb'; fc: string; a: number; sc: number }
  | { k: 'tent'; x: number; y: number; w: number; h: number; a: number; c: string }
  | { k: 'sign'; x: number; y: number; txt: string }
  | { k: 'barrier'; x: number; y: number; x2: number; y2: number }
  | { k: 'gantry'; x: number; y: number; a: number; cols: string[]; thin: boolean }
  | { k: 'finish'; x: number; y: number; a: number };
interface Field { x: number; y: number; w: number; h: number; a: number; c: string; gap: number }
interface Blob { x: number; y: number; r: number; c: string; a: number }
interface Lake { x: number; y: number; r: number; seed: number }
interface Gen { objs: Obj[]; fields: Field[]; blobs: Blob[]; lakes: Lake[] }
export interface SceneOpts { seed: number; biome: BiomeKey; finishS: number }

export class Scenery {
  private PX: Float64Array; private PY: Float64Array;
  private idx = new Map<string, number[]>();
  private placed = new Map<string, Obj[]>();
  private gens = new Map<string, Gen>();
  readonly B: Biome;

  constructor(readonly road: Road, readonly o: SceneOpts) {
    this.B = BIOMES[o.biome];
    const n = road.n; this.PX = new Float64Array(n); this.PY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.PX[i] = road.X[i]! * PX_PER_M; this.PY[i] = road.Y[i]! * PX_PER_M;
      const k = `${Math.floor(this.PX[i]! / TILE)},${Math.floor(this.PY[i]! / TILE)}`;
      (this.idx.get(k) ?? this.idx.set(k, []).get(k)!).push(i);
    }
    this.placeAlongRoad();
  }

  /* --- géométrie de route --- */
  /** distance (px) au point d'échantillon de route le plus proche, et cap de la route à cet endroit */
  roadNear(px: number, py: number): { d: number; th: number } {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE); let best = 1e12, th = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = this.idx.get(`${tx + i},${ty + j}`); if (!a) continue;
      for (const s of a) { const d = Math.hypot(this.PX[s]! - px, this.PY[s]! - py); if (d < best) { best = d; th = this.road.TH[s]!; } }
    }
    return { d: best, th };
  }
  private worldAt(s: number, d: number) { const p = this.road.toXY(s, d); return { x: p.x * PX_PER_M, y: p.y * PX_PER_M, a: p.heading }; }

  private register(o: Obj, rad: number) {
    const x0 = Math.floor((o.x - rad) / TILE), x1 = Math.floor((o.x + rad) / TILE), y0 = Math.floor((o.y - rad) / TILE), y1 = Math.floor((o.y + rad) / TILE);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = `${i},${j}`; (this.placed.get(k) ?? this.placed.set(k, []).get(k)!).push(o); }
  }

  /** Objets placés le long de la route (public, panneaux, portiques, avenues d'arbres) : positionnés par abscisse s. */
  private placeAlongRoad() {
    const { road, o, B } = this, r = mulberry32((o.seed * 7919) | 0), L = o.finishS;
    const cloth = ['#e63946', '#2a6fdb', '#f4c20d', '#ffffff', '#2fa84f', '#ff7a1a', '#7b4bd6', '#ff6fae', '#222', '#19b6c9', '#8a5a44', '#5a7d9a'];
    const hair = ['#2b1d14', '#5a3a22', '#c89b4a', '#e8d6a0', '#1d1d1d', '#8c3b22', '#b0b0b0'], skin = ['#f1c9a5', '#d9a67c', '#a56e49', '#7a4a2e', '#f6d9c0'];
    const barrierD = 4.7;                                      // m du centre
    const zones: { a: number; b: number; sides: (-1 | 1)[]; dens: number; big: boolean }[] = [
      { a: L - 90, b: L + 40, sides: [-1, 1], dens: 1, big: true },
      { a: -14, b: 14, sides: [1], dens: 0.75, big: false },
    ];
    for (let s = 300; s < L - 200; s += rr(r, 350, 900)) if (r() < 0.45) zones.push({ a: s, b: s + rr(r, 18, 60), sides: [r() < 0.5 ? -1 : 1], dens: rr(r, 0.45, 0.85), big: false });
    for (const z of zones) for (const side of z.sides) {
      // barrières
      for (let s = z.a; s < z.b; s += 2) {
        const p = this.worldAt(s, side * barrierD), q = this.worldAt(Math.min(s + 2, z.b), side * barrierD);
        this.register({ k: 'barrier', x: p.x, y: p.y, x2: q.x, y2: q.y }, 90);
      }
      // spectateurs : vraie taille (≈ 0,5 m d'épaules), plusieurs rangs
      const rows = z.big ? 5 : 3;
      for (let s = z.a; s < z.b; s += 0.42) for (let row = 0; row < rows; row++) {
        if (r() > z.dens * (1 - row * 0.1)) continue;
        const d = side * (barrierD + 0.55 + row * 0.5 + r() * 0.22), p = this.worldAt(s + r() * 0.3, d), kind = r();
        const child = r() < 0.09;
        this.register({ k: 'person', x: p.x, y: p.y, c: pick(r, cloth), h: pick(r, hair), sk: pick(r, skin), kind: kind < 0.07 ? 'flag' : kind < 0.12 ? 'umb' : 'p', fc: pick(r, cloth), a: p.a + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (r() - 0.5) * 0.7, sc: child ? 0.7 : rr(r, 0.92, 1.1) }, 40);
      }
      if (z.big) for (let s = z.a + 6; s < z.b - 6; s += rr(r, 9, 14)) {
        const p = this.worldAt(s, side * (barrierD + 5.2));
        this.register({ k: 'tent', x: p.x, y: p.y, w: rr(r, 90, 130), h: rr(r, 60, 80), a: p.a, c: pick(r, cloth) }, 90);
      }
    }
    // avenues d'arbres le long de la route
    if (o.biome !== 'desert') for (let s = 100; s < L; s += rr(r, 250, 600)) if (r() < 0.4) {
      const side = r() < 0.5 ? -1 : 1, off = 4 + rr(r, 1.7, 2.1), len = rr(r, 120, 320);
      for (let t = s; t < Math.min(s + len, L - 100); t += rr(r, 1.3, 1.7)) {
        const p = this.worldAt(t, side * off + rr(r, -0.1, 0.1));
        this.register({ k: 'tree', x: p.x, y: p.y, r: rr(r, 20, 27), col: pick(r, B.trees), v: r(), conifer: false }, 50);
      }
    }
    // panneaux de distance, flamme rouge, ligne et portique d'arrivée
    for (const m of [10000, 5000, 3000, 2000, 1000, 500, 300, 200, 100, 50]) {
      if (L - m < 0) continue;
      const p = this.worldAt(L - m, 4 + 1.6); this.register({ k: 'sign', x: p.x, y: p.y, txt: m >= 1000 ? `${m / 1000} km` : `${m} m` }, 50);
    }
    const fin = this.worldAt(L, 0), fl = this.worldAt(L - 1000, 0);
    this.register({ k: 'finish', x: fin.x, y: fin.y, a: fin.a }, HALF + 40);
    this.register({ k: 'gantry', x: fin.x, y: fin.y, a: fin.a, cols: ['#e4572e', '#f2f0e6', '#2a6fdb', '#f4c20d', '#e4572e', '#f2f0e6', '#2fa84f', '#f4c20d'], thin: false }, HALF + 90);
    this.register({ k: 'gantry', x: fl.x, y: fl.y, a: fl.a, cols: ['#d62839', '#f2f0e6', '#d62839', '#f2f0e6', '#d62839', '#f2f0e6', '#d62839', '#f2f0e6'], thin: true }, HALF + 90);
  }

  /* --- décor d'une tuile (aléatoire, indépendant du reste) --- */
  private gen(tx: number, ty: number): Gen {
    const key = `${tx},${ty}`, hit = this.gens.get(key); if (hit) return hit;
    const { B, o } = this, r = mulberry32(hash(o.seed, tx, ty));
    const x0 = tx * TILE, y0 = ty * TILE, g: Gen = { objs: [], fields: [], blobs: [], lakes: [] };
    const here = this.roadNear(x0 + TILE / 2, y0 + TILE / 2);
    const near = here.d < TILE * 1.6;                          // loin de la route : décor allégé
    const pt = () => ({ x: x0 + r() * TILE, y: y0 + r() * TILE });
    const far = (x: number, y: number, m: number) => this.roadNear(x, y).d > HALF + m;

    for (let i = 0; i < 4; i++) { const p = pt(); g.blobs.push({ x: p.x, y: p.y, r: rr(r, 200, 480), c: pick(r, B.blobs), a: rr(r, 0.18, 0.4) }); }
    if (B.lake && r() < 0.05) { const p = pt(), rad = rr(r, 200, 320); if (this.roadNear(p.x, p.y).d > rad + HALF + 170) g.lakes.push({ x: p.x, y: p.y, r: rad, seed: Math.floor(r() * 1e9) }); }
    const inLake = (x: number, y: number, m: number) => g.lakes.some((l) => Math.hypot(x - l.x, y - l.y) < l.r + m);
    if (B.fields.length) for (let i = 0, n = Math.floor(rr(r, 0, 1.7)); i < n; i++) {
      const p = pt(), w = rr(r, 300, 560), h = rr(r, 220, 400), a = r() < 0.6 ? this.roadNear(p.x, p.y).th : (r() < 0.5 ? 0 : Math.PI / 2);
      const c = Math.cos(a), s = Math.sin(a); let ok = true;
      for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        const qx = p.x + (u * w / 2) * c - (v * h / 2) * s, qy = p.y + (u * w / 2) * s + (v * h / 2) * c;
        if (!far(qx, qy, 110) || inLake(qx, qy, 40)) { ok = false; break; }
      }
      if (ok) g.fields.push({ x: p.x, y: p.y, w, h, a, c: pick(r, B.fields), gap: rr(r, 11, 19) });
    }
    const nForest = Math.round(rr(r, 0.4, 2.4) * B.forest * (near ? 1 : 0.6));
    for (let i = 0; i < nForest; i++) {
      const c = pt(), spread = rr(r, 70, 200), cnt = Math.floor(rr(r, 6, 22));
      for (let j = 0; j < cnt; j++) {
        const a = r() * TAU, d = Math.sqrt(r()) * spread, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
        if (!far(x, y, 90) || inLake(x, y, 25)) continue;
        g.objs.push({ k: 'tree', x, y, r: rr(r, 22, 40), col: pick(r, B.trees), v: r(), conifer: o.biome === 'automne' ? r() < 0.15 : r() < 0.25 });
      }
    }
    for (let i = 0; i < (near ? 14 : 6); i++) {
      const p = pt(), kind = pick(r, B.extras);
      if (!far(p.x, p.y, 90) || inLake(p.x, p.y, 15)) continue;
      if (kind === 'hay') { if (g.fields.some((f) => Math.abs(p.x - f.x) < f.w * 0.3 && Math.abs(p.y - f.y) < f.h * 0.3)) g.objs.push({ k: 'hay', x: p.x, y: p.y, r: 14 }); }
      else if (kind === 'rock') g.objs.push({ k: 'rock', x: p.x, y: p.y, r: rr(r, 8, 24), a: r() * TAU, sides: 5 + Math.floor(r() * 3) });
      else if (kind === 'cactus') g.objs.push({ k: 'cactus', x: p.x, y: p.y, r: rr(r, 9, 14) });
      else g.objs.push({ k: 'bush', x: p.x, y: p.y, r: rr(r, 9, 17), col: pick(r, B.trees) });
    }
    if (near && r() < 0.14) {
      const c = pt(), ri = this.roadNear(c.x, c.y);
      if (ri.d > HALF + 230 && !inLake(c.x, c.y, 80)) for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
        const x = c.x + rr(r, -170, 170), y = c.y + rr(r, -110, 110);
        if (!far(x, y, 170) || inLake(x, y, 60) || g.fields.some((f) => Math.abs(x - f.x) < f.w / 2 + 20 && Math.abs(y - f.y) < f.h / 2 + 20)) continue;
        if (g.objs.some((q) => q.k === 'house' && Math.hypot(q.x - x, q.y - y) < 115)) continue;
        g.objs.push({ k: 'house', x, y, w: rr(r, 64, 96), h: rr(r, 46, 64), a: ri.th + (r() < 0.5 ? 0 : Math.PI / 2), roof: pick(r, B.roof), flat: o.biome === 'desert', wall: B.wall, chim: r() < 0.6 });
      }
    }
    this.gens.set(key, g);
    if (this.gens.size > 240) this.gens.delete(this.gens.keys().next().value as string);
    return g;
  }

  /* ------------------------- dessin d'une tuile ------------------------- */
  drawTile(ctx: CanvasRenderingContext2D, tx: number, ty: number, q = 1): void {
    const { B } = this, x0 = tx * TILE, y0 = ty * TILE, M = 140;
    ctx.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
    ctx.fillStyle = B.base; ctx.fillRect(x0, y0, TILE, TILE);
    const near = (x: number, y: number, m: number) => x > x0 - m && x < x0 + TILE + m && y > y0 - m && y < y0 + TILE + m;
    const gens: Gen[] = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) gens.push(this.gen(tx + i, ty + j));

    for (const g of gens) for (const b of g.blobs) {
      if (!near(b.x, b.y, b.r)) continue;
      const gr = ctx.createRadialGradient(b.x, b.y, b.r * 0.15, b.x, b.y, b.r);
      gr.addColorStop(0, hexA(b.c, b.a)); gr.addColorStop(1, hexA(b.c, 0)); ctx.fillStyle = gr; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    for (const g of gens) for (const f of g.fields) {
      if (!near(f.x, f.y, Math.hypot(f.w, f.h) / 2)) continue;
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
      ctx.fillStyle = f.c; ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
      if (B.stripes) {
        ctx.fillStyle = 'rgba(40,50,10,.13)'; for (let y = -f.h / 2; y < f.h / 2; y += f.gap) ctx.fillRect(-f.w / 2, y, f.w, f.gap * 0.45);
        ctx.strokeStyle = 'rgba(40,60,20,.35)'; ctx.lineWidth = 5; ctx.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
      }
      ctx.restore();
    }
    for (const g of gens) for (const l of g.lakes) {
      if (!near(l.x, l.y, l.r * 1.4)) continue;
      const blob = (rad: number, dx: number, col: string) => {
        const rn = mulberry32(l.seed), n = 14, pts: [number, number][] = [];
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rd = rad * (1 + (rn() - 0.5) * 0.24); pts.push([l.x + dx + Math.cos(a) * rd, l.y + dx + Math.sin(a) * rd]); }
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const p0 = pts[i]!, p1 = pts[(i + 1) % n]!, mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p0[0], p0[1], mx, my); }
        const p0 = pts[0]!, p1 = pts[1]!; ctx.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      };
      blob(l.r * 1.18, 0, B.shore); blob(l.r, 0, B.water); blob(l.r * 0.72, l.r * 0.05, 'rgba(20,70,90,.22)');
    }

    this.drawRoad(ctx, tx, ty);

    // objets : ombres puis corps
    const list: Obj[] = [];
    for (const g of gens) for (const ob of g.objs) if (near(ob.x, ob.y, M)) list.push(ob);
    for (const ob of this.placed.get(`${tx},${ty}`) ?? []) list.push(ob);
    for (const ob of list) if (ob.k === 'finish') finishLine(ctx, ob);
    for (const ob of list) shadowOf(ctx, ob);
    for (const ob of list) if (ob.k !== 'gantry' && ob.k !== 'finish') bodyOf(ctx, ob);
    for (const ob of list) if (ob.k === 'gantry') gantry(ctx, ob);
  }

  private drawRoad(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
    const { B, PX, PY, road } = this;
    const set = new Set<number>();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = this.idx.get(`${tx + i},${ty + j}`); if (a) for (const s of a) set.add(s); }
    if (!set.size) return;
    const ids = [...set].sort((a, b) => a - b), runs: number[][] = [];
    for (const i of ids) { const last = runs[runs.length - 1]; if (last && i - last[last.length - 1]! <= 1) last.push(i); else runs.push([i]); }
    const path = (run: number[], off: number) => {
      ctx.beginPath();
      run.forEach((i, k) => { const th = road.TH[i]!, x = PX[i]! - Math.sin(th) * off, y = PY[i]! + Math.cos(th) * off; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    };
    ctx.lineJoin = 'round';
    for (const run of runs) {
      if (run.length < 2) continue;
      ctx.lineCap = 'round';
      path(run, 0); ctx.strokeStyle = hexA(B.verge, 0.55); ctx.lineWidth = ROAD_W + 140; ctx.stroke();
      path(run, 0); ctx.strokeStyle = B.shoulder; ctx.lineWidth = ROAD_W + 48; ctx.stroke();
      path(run, 0); ctx.strokeStyle = 'rgba(0,0,0,.20)'; ctx.lineWidth = ROAD_W + 12; ctx.stroke();
      path(run, 0); ctx.strokeStyle = '#4b4d55'; ctx.lineWidth = ROAD_W; ctx.stroke();
      ctx.lineCap = 'butt';
      for (const o of [-60, 60]) { path(run, o); ctx.strokeStyle = 'rgba(15,15,22,.20)'; ctx.lineWidth = 30; ctx.stroke(); }
      for (const o of [-(HALF - 8), HALF - 8]) { path(run, o); ctx.strokeStyle = '#f2f0e6'; ctx.lineWidth = 4; ctx.stroke(); }
      ctx.setLineDash([34, 34]); ctx.lineDashOffset = (run[0]! * road.ds * PX_PER_M) % 68;
      path(run, 0); ctx.strokeStyle = 'rgba(245,235,200,.8)'; ctx.lineWidth = 3.5; ctx.stroke(); ctx.setLineDash([]);
    }
    // grain du bitume (uniquement les échantillons de cette tuile)
    const own = this.idx.get(`${tx},${ty}`);
    if (own) for (const i of own) {
      const rs = mulberry32(i * 2654435761 | 0), th = road.TH[i]!;
      for (let k = 0; k < 14; k++) {
        const along = rs() * road.ds * PX_PER_M, lat = (rs() - 0.5) * (ROAD_W - 14), sz = rr(rs, 1, 2.6);
        ctx.fillStyle = rs() < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.18)';
        ctx.fillRect(PX[i]! + Math.cos(th) * along - Math.sin(th) * lat, PY[i]! + Math.sin(th) * along + Math.cos(th) * lat, sz, sz);
      }
    }
  }
}

/* ------------------------- corps et ombres ------------------------- */
function finishLine(ctx: CanvasRenderingContext2D, o: Extract<Obj, { k: 'finish' }>) {
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a); const sq = 14;
  for (let row = 0; row < 3; row++) for (let c = 0; c * sq < ROAD_W - 14; c++) { ctx.fillStyle = (row + c) % 2 ? '#15151a' : '#f4f2ea'; ctx.fillRect(-sq * 1.5 + row * sq, -HALF + 7 + c * sq, sq + 0.5, sq + 0.5); }
  ctx.restore();
}
function gantry(ctx: CanvasRenderingContext2D, o: Extract<Obj, { k: 'gantry' }>) {
  const half = HALF + 26, bw = o.thin ? 7 : 9;
  ctx.save(); ctx.translate(o.x + SUN.x * 44, o.y + SUN.y * 44); ctx.rotate(o.a);
  ctx.fillStyle = 'rgba(15,20,10,.30)'; ctx.fillRect(-bw, -half, bw * 2, half * 2); ctx.restore();
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a);
  for (const s of [-1, 1]) { ctx.fillStyle = '#7f8794'; ctx.beginPath(); ctx.arc(0, s * half, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#b4bcc8'; ctx.beginPath(); ctx.arc(-2, s * half - 2, 7, 0, TAU); ctx.fill(); }
  const seg = (half * 2) / o.cols.length;
  o.cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-bw, -half + i * seg, bw * 2, seg + 0.5); });
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.strokeRect(-bw, -half, bw * 2, half * 2);
  ctx.restore();
}
function shadowOf(ctx: CanvasRenderingContext2D, o: Obj) {
  ctx.fillStyle = 'rgba(25,35,15,.26)';
  const e = (dx: number, dy: number, rx: number, ry: number, a = 0) => { ctx.beginPath(); ctx.ellipse(o.x + dx, o.y + dy, rx, ry, a, 0, TAU); ctx.fill(); };
  switch (o.k) {
    case 'tree': e(SUN.x * o.r * 0.9, SUN.y * o.r * 0.9, o.r * 1.02, o.r * 0.95); break;
    case 'bush': e(SUN.x * o.r * 0.7, SUN.y * o.r * 0.7, o.r, o.r * 0.9); break;
    case 'rock': e(SUN.x * o.r * 0.8, SUN.y * o.r * 0.8, o.r * 1.1, o.r * 0.9); break;
    case 'cactus': e(SUN.x * o.r * 1.3, SUN.y * o.r * 1.3, o.r * 0.9, o.r * 0.9); break;
    case 'hay': e(SUN.x * 8, SUN.y * 8, o.r, o.r); break;
    case 'house': ctx.save(); ctx.translate(o.x + SUN.x * 20, o.y + SUN.y * 20); ctx.rotate(o.a); ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.restore(); break;
    case 'tent': ctx.save(); ctx.translate(o.x + SUN.x * 8, o.y + SUN.y * 8); ctx.rotate(o.a); ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.restore(); break;
    case 'sign': ctx.fillRect(o.x - 22 + SUN.x * 8, o.y - 18 + SUN.y * 8, 44, 36); break;
    case 'person': e(SUN.x * 5, SUN.y * 5, 10 * o.sc, 6.5 * o.sc, o.a); break;
    case 'barrier': ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(o.x + 4, o.y + 4); ctx.lineTo(o.x2 + 4, o.y2 + 4); ctx.stroke(); break;
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
    case 'tent': ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a); ctx.fillStyle = o.c; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let x = -o.w / 2; x < o.w / 2; x += 18) ctx.fillRect(x, -o.h / 2, 9, o.h); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.restore(); break;
    case 'sign': {
      ctx.save(); ctx.translate(o.x, o.y); ctx.fillStyle = '#e9e8e4'; rrect(ctx, -22, -18, 44, 36, 4); ctx.fill(); ctx.strokeStyle = '#b9b8b2'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#16161a'; ctx.font = `800 ${o.txt.length > 3 ? 15 : 19}px "Trebuchet MS", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.txt, 0, 1.5); ctx.restore(); break;
    }
    case 'barrier': ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x2, o.y2); ctx.stroke(); ctx.fillStyle = '#7d848f'; ctx.beginPath(); ctx.arc(o.x, o.y, 3.6, 0, TAU); ctx.fill(); break;
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
/** Spectateur vu de dessus, à l'échelle réelle : épaules ≈ 0,5 m (20 px), tête ≈ 0,22 m (9 px). */
function person(ctx: CanvasRenderingContext2D, o: Extract<Obj, { k: 'person' }>) {
  const { x, y, sc } = o;
  if (o.kind === 'umb') {
    ctx.fillStyle = o.fc; ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.82)'; for (let i = 0; i < 8; i += 2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 24, (i / 8) * TAU, ((i + 1) / 8) * TAU); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill(); return;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.a); ctx.scale(sc, sc);
  ctx.fillStyle = o.c; ctx.beginPath(); ctx.ellipse(0, 0, 5.8, 10.5, 0, 0, TAU); ctx.fill();                  // épaules (large axe perpendiculaire au regard)
  ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(-1.8, 0, 2.4, 8.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = o.sk; ctx.beginPath(); ctx.arc(1.8, 0, 4.9, 0, TAU); ctx.fill();                            // tête
  ctx.fillStyle = o.h; ctx.beginPath(); ctx.arc(1.4, 0, 5, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();         // cheveux (derrière)
  if (o.kind === 'flag') {
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-1, 9); ctx.lineTo(-1, 26); ctx.stroke();
    ctx.fillStyle = o.fc; ctx.fillRect(-9, 26, 16, 11); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-9, 29.5, 16, 3.5);
  }
  ctx.restore();
}
