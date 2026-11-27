// Blocs de route (UF 2.6) : la route est découpée en blocs de 200 m, construits à la demande puis libérés (cache LRU).
// Tout est échantillonné sur une grille ABSOLUE de 2 m, en coordonnées locales au bloc : rien ne dépend de la position fractionnaire
// du point suivi, donc rien ne « nage » d'une image à l'autre.
import { creerAlea, type Etape } from '@pedale/sim';

export const TAILLE_BLOC_M = 200;
export const PAS_M = 2;
const PAS_PAR_BLOC = TAILLE_BLOC_M / PAS_M;
/** Les blocs se recouvrent d'un pas : deux polygones qui se touchent laissent une couture claire à l'anti-crénelage. */
const RECOUVREMENT_PAS = 1;
/** Le décor s'étend jusqu'à cette distance de l'axe. */
export const DECOR_PORTEE_M = 55;
/** Fenêtre (m, de part et d'autre du bloc) où l'on cherche des branches de route voisines pour rejeter le décor. */
const FENETRE_REJET_M = 500;

export interface ElementDecor {
  /** Coordonnées locales au bloc (m). */
  readonly x_m: number;
  readonly y_m: number;
  readonly rayon_m: number;
  /** 0 = touffe d'herbe, 1 = buisson, 2 = arbre. */
  readonly genre: 0 | 1 | 2;
}

export interface Poteau { readonly x_m: number; readonly y_m: number; readonly cap_rad: number; readonly km: boolean }

/** Géométrie d'un bloc : coordonnées locales (origine = premier échantillon), en mètres. */
export interface GeometrieBloc {
  readonly indice: number;
  readonly origineX_m: number;
  readonly origineY_m: number;
  /** Nombre d'échantillons de bord. */
  readonly n: number;
  /** x0, y0, x1, y1, … pour chacun des bords. */
  readonly chausseeG: Float32Array;
  readonly chausseeD: Float32Array;
  readonly accotementG: Float32Array;
  readonly accotementD: Float32Array;
  readonly axe: Float32Array;
  /** Tirets du marquage central : 4 coins (x, y) par tiret. */
  readonly tirets: Float32Array;
  readonly decor: readonly ElementDecor[];
  readonly poteaux: readonly Poteau[];
}

export const nombreBlocs = (longueur_m: number): number => Math.ceil(longueur_m / TAILLE_BLOC_M);

/** Largeur du trait du marquage et dimensions des tirets (m). */
const TIRET_LONGUEUR_M = 4, TIRET_PERIODE_M = 12, TIRET_LARGEUR_M = 0.18;

export function construireBloc(etape: Etape, indice: number): GeometrieBloc {
  const L = etape.longueur_m;
  const s0 = indice * TAILLE_BLOC_M;
  const nPas = Math.min(PAS_PAR_BLOC + RECOUVREMENT_PAS, Math.ceil((L - s0) / PAS_M));
  const n = nPas + 1;
  const origine = etape.versMonde(s0, 0);
  const axe = new Float32Array(2 * n), cG = new Float32Array(2 * n), cD = new Float32Array(2 * n), aG = new Float32Array(2 * n), aD = new Float32Array(2 * n);
  const sx = new Float64Array(n), sy = new Float64Array(n), cap = new Float64Array(n), demi = new Float64Array(n), dt = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.min(s0 + i * PAS_M, L);
    const l = etape.lire(s);
    sx[i] = l.x_m; sy[i] = l.y_m; cap[i] = l.cap_rad; demi[i] = l.largeurChaussee_m / 2; dt[i] = s;
    const nx = -Math.sin(l.cap_rad), ny = Math.cos(l.cap_rad); // normale à gauche
    const px = l.x_m - origine.x_m, py = l.y_m - origine.y_m;
    const dc = demi[i] as number, da = dc + l.accotement_m;
    axe[2 * i] = px; axe[2 * i + 1] = py;
    cG[2 * i] = px + nx * dc; cG[2 * i + 1] = py + ny * dc;
    cD[2 * i] = px - nx * dc; cD[2 * i + 1] = py - ny * dc;
    aG[2 * i] = px + nx * da; aG[2 * i + 1] = py + ny * da;
    aD[2 * i] = px - nx * da; aD[2 * i + 1] = py - ny * da;
  }

  // marquage central : tirets de 4 m tous les 12 m, alignés sur la grille absolue (4 m = 2 pas)
  const tirets: number[] = [];
  const premier = Math.ceil(s0 / TIRET_PERIODE_M) * TIRET_PERIODE_M;
  for (let s = premier; s < s0 + TAILLE_BLOC_M && s + TIRET_LONGUEUR_M <= L; s += TIRET_PERIODE_M) {
    const i0 = Math.round((s - s0) / PAS_M), i1 = i0 + TIRET_LONGUEUR_M / PAS_M;
    if (i1 >= n) break;
    const trace = (i: number, signe: number): [number, number] => {
      const nx = -Math.sin(cap[i] as number), ny = Math.cos(cap[i] as number);
      return [(sx[i] as number) - origine.x_m + signe * nx * TIRET_LARGEUR_M / 2, (sy[i] as number) - origine.y_m + signe * ny * TIRET_LARGEUR_M / 2];
    };
    // le tiret suit la courbure : on le trace par ses 3 échantillons, côté gauche puis côté droit
    const pts: [number, number][] = [];
    for (let i = i0; i <= i1; i++) pts.push(trace(i, 1));
    for (let i = i1; i >= i0; i--) pts.push(trace(i, -1));
    for (const [x, y] of pts) tirets.push(x, y);
    tirets.push(Number.NaN, Number.NaN); // séparateur de tiret (3 échantillons × 2 côtés = 6 sommets)
  }

  // poteaux : un hectomètre sur deux côtés alternés, un kilomètre plus gros
  const poteaux: Poteau[] = [];
  for (let s = Math.ceil(s0 / 100) * 100; s < s0 + TAILLE_BLOC_M && s <= L; s += 100) {
    const l = etape.lire(s), cote = (Math.round(s / 100) % 2 === 0 ? 1 : -1);
    const q = etape.versMonde(s, cote * (etape.demiTotale(s) + 0.9));
    poteaux.push({ x_m: q.x_m - origine.x_m, y_m: q.y_m - origine.y_m, cap_rad: l.cap_rad, km: Math.round(s) % 1000 === 0 });
  }

  // axe voisin, au mètre, sur ±FENETRE_REJET_M : un élément ne doit toucher ni sa propre route ni une branche voisine (lacets)
  const voisin: { x: number; y: number; demi: number }[] = [];
  for (let s = Math.max(0, s0 - FENETRE_REJET_M); s <= Math.min(L, s0 + TAILLE_BLOC_M + FENETRE_REJET_M); s += 1) {
    const q = etape.versMonde(s, 0);
    voisin.push({ x: q.x_m - origine.x_m, y: q.y_m - origine.y_m, demi: etape.demiTotale(s) });
  }
  const libre = (x: number, y: number, rayon: number): boolean => {
    for (const v of voisin) {
      const dx = x - v.x, dy = y - v.y, lim = v.demi + rayon + 0.3;
      if (dx * dx + dy * dy < lim * lim) return false;
    }
    return true;
  };

  // décor : touffes, buissons, arbres, tous hors de la chaussée et des accotements (distance à l'axe ≥ demi-largeur + marge)
  const alea = creerAlea((((etape.graine * 73_856_093) ^ (indice * 19_349_663)) >>> 0) || 1);
  const decor: ElementDecor[] = [];
  const nb = 70 + Math.floor(alea.suivant() * 30);
  for (let k = 0; k < nb; k++) {
    const s = s0 + alea.suivant() * Math.min(TAILLE_BLOC_M, L - s0);
    const genre: 0 | 1 | 2 = alea.suivant() < 0.62 ? 0 : alea.suivant() < 0.65 ? 2 : 1;
    const rayon = genre === 0 ? 0.25 + alea.suivant() * 0.6 : genre === 1 ? 0.8 + alea.suivant() * 1.0 : 1.8 + alea.suivant() * 1.6;
    const ecart = etape.demiTotale(s) + rayon + 0.4 + (genre === 2 ? 3 : 0) + Math.pow(alea.suivant(), 1.6) * (DECOR_PORTEE_M - 6);
    const q = etape.versMonde(s, (alea.suivant() < 0.5 ? -1 : 1) * ecart);
    const x = q.x_m - origine.x_m, y = q.y_m - origine.y_m;
    if (libre(x, y, rayon)) decor.push({ x_m: x, y_m: y, rayon_m: rayon, genre });
  }
  return { indice, origineX_m: origine.x_m, origineY_m: origine.y_m, n, chausseeG: cG, chausseeD: cD, accotementG: aG, accotementD: aD, axe, tirets: Float32Array.from(tirets), decor, poteaux };
}

/** Boîtes englobantes de tous les blocs, et grille spatiale pour retrouver les blocs qui touchent une zone du plan. */
export class IndexSpatial {
  private readonly boites: Float64Array;
  private readonly grille = new Map<number, number[]>();
  private static readonly CELLULE_M = 400;

  constructor(readonly etape: Etape) {
    const nb = nombreBlocs(etape.longueur_m);
    this.boites = new Float64Array(4 * nb);
    const marge = 6 + DECOR_PORTEE_M;
    for (let b = 0; b < nb; b++) {
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      const s0 = b * TAILLE_BLOC_M, s1 = Math.min(s0 + TAILLE_BLOC_M + PAS_M, etape.longueur_m);
      for (let s = s0; s <= s1 + 1e-9; s += 10) {
        const p = etape.versMonde(Math.min(s, etape.longueur_m), 0);
        xmin = Math.min(xmin, p.x_m); xmax = Math.max(xmax, p.x_m); ymin = Math.min(ymin, p.y_m); ymax = Math.max(ymax, p.y_m);
      }
      xmin -= marge; xmax += marge; ymin -= marge; ymax += marge;
      this.boites.set([xmin, xmax, ymin, ymax], 4 * b);
      const c = IndexSpatial.CELLULE_M;
      for (let cx = Math.floor(xmin / c); cx <= Math.floor(xmax / c); cx++) {
        for (let cy = Math.floor(ymin / c); cy <= Math.floor(ymax / c); cy++) {
          const cle = IndexSpatial.cle(cx, cy);
          const l = this.grille.get(cle);
          if (l) l.push(b); else this.grille.set(cle, [b]);
        }
      }
    }
  }

  private static cle(cx: number, cy: number): number { return (cx + 100_000) * 200_003 + (cy + 100_000); }

  /** Blocs dont la boîte (élargie du décor) touche le disque de centre (x, y) et de rayon r. */
  blocsProches(x_m: number, y_m: number, r_m: number, sortie: number[] = []): number[] {
    sortie.length = 0;
    const c = IndexSpatial.CELLULE_M, vus = new Set<number>();
    for (let cx = Math.floor((x_m - r_m) / c); cx <= Math.floor((x_m + r_m) / c); cx++) {
      for (let cy = Math.floor((y_m - r_m) / c); cy <= Math.floor((y_m + r_m) / c); cy++) {
        for (const b of this.grille.get(IndexSpatial.cle(cx, cy)) ?? []) {
          if (vus.has(b)) continue;
          vus.add(b);
          const o = 4 * b;
          const bx = this.boites[o] as number, bX = this.boites[o + 1] as number, by = this.boites[o + 2] as number, bY = this.boites[o + 3] as number;
          const dx = Math.max(bx - x_m, 0, x_m - bX), dy = Math.max(by - y_m, 0, y_m - bY);
          if (dx * dx + dy * dy <= r_m * r_m) sortie.push(b);
        }
      }
    }
    return sortie;
  }
}

/** Cache à usage récent : garde au plus `capacite` éléments, libère les moins récemment utilisés. */
export class CacheRecent<T> {
  private readonly m = new Map<number, T>();
  constructor(readonly capacite: number, private readonly liberer?: (t: T) => void) {}
  get taille(): number { return this.m.size; }
  a(cle: number): boolean { return this.m.has(cle); }
  /** Rend l'élément (le construit si besoin) et le marque comme récemment utilisé. */
  prendre(cle: number, construire: () => T): T {
    let v = this.m.get(cle);
    if (v === undefined) v = construire(); else this.m.delete(cle);
    this.m.set(cle, v);
    while (this.m.size > this.capacite) {
      const plusAncien = this.m.keys().next().value as number;
      if (plusAncien === cle) break;
      const ancien = this.m.get(plusAncien) as T;
      this.m.delete(plusAncien);
      this.liberer?.(ancien);
    }
    return v;
  }
  cles(): number[] { return [...this.m.keys()]; }
}
