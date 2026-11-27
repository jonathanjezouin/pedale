/* =====================================================================
   Tracé en plan (docs/v0.0.3-parcours.md §5). La sinuosité dépend du terrain :
     plat      longues lignes droites, grandes courbes ;
     vallonné  sinuosité modérée (rayons de 150 à 600 m) ;
     montagne  courbes plus serrées sur les pentes raides, plus larges en descente. Lacets DOUX uniquement (rayon ≥ 80 m).
   Le tracé ne se recoupe pas : contrôle de distance entre tronçons non adjacents.
   ===================================================================== */
import type { TypeEtape } from './types';
import { PAS } from './types';
import type { Rng } from './rng';
import { borne, range } from './rng';

export interface Trace { x: Float64Array; y: Float64Array; cap: Float64Array; rayonMin: number; sansRecoupement: boolean }

/** Distance en dessous de laquelle deux tronçons non adjacents sont considérés comme se recoupant (la route fait ~8 m de large). */
export const DISTANCE_RECOUPEMENT = 30;
/** Deux points distants de moins de ce nombre d'échantillons sont adjacents (un virage serré les rapproche légitimement). */
const ADJACENTS = 45;
export const RAYON_MIN_LACET = 80;

/** Détecte un recoupement par hachage spatial. */
export function seRecoupe(x: Float64Array, y: Float64Array): boolean {
  const cell = 60, n = x.length;
  const grille = new Map<number, number[]>();
  const cle = (cx: number, cy: number) => cx * 73856093 ^ cy * 19349663;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(x[i]! / cell), cy = Math.floor(y[i]! / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = grille.get(cle(cx + dx, cy + dy));
      if (l) for (const j of l) if (i - j > ADJACENTS && Math.hypot(x[i]! - x[j]!, y[i]! - y[j]!) < DISTANCE_RECOUPEMENT) return true;
    }
    const k = cle(cx, cy);
    const l = grille.get(k); if (l) l.push(i); else grille.set(k, [i]);
  }
  return false;
}

function tentative(r: Rng, type: TypeEtape, alt: Float64Array, echelle: number): Trace {
  const n = alt.length;
  const kappa = new Float64Array(n);
  let cap0 = 0, i = 0, dernier: 1 | -1 = r() < 0.5 ? 1 : -1;
  const penteLocale = (j: number) => ((alt[Math.min(n - 1, j + 5)]! - alt[Math.max(0, j - 5)]!) / (10 * PAS)) * 100;
  while (i < n) {
    const pente = penteLocale(i);
    const raide = Math.abs(pente);
    const pDroit = type === 'plate' ? 0.5 : type === 'vallonnee' ? 0.25 : 0.12;
    let longueur: number, courbure = 0;
    if (r() < pDroit) {
      longueur = type === 'plate' ? range(r, 2000, 12_000) : type === 'vallonnee' ? range(r, 300, 2500) : range(r, 200, 1500);
    } else {
      let R: number, angle: number;
      if (type === 'plate') { R = range(r, 800, 3000); angle = range(r, 0.15, 1.2); }
      else if (type === 'vallonnee') { R = range(r, 150, 600); angle = range(r, 0.3, 2.0); }
      else {
        // courbes plus serrées sur les pentes raides (lacets doux), plus larges en descente
        const serre = borne(1 - (raide - 3) / 14, 0.45, 1);
        R = range(r, RAYON_MIN_LACET, 420) * (pente < -2 ? 1.6 : 1) * (pente > 3 ? serre : 1);
        angle = range(r, 0.4, 2.0);
      }
      R = Math.max(RAYON_MIN_LACET, R * echelle);
      // les virages alternent (les lacets vont à gauche puis à droite) et on revient vers le cap d'origine : l'étape va de A à B, elle ne s'enroule pas
      const dev = cap0, alterne = type === 'plate' ? 0.55 : 0.8, limite = type === 'montagne' ? 0.9 : 1.3;
      const contraire = (dev > 0 ? -1 : 1) as 1 | -1;
      const signe = (Math.abs(dev) > limite ? (r() < 0.92 ? contraire : -contraire) : r() < alterne ? -dernier : dernier) as 1 | -1;
      dernier = signe;
      longueur = R * angle; courbure = signe / R; cap0 += signe * angle;
    }
    const nb = Math.max(1, Math.round(longueur / PAS));
    for (let k = 0; k < nb && i < n; k++, i++) kappa[i] = courbure;
  }
  // raccords : la courbure varie progressivement (clothoïdes grossières)
  const k2 = new Float64Array(n);
  for (let j = 0; j < n; j++) { let s = 0, c = 0; for (let q = Math.max(0, j - 4); q <= Math.min(n - 1, j + 4); q++) { s += kappa[q]!; c++; } k2[j] = s / c; }
  const x = new Float64Array(n), y = new Float64Array(n), cap = new Float64Array(n);
  let th = 0, kmax = 0;
  for (let j = 0; j < n; j++) {
    cap[j] = th; kmax = Math.max(kmax, Math.abs(k2[j]!));
    if (j < n - 1) { const mid = th + (k2[j]! * PAS) / 2; x[j + 1] = x[j]! + Math.cos(mid) * PAS; y[j + 1] = y[j]! + Math.sin(mid) * PAS; th += k2[j]! * PAS; }
  }
  return { x, y, cap, rayonMin: kmax > 0 ? 1 / kmax : Infinity, sansRecoupement: !seRecoupe(x, y) };
}

/** Génère le tracé en plan lié au relief ; en cas de recoupement, on retire et, à défaut, on élargit les courbes. */
export function genererTrace(r: Rng, type: TypeEtape, alt: Float64Array): Trace {
  let derniere: Trace | null = null;
  for (let essai = 0; essai < 24; essai++) {
    const t = tentative(r, type, alt, 1 + 0.12 * Math.max(0, essai - 5));
    if (t.sansRecoupement) return t;
    derniere = t;
  }
  return derniere!;
}
