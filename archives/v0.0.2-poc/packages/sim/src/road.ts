/* =====================================================================
   La route : ligne centrale paramétrée par l'abscisse curviligne s (en m).
   La simulation raisonne dans le repère (s, d) : s le long de la route, d le décalage latéral
   (positif = à droite du sens de la course). Le repère « monde » (x, y en m, y vers le bas)
   ne sert qu'à l'orientation du vent et à l'affichage.
   Courbure κ > 0 : la route tourne à droite (vers les d positifs).
   ===================================================================== */
import { mulberry32, range } from './rng';

export const ROAD_WIDTH = 8;          // m
export const ROAD_HALF = ROAD_WIDTH / 2;
export const ROAD_DS = 2;             // m entre deux échantillons

export interface Road {
  s0: number; s1: number; ds: number; n: number;
  X: Float64Array; Y: Float64Array; TH: Float64Array; K: Float64Array;
  courbes: boolean;
  heading(s: number): number;
  courbure(s: number): number;
  xy(s: number): { x: number; y: number };
  /** point du monde à l'abscisse s et au décalage latéral d */
  toXY(s: number, d: number): { x: number; y: number; heading: number };
  /** cap moyen sur [a, b] (rad) */
  capMoyen(a: number, b: number): number;
}

export function creerRoute(seed: number, s0: number, s1: number, courbes: boolean): Road {
  const r = mulberry32((seed ^ 0x2f6e2b1) | 0);
  const n = Math.ceil((s1 - s0) / ROAD_DS) + 1;
  // courbure = somme de bosses douces (cos²) : virages de grand rayon, jamais plus serrés que 450 m
  const bosses: { c: number; w: number; a: number }[] = [];
  if (courbes) for (let c = s0 + range(r, 300, 900); c < s1; c += range(r, 700, 1800)) {
    const sign = r() < 0.5 ? -1 : 1;
    bosses.push({ c, w: range(r, 350, 900), a: sign * range(r, 1 / 1500, 1 / 480) });
  }
  const kAt = (s: number) => {
    let k = 0;
    for (const b of bosses) { const u = (s - b.c) / b.w; if (Math.abs(u) < 1) { const c = Math.cos((u * Math.PI) / 2); k += b.a * c * c; } }
    return Math.max(-1 / 450, Math.min(1 / 450, k));
  };
  const X = new Float64Array(n), Y = new Float64Array(n), TH = new Float64Array(n), K = new Float64Array(n);
  let th = range(r, -0.9, 0.9), x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const s = s0 + i * ROAD_DS;
    K[i] = kAt(s); TH[i] = th; X[i] = x; Y[i] = y;
    const thMid = th + (K[i]! * ROAD_DS) / 2;
    x += Math.cos(thMid) * ROAD_DS; y += Math.sin(thMid) * ROAD_DS; th += K[i]! * ROAD_DS;
  }
  const idx = (s: number) => { const f = (s - s0) / ROAD_DS; const i = Math.max(0, Math.min(n - 2, Math.floor(f))); return { i, t: Math.max(0, Math.min(1, f - i)) }; };
  const road: Road = {
    s0, s1, ds: ROAD_DS, n, X, Y, TH, K, courbes,
    heading(s) { const { i, t } = idx(s); return TH[i]! + (TH[i + 1]! - TH[i]!) * t; },
    courbure(s) { const { i, t } = idx(s); return K[i]! + (K[i + 1]! - K[i]!) * t; },
    xy(s) { const { i, t } = idx(s); return { x: X[i]! + (X[i + 1]! - X[i]!) * t, y: Y[i]! + (Y[i + 1]! - Y[i]!) * t }; },
    toXY(s, d) { const p = road.xy(s), h = road.heading(s); return { x: p.x - Math.sin(h) * d, y: p.y + Math.cos(h) * d, heading: h }; },
    capMoyen(a, b) { let cx = 0, cy = 0; for (let s = a; s <= b; s += 20) { const h = road.heading(s); cx += Math.cos(h); cy += Math.sin(h); } return Math.atan2(cy, cx); },
  };
  return road;
}
