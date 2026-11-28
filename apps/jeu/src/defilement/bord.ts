// Décor de bord de route (UF 2.7) : zones de public avec barrières, spectateurs et tentes, allées d'arbres,
// ligne et portique d'arrivée, ligne de départ. Tout est posé par abscisse `s` et par décalage `d` (donc jamais sur la route).
import { creerAlea, type Etape } from '@pedale/sim';
import type { Biome } from './biomes.ts';
import { HABITS, PEAUX } from './biomes.ts';
import type { Item } from './items.ts';

export interface ZonePublic { readonly id: number; readonly a_m: number; readonly b_m: number; readonly cotes: readonly (-1 | 1)[]; readonly densite: number; readonly grande: boolean }
export interface Allee { readonly id: number; readonly a_m: number; readonly b_m: number; readonly cote: -1 | 1; readonly ecart_m: number }
export interface BordRoute { readonly zones: readonly ZonePublic[]; readonly allees: readonly Allee[]; readonly longueur_m: number }

/** Distance entre la barrière et le bord extérieur de l'accotement (m). */
export const BARRIERE_M = 0.7;
const hash = (a: number, b: number, c: number): number => (((a * 73_856_093) ^ (b * 19_349_663) ^ (c * 83_492_791)) >>> 0) || 1;

/** Zones de public et allées d'arbres de toute l'étape : une fonction de la graine et de la longueur seulement. */
export function genererBord(graine: number, longueur_m: number, biome: Biome): BordRoute {
  const alea = creerAlea(hash(graine, 7919, 1));
  const r = () => alea.suivant(), rr = (a: number, b: number) => a + r() * (b - a);
  const zones: ZonePublic[] = [
    { id: 0, a_m: 0, b_m: Math.min(14, longueur_m), cotes: [1], densite: 0.75, grande: false },
    { id: 1, a_m: Math.max(0, longueur_m - 90), b_m: longueur_m, cotes: [-1, 1], densite: 1, grande: true },
  ];
  for (let s = 300, id = 2; s < longueur_m - 200; s += rr(350, 900)) if (r() < 0.45) zones.push({ id: id++, a_m: s, b_m: s + rr(18, 60), cotes: [r() < 0.5 ? -1 : 1], densite: rr(0.45, 0.85), grande: false });
  const allees: Allee[] = [];
  if (biome.allees) for (let s = 100, id = 0; s < longueur_m; s += rr(250, 600)) if (r() < 0.4) allees.push({ id: id++, a_m: s, b_m: Math.min(longueur_m - 100, s + rr(120, 320)), cote: r() < 0.5 ? -1 : 1, ecart_m: rr(2.2, 2.6) });
  return { zones, allees: allees.filter((a) => a.b_m > a.a_m), longueur_m };
}

/** Éléments de bord de route qui tombent dans [s0, s1[ ; coordonnées locales à `origine`. */
export function itemsDeBord(etape: Etape, bord: BordRoute, biome: Biome, indiceBloc: number, s0: number, s1: number, origine: { x: number; y: number }): Item[] {
  const items: Item[] = [];
  const L = etape.longueur_m, graine = etape.graine;
  const loc = (q: { x_m: number; y_m: number }) => ({ x: q.x_m - origine.x, y: q.y_m - origine.y });
  const at = (s: number, d: number) => loc(etape.versMonde(Math.min(Math.max(s, 0), L), d));

  for (const z of bord.zones) {
    const lo = Math.max(z.a_m, s0), hi = Math.min(z.b_m, s1, L);
    if (hi <= lo) continue;
    const alea = creerAlea(hash(graine, z.id * 977 + 3, indiceBloc));
    const r = () => alea.suivant(), rr = (a: number, b: number) => a + r() * (b - a);
    for (const cote of z.cotes) {
      for (let s = lo; s < hi; s += 2) {
        const p = at(s, cote * (etape.demiTotale(s) + BARRIERE_M)), q = at(Math.min(s + 2, hi), cote * (etape.demiTotale(Math.min(s + 2, hi)) + BARRIERE_M));
        items.push({ k: 'barriere', x: p.x, y: p.y, x2: q.x, y2: q.y });
      }
      const rangs = z.grande ? 5 : 3;
      for (let s = lo; s < hi; s += 0.42) for (let rang = 0; rang < rangs; rang++) {
        if (r() > z.densite * (1 - rang * 0.1)) continue;
        const sp = Math.min(s + r() * 0.3, L), d = cote * (etape.demiTotale(sp) + BARRIERE_M + 0.55 + rang * 0.5 + r() * 0.22);
        const p = at(sp, d), type = r(), enfant = r() < 0.09;
        items.push({
          k: 'personne', x: p.x, y: p.y, a: etape.lire(sp).cap_rad + (cote > 0 ? -Math.PI / 2 : Math.PI / 2) + (r() - 0.5) * 0.7, echelle: enfant ? 0.7 : rr(0.92, 1.1),
          habit: Math.floor(r() * HABITS.length), peau: Math.floor(r() * PEAUX.length), genre: type < 0.07 ? 1 : type < 0.12 ? 2 : 0, fanion: Math.floor(r() * HABITS.length),
        });
      }
      if (z.grande) for (let s = Math.max(lo, z.a_m + 6); s < Math.min(hi, z.b_m - 6); s += rr(9, 14)) {
        const p = at(s, cote * (etape.demiTotale(s) + BARRIERE_M + 5.2 / 1.6));
        items.push({ k: 'tente', x: p.x, y: p.y, l: rr(2.3, 3.2), h: rr(1.5, 2.0), a: etape.lire(s).cap_rad, c: Math.floor(r() * HABITS.length) });
      }
    }
  }

  for (const al of bord.allees) {
    const lo = Math.max(al.a_m, s0), hi = Math.min(al.b_m, s1);
    if (hi <= lo) continue;
    const alea = creerAlea(hash(graine, al.id * 131 + 11, indiceBloc));
    const r = () => alea.suivant(), rr = (a: number, b: number) => a + r() * (b - a);
    for (let t = lo; t < hi; t += rr(5, 8)) { // des arbres espacés de 5 à 8 m : une allée, pas une haie
      const rad = rr(1.5, 2.1), p = at(t, al.cote * (etape.demiTotale(t) + rad + al.ecart_m + rr(-0.1, 0.1)));
      items.push({ k: 'arbre', x: p.x, y: p.y, r: rad, c: Math.floor(r() * biome.arbres.length), v: r(), conifere: false });
    }
  }

  // départ : ligne blanche à 1,5 m du départ
  if (s0 <= 1.5 && s1 > 1.5) { const p = at(1.5, 0); items.push({ k: 'ligne', x: p.x, y: p.y, a: etape.lire(1.5).cap_rad, demi: etape.demiChaussee(1.5) }); }
  // arrivée : damier de 3 rangées, portique ; flamme rouge à 1 km
  if (L >= s0 && L <= s1) {
    const cote = 0.35;
    for (let rang = 0; rang < 3; rang++) {
      const s = L - (rang + 0.5) * cote, demi = etape.demiChaussee(s), cap = etape.lire(s).cap_rad;
      for (let c = 0; (c + 1) * cote <= 2 * demi + 1e-9; c++) { const p = at(s, -demi + (c + 0.5) * cote); items.push({ k: 'carre', x: p.x, y: p.y, a: cap, cote, sombre: (rang + c) % 2 === 1 }); }
    }
    const p = at(L, 0);
    items.push({ k: 'portique', x: p.x, y: p.y, a: etape.lire(L).cap_rad, demi: etape.demiTotale(L) + 0.4, fin: true });
  }
  const fl = L - 1000;
  if (fl >= 0 && fl >= s0 && fl <= s1) { const p = at(fl, 0); items.push({ k: 'portique', x: p.x, y: p.y, a: etape.lire(fl).cap_rad, demi: etape.demiTotale(fl) + 0.4, fin: false }); }
  return items;
}
