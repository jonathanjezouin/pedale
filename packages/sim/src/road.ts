/* =====================================================================
   La route : ligne centrale paramétrée par l'abscisse curviligne s (en m).
   La simulation raisonne dans le repère (s, d) : s le long de la route, d le décalage latéral
   (positif = à droite du sens de la course). Le repère « monde » (x, y en m, y vers le bas)
   ne sert qu'à l'orientation du vent et à l'affichage.
   Courbure κ > 0 : la route tourne à droite (vers les d positifs).
   ===================================================================== */
import { mulberry32, range } from './rng';
import type { Parcours, ProfilAlt } from '@pedale/parcours';

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
  /** altitude (m) à l'abscisse s : 0 sur la route du POC, celle du parcours sinon */
  alt(s: number): number;
  /** pente (fraction, > 0 en montée), lissée sur ~40 m */
  pente(s: number): number;
  /** vitesse maximale (m/s) en descente et en virage, freinage anticipé compris (docs/v0.0.5-pente.md §4) */
  vitesseMax(s: number): number;
  /** le parcours dont la route est tirée (profil échantillonné tous les 20 m depuis le départ), `null` pour la route du POC */
  profilEtape: Parcours | null;
}

/** Descente : vitesse maximale en ligne droite (m/s), accélération latérale tenable en virage (m/s²), et freinage (m/s²). */
export const V_DROITE = 24;
export const A_LAT = 5;
export const FREINAGE_DESCENTE = 2.5;
/** Avant le départ et après l'arrivée de l'étape, la route se prolonge en ligne droite et à plat. */
export const PROLONGEMENT_AVANT = 400;
export const PROLONGEMENT_APRES = 500;

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
    alt: () => 0, pente: () => 0, vitesseMax: () => V_DROITE, profilEtape: null,
  };
  return road;
}

/** Route d'une étape générée (docs/v0.0.5-pente.md §5) : tracé, altitude et cap du parcours rééchantillonnés tous les 2 m,
 *  prolongés en ligne droite et à plat avant le départ et après l'arrivée. */
export function creerRouteDepuisParcours(p: Parcours): Road {
  const s0 = -PROLONGEMENT_AVANT, s1 = p.distance + PROLONGEMENT_APRES;
  const n = Math.ceil((s1 - s0) / ROAD_DS) + 1;
  const X = new Float64Array(n), Y = new Float64Array(n), TH = new Float64Array(n), K = new Float64Array(n), A = new Float64Array(n);
  const cap0 = p.cap[0]!, capN = p.cap[p.n - 1]!;
  for (let i = 0; i < n; i++) {
    const s = s0 + i * ROAD_DS;
    if (s <= 0) { TH[i] = cap0; X[i] = p.x[0]! + Math.cos(cap0) * s; Y[i] = p.y[0]! + Math.sin(cap0) * s; A[i] = p.alt[0]!; }
    else if (s >= p.distance) { const d = s - p.distance; TH[i] = capN; X[i] = p.x[p.n - 1]! + Math.cos(capN) * d; Y[i] = p.y[p.n - 1]! + Math.sin(capN) * d; A[i] = p.alt[p.n - 1]!; }
    else {
      const f = s / p.pas, j = Math.min(p.n - 2, Math.floor(f)), t = f - j;
      TH[i] = p.cap[j]! + (p.cap[j + 1]! - p.cap[j]!) * t;
      X[i] = p.x[j]! + (p.x[j + 1]! - p.x[j]!) * t; Y[i] = p.y[j]! + (p.y[j + 1]! - p.y[j]!) * t;
      A[i] = p.alt[j]! + (p.alt[j + 1]! - p.alt[j]!) * t;
    }
  }
  for (let i = 0; i < n - 1; i++) K[i] = (TH[i + 1]! - TH[i]!) / ROAD_DS;
  K[n - 1] = K[n - 2]!;
  // pente : différence centrée sur ±20 m
  const P = new Float64Array(n), h = Math.round(20 / ROAD_DS);
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - h), b = Math.min(n - 1, i + h); P[i] = (A[b]! - A[a]!) / ((b - a) * ROAD_DS); }
  // vitesse maximale : virage (√(a_lat / κ)), ligne droite, puis passe arrière pour que le freinage commence avant le virage
  const V = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let k = 0; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) k = Math.max(k, Math.abs(K[j]!));
    V[i] = Math.min(V_DROITE, k > 1e-6 ? Math.sqrt(A_LAT / k) : V_DROITE);
  }
  for (let i = n - 2; i >= 0; i--) V[i] = Math.min(V[i]!, Math.sqrt(V[i + 1]! * V[i + 1]! + 2 * FREINAGE_DESCENTE * ROAD_DS));
  const idx = (s: number) => { const f = (s - s0) / ROAD_DS; const i = Math.max(0, Math.min(n - 2, Math.floor(f))); return { i, t: Math.max(0, Math.min(1, f - i)) }; };
  const lerp = (a: Float64Array, s: number) => { const { i, t } = idx(s); return a[i]! + (a[i + 1]! - a[i]!) * t; };
  const road: Road = {
    s0, s1, ds: ROAD_DS, n, X, Y, TH, K, courbes: true,
    heading: (s) => lerp(TH, s), courbure: (s) => lerp(K, s),
    xy(s) { const { i, t } = idx(s); return { x: X[i]! + (X[i + 1]! - X[i]!) * t, y: Y[i]! + (Y[i + 1]! - Y[i]!) * t }; },
    toXY(s, d) { const q = road.xy(s), hd = road.heading(s); return { x: q.x - Math.sin(hd) * d, y: q.y + Math.cos(hd) * d, heading: hd }; },
    capMoyen(a, b) { let cx = 0, cy = 0; for (let s = a; s <= b; s += 20) { const hd = road.heading(s); cx += Math.cos(hd); cy += Math.sin(hd); } return Math.atan2(cy, cx); },
    alt: (s) => lerp(A, s), pente: (s) => lerp(P, s), vitesseMax: (s) => lerp(V, s), profilEtape: p,
  };
  return road;
}

export type { ProfilAlt };
