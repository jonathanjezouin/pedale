// Décor ambiant (UF 2.7) : forêts, buissons, rochers, champs, lacs, maisons, taches de sol.
// Le monde est découpé en cellules de 128 m ; chacune est tirée de (graine, cellule) : même graine, même décor.
// Densité uniforme dans le plan (indépendante de la forme de la route), éléments refusés s'ils touchent la route.
import { creerAlea, type Etape } from '@pedale/sim';
import { type Biome, type CleBiome } from './biomes.ts';
import type { Champ, Item, Lac, Tache } from './items.ts';

export const TAILLE_CELLULE_M = 128;
/** Au-delà de cette distance au centre de la cellule, aucun élément (la plus grande forme : un champ de 140 m). */
export const PORTEE_CELLULE_M = 110;
const TAU = Math.PI * 2;

export interface Cellule {
  readonly cx: number;
  readonly cy: number;
  readonly origineX_m: number;
  readonly origineY_m: number;
  readonly taches: readonly Tache[];
  readonly champs: readonly Champ[];
  readonly lacs: readonly Lac[];
  readonly items: readonly Item[];
}

const hash = (a: number, b: number, c: number): number => (((a * 73_856_093) ^ (b * 19_349_663) ^ (c * 83_492_791)) >>> 0) || 1;

/** Distance au bord de la route (m) et cap de la route en un point ; `d` très grand s'il n'y a pas de route à proximité. */
export type Proximite = (x_m: number, y_m: number) => { d: number; cap: number };

/** Recherche exhaustive : examine toute la route (lente, de référence). */
export const proximiteComplete = (etape: Etape): Proximite => (x, y) => { const p = etape.projeter(x, y); return p ? { d: p.bord_m, cap: p.cap_rad } : { d: 1e9, cap: 0 }; };

/**
 * Recherche limitée aux blocs de route `s_milieux` (abscisses du milieu des blocs voisins de la cellule) : même résultat que la recherche
 * complète tant que ces blocs contiennent toute la route proche, et un coût indépendant de la longueur de l'étape.
 */
export const proximiteLocale = (etape: Etape, s_milieux: readonly number[]): Proximite => {
  if (s_milieux.length === 0) return () => ({ d: 1e9, cap: 0 });
  return (x, y) => {
    let meilleur = { d: 1e9, cap: 0 };
    for (const s of s_milieux) { const p = etape.projeter(x, y, s); if (p && p.bord_m < meilleur.d) meilleur = { d: p.bord_m, cap: p.cap_rad }; }
    return meilleur;
  };
};

export function construireCellule(etape: Etape, biome: Biome, cle: CleBiome, cx: number, cy: number, proximite: Proximite = proximiteComplete(etape)): Cellule {
  const alea = creerAlea(hash(etape.graine, cx, cy));
  const r = () => alea.suivant();
  const rr = (a: number, b: number) => a + r() * (b - a);
  const pick = <T,>(t: readonly T[]): T => t[Math.floor(r() * t.length)] as T;
  const ox = cx * TAILLE_CELLULE_M, oy = cy * TAILLE_CELLULE_M;
  const pt = () => ({ x: ox + r() * TAILLE_CELLULE_M, y: oy + r() * TAILLE_CELLULE_M });
  // Distance d'un point au bord de la route (m) ; très grande si la route est à plus de 12 m de l'axe.
  const bord = proximite;
  const loin = (x: number, y: number, marge: number): boolean => bord(x, y).d > marge;

  const taches: Tache[] = [], champs: Champ[] = [], lacs: Lac[] = [], items: Item[] = [];
  const loc = (x: number) => x - ox, locY = (y: number) => y - oy;

  for (let i = 0; i < 5; i++) { const p = pt(); taches.push({ x: loc(p.x), y: locY(p.y), r: rr(12, 45), c: Math.floor(r() * biome.taches.length), alpha: rr(0.18, 0.4) }); }

  if (biome.lac && r() < 0.035) {
    const p = pt(), rad = rr(22, 38);
    // le lac (rive comprise : rayon × 1,18) ne touche pas la route
    let ok = true;
    for (let a = 0; a < TAU && ok; a += TAU / 16) ok = loin(p.x + Math.cos(a) * rad * 1.2, p.y + Math.sin(a) * rad * 1.2, 4) && loin(p.x, p.y, rad + 4);
    if (ok) lacs.push({ x: loc(p.x), y: locY(p.y), r: rad, graine: Math.floor(r() * 1e9) });
  }
  const dansLac = (x: number, y: number, m: number) => lacs.some((l) => Math.hypot(x - ox - l.x, y - oy - l.y) < l.r * 1.18 + m);

  if (biome.champs.length) for (let i = 0, n = Math.floor(rr(0, 1.7)); i < n; i++) {
    const p = pt(), l = rr(60, 110), h = rr(45, 85), b = bord(p.x, p.y);
    const a = r() < 0.6 ? b.cap : r() < 0.5 ? 0 : Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    // tout le champ doit être loin de la route : pourtour tous les 6 m, intérieur en grille de 12 m
    // (une route de 6 m qui le traverserait passerait sinon entre deux points de contrôle)
    const coin = (u: number, v: number) => ({ x: p.x + (u * l / 2) * c - (v * h / 2) * s, y: p.y + (u * l / 2) * s + (v * h / 2) * c });
    const libre = (u: number, v: number): boolean => { const q = coin(u, v); return loin(q.x, q.y, 3) && !dansLac(q.x, q.y, 3); };
    let ok = true;
    for (let a = -l / 2; a <= l / 2 + 1e-9 && ok; a += 12) for (let b = -h / 2; b <= h / 2 + 1e-9 && ok; b += 12) ok = libre((2 * a) / l, (2 * b) / h);
    for (let a = -l / 2; a <= l / 2 + 1e-9 && ok; a += 6) ok = libre((2 * a) / l, -1) && libre((2 * a) / l, 1);
    for (let b = -h / 2; b <= h / 2 + 1e-9 && ok; b += 6) ok = libre(-1, (2 * b) / h) && libre(1, (2 * b) / h);
    ok = ok && libre(1, 1) && libre(-1, 1) && libre(1, -1) && libre(-1, -1);
    if (ok) champs.push({ x: loc(p.x), y: locY(p.y), l, h, a, c: Math.floor(r() * biome.champs.length), ecart: rr(1.0, 1.6) });
  }

  // bosquets
  const nForet = Math.round(rr(0.6, 3.2) * biome.foret);
  for (let i = 0; i < nForet; i++) {
    const c = pt(), etalement = rr(14, 45), nb = Math.floor(rr(8, 26));
    for (let j = 0; j < nb; j++) {
      const a = r() * TAU, d = Math.sqrt(r()) * etalement, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      const rad = rr(1.8, 3.6);
      if (!loin(x, y, rad + 1.2) || dansLac(x, y, rad)) continue;
      items.push({ k: 'arbre', x: loc(x), y: locY(y), r: rad, c: Math.floor(r() * biome.arbres.length), v: r(), conifere: cle === 'automne' ? r() < 0.15 : r() < 0.25 });
    }
  }
  // éléments épars
  for (let i = 0; i < 34; i++) {
    const p = pt(), genre = pick(biome.extras);
    if (!loin(p.x, p.y, 3) || dansLac(p.x, p.y, 1)) continue;
    if (genre === 'foin') { if (champs.some((f) => Math.abs(p.x - ox - f.x) < f.l * 0.3 && Math.abs(p.y - oy - f.y) < f.h * 0.3)) items.push({ k: 'foin', x: loc(p.x), y: locY(p.y), r: 1.4 }); }
    else if (genre === 'rocher') { const rad = rr(0.6, 2.0); if (loin(p.x, p.y, rad + 1)) items.push({ k: 'rocher', x: loc(p.x), y: locY(p.y), r: rad, a: r() * TAU, cotes: 5 + Math.floor(r() * 3) }); }
    else if (genre === 'cactus') items.push({ k: 'cactus', x: loc(p.x), y: locY(p.y), r: rr(0.9, 1.4) });
    else { const rad = rr(0.9, 1.7); if (loin(p.x, p.y, rad + 1)) items.push({ k: 'buisson', x: loc(p.x), y: locY(p.y), r: rad, c: Math.floor(r() * biome.arbres.length) }); }
  }
  // maisons, par petits groupes, loin de la route
  if (r() < 0.11) {
    const c = pt(), bc = bord(c.x, c.y);
    if (bc.d > 30 && !dansLac(c.x, c.y, 10)) for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const x = c.x + rr(-17, 17), y = c.y + rr(-11, 11), l = rr(9, 13), h = rr(6.5, 9);
      if (!loin(x, y, 14) || dansLac(x, y, 8)) continue;
      if (champs.some((f) => Math.abs(x - ox - f.x) < f.l / 2 + 3 && Math.abs(y - oy - f.y) < f.h / 2 + 3)) continue;
      if (items.some((q) => q.k === 'maison' && Math.hypot(q.x - (x - ox), q.y - (y - oy)) < 14)) continue;
      items.push({ k: 'maison', x: loc(x), y: locY(y), l, h, a: bc.cap + (r() < 0.5 ? 0 : Math.PI / 2), toit: Math.floor(r() * biome.toits.length), plat: biome.toitPlat, cheminee: r() < 0.6 });
    }
  }
  return { cx, cy, origineX_m: ox, origineY_m: oy, taches, champs, lacs, items };
}

/** Cellules qui touchent le disque de centre (x, y) et de rayon r. */
export function cellulesProches(x_m: number, y_m: number, r_m: number, sortie: [number, number][] = []): [number, number][] {
  sortie.length = 0;
  const marge = r_m + PORTEE_CELLULE_M;
  for (let cx = Math.floor((x_m - marge) / TAILLE_CELLULE_M); cx <= Math.floor((x_m + marge) / TAILLE_CELLULE_M); cx++) {
    for (let cy = Math.floor((y_m - marge) / TAILLE_CELLULE_M); cy <= Math.floor((y_m + marge) / TAILLE_CELLULE_M); cy++) {
      // la cellule peut déborder jusqu'à PORTEE_CELLULE_M au-delà de ses bords : on teste la distance à son rectangle élargi
      const x0 = cx * TAILLE_CELLULE_M - PORTEE_CELLULE_M, x1 = (cx + 1) * TAILLE_CELLULE_M + PORTEE_CELLULE_M;
      const y0 = cy * TAILLE_CELLULE_M - PORTEE_CELLULE_M, y1 = (cy + 1) * TAILLE_CELLULE_M + PORTEE_CELLULE_M;
      const dx = Math.max(x0 - x_m, 0, x_m - x1), dy = Math.max(y0 - y_m, 0, y_m - y1);
      if (dx * dx + dy * dy <= r_m * r_m) sortie.push([cx, cy]);
    }
  }
  return sortie;
}
