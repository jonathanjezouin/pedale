// Blocs de route (UF 2.6, 2.7) : la route est découpée en blocs de 200 m, construits à la demande puis libérés (cache LRU).
// Tout est échantillonné sur une grille ABSOLUE de 2 m, en coordonnées locales au bloc : rien ne dépend de la position fractionnaire
// du point suivi, donc rien ne « nage » d'une image à l'autre.
import type { Etape } from '@pedale/sim';
import type { Biome } from './biomes.ts';
import { itemsDeBord, type BordRoute } from './bord.ts';
import type { Item } from './items.ts';

export const TAILLE_BLOC_M = 200;
export const PAS_M = 2;
const PAS_PAR_BLOC = TAILLE_BLOC_M / PAS_M;
/** Les blocs se recouvrent d'un pas : deux polygones qui se touchent laissent une couture claire à l'anti-crénelage. */
const RECOUVREMENT_PAS = 1;
/** Les éléments de bord de route (barrières, public, tentes, arbres d'allée) sont à moins de cette distance de l'axe. */
export const BORD_PORTEE_M = 20;
/** Largeur de la bande d'herbe qui borde l'accotement, et dépassement de l'ombre de chaussée (m). */
const HERBE_M = 1.2, OMBRE_M = 0.2;

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
  readonly herbeG: Float32Array;
  readonly herbeD: Float32Array;
  readonly ombreG: Float32Array;
  readonly ombreD: Float32Array;
  /** Traces de roues : deux lignes à ± 1,5 m (ou moins sur route étroite). */
  readonly traceG: Float32Array;
  readonly traceD: Float32Array;
  readonly axe: Float32Array;
  /** Tirets du marquage central : 6 sommets (x, y) par tiret, séparés par (NaN, NaN). */
  readonly tirets: Float32Array;
  /** Éléments de bord de route, poteaux d'hectomètre et de kilomètre compris. */
  readonly items: readonly Item[];
}

export const nombreBlocs = (longueur_m: number): number => Math.ceil(longueur_m / TAILLE_BLOC_M);

/** Largeur du trait du marquage et dimensions des tirets (m). */
const TIRET_LONGUEUR_M = 4, TIRET_PERIODE_M = 12, TIRET_LARGEUR_M = 0.18;

export function construireBloc(etape: Etape, indice: number, bord: BordRoute, biome: Biome): GeometrieBloc {
  const L = etape.longueur_m;
  const s0 = indice * TAILLE_BLOC_M;
  const nPas = Math.min(PAS_PAR_BLOC + RECOUVREMENT_PAS, Math.ceil((L - s0) / PAS_M));
  const n = nPas + 1;
  const origine = etape.versMonde(s0, 0);
  const tab = () => new Float32Array(2 * n);
  const axe = tab(), cG = tab(), cD = tab(), aG = tab(), aD = tab(), hG = tab(), hD = tab(), oG = tab(), oD = tab(), tG = tab(), tD = tab();
  const sx = new Float64Array(n), sy = new Float64Array(n), cap = new Float64Array(n);
  const poser = (t: Float32Array, i: number, px: number, py: number, nx: number, ny: number, d: number) => { t[2 * i] = px + nx * d; t[2 * i + 1] = py + ny * d; };
  for (let i = 0; i < n; i++) {
    const s = Math.min(s0 + i * PAS_M, L);
    const l = etape.lire(s);
    sx[i] = l.x_m; sy[i] = l.y_m; cap[i] = l.cap_rad;
    const nx = -Math.sin(l.cap_rad), ny = Math.cos(l.cap_rad); // normale à gauche
    const px = l.x_m - origine.x_m, py = l.y_m - origine.y_m;
    const dc = l.largeurChaussee_m / 2, da = dc + l.accotement_m, trace = Math.min(1.5, dc - 0.9);
    axe[2 * i] = px; axe[2 * i + 1] = py;
    poser(cG, i, px, py, nx, ny, dc); poser(cD, i, px, py, nx, ny, -dc);
    poser(aG, i, px, py, nx, ny, da); poser(aD, i, px, py, nx, ny, -da);
    poser(hG, i, px, py, nx, ny, da + HERBE_M); poser(hD, i, px, py, nx, ny, -da - HERBE_M);
    poser(oG, i, px, py, nx, ny, dc + OMBRE_M); poser(oD, i, px, py, nx, ny, -dc - OMBRE_M);
    poser(tG, i, px, py, nx, ny, trace); poser(tD, i, px, py, nx, ny, -trace);
  }

  // marquage central : tirets de 4 m tous les 12 m, alignés sur la grille absolue (4 m = 2 pas)
  const tirets: number[] = [];
  const premier = Math.ceil(s0 / TIRET_PERIODE_M) * TIRET_PERIODE_M;
  for (let s = premier; s < s0 + TAILLE_BLOC_M && s + TIRET_LONGUEUR_M <= L; s += TIRET_PERIODE_M) {
    const i0 = Math.round((s - s0) / PAS_M), i1 = i0 + TIRET_LONGUEUR_M / PAS_M;
    if (i1 >= n) break;
    const cote = (i: number, signe: number): [number, number] => {
      const nx = -Math.sin(cap[i] as number), ny = Math.cos(cap[i] as number);
      return [(sx[i] as number) - origine.x_m + signe * nx * TIRET_LARGEUR_M / 2, (sy[i] as number) - origine.y_m + signe * ny * TIRET_LARGEUR_M / 2];
    };
    const pts: [number, number][] = [];
    for (let i = i0; i <= i1; i++) pts.push(cote(i, 1));
    for (let i = i1; i >= i0; i--) pts.push(cote(i, -1));
    for (const [x, y] of pts) tirets.push(x, y);
    tirets.push(Number.NaN, Number.NaN);
  }

  // poteaux : un hectomètre sur deux côtés alternés, un kilomètre plus gros
  const items: Item[] = [];
  for (let s = Math.ceil(s0 / 100) * 100; s < s0 + TAILLE_BLOC_M && s <= L; s += 100) {
    const cote = Math.round(s / 100) % 2 === 0 ? 1 : -1;
    const q = etape.versMonde(s, cote * (etape.demiTotale(s) + 0.9));
    items.push({ k: 'poteau', x: q.x_m - origine.x_m, y: q.y_m - origine.y_m, km: Math.round(s) % 1000 === 0 });
  }
  items.push(...itemsDeBord(etape, bord, biome, indice, s0, Math.min(s0 + TAILLE_BLOC_M, L + 1e-9), { x: origine.x_m, y: origine.y_m }));

  return {
    indice, origineX_m: origine.x_m, origineY_m: origine.y_m, n,
    chausseeG: cG, chausseeD: cD, accotementG: aG, accotementD: aD, herbeG: hG, herbeD: hD, ombreG: oG, ombreD: oD, traceG: tG, traceD: tD, axe,
    tirets: Float32Array.from(tirets), items,
  };
}

/** Boîtes englobantes de tous les blocs, et grille spatiale pour retrouver les blocs qui touchent une zone du plan. */
export class IndexSpatial {
  private readonly boites: Float64Array;
  private readonly grille = new Map<number, number[]>();
  private static readonly CELLULE_M = 400;

  constructor(readonly etape: Etape) {
    const nb = nombreBlocs(etape.longueur_m);
    this.boites = new Float64Array(4 * nb);
    const marge = 6 + BORD_PORTEE_M;
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
  /** Retire un élément du cache (et le libère). */
  retirer(cle: number): void {
    const v = this.m.get(cle);
    if (v === undefined) return;
    this.m.delete(cle);
    this.liberer?.(v);
  }
}
