import type { Borne, Cadre, GrandeurCadree, Volonte } from '../../contrats/index.ts';

/** Borne d'une grandeur dans un cadre, si elle existe. */
export const borneDe = (cadre: Cadre, grandeur: GrandeurCadree): Borne | undefined =>
  cadre.find((b) => b.grandeur === grandeur);

/** Ramène une valeur dans le cadre (sans effet si la grandeur n'est pas bornée). */
export function borner(valeur: number, grandeur: GrandeurCadree, cadre: Cadre): number {
  const b = borneDe(cadre, grandeur);
  if (!b) return valeur;
  return Math.min(b.max ?? Infinity, Math.max(b.min ?? -Infinity, valeur));
}

/** Intersection de deux cadres : à chaque grandeur, la plus stricte des deux bornes. */
export function intersecter(a: Cadre, b: Cadre): Cadre {
  const grandeurs = [...new Set([...a, ...b].map((x) => x.grandeur))];
  return grandeurs.map((grandeur) => {
    const ba = borneDe(a, grandeur);
    const bb = borneDe(b, grandeur);
    const plus = (x: number | null | undefined, y: number | null | undefined, f: (u: number, v: number) => number): number | null =>
      x == null ? (y ?? null) : y == null ? x : f(x, y);
    const max = plus(ba?.max, bb?.max, Math.min);
    const min = plus(ba?.min, bb?.min, Math.max);
    return { grandeur, min: min !== null && max !== null ? Math.min(min, max) : min, max };
  });
}

export const memeCadre = (a: Cadre, b: Cadre): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Vrai si la volonté respecte le cadre reçu : chacune de ses visées est dans les bornes,
 * et chacune des bornes qu'elle impose au niveau d'en dessous est au moins aussi stricte.
 */
export function dansLeCadre(volonte: Volonte, cadreRecu: Cadre): boolean {
  const eps = 1e-9;
  const visees = volonte.visees.every((v) => {
    const b = borneDe(cadreRecu, v.grandeur);
    return !b || ((b.min === null || v.valeur >= b.min - eps) && (b.max === null || v.valeur <= b.max + eps));
  });
  const bornes = volonte.cadre.every((own) => {
    const b = borneDe(cadreRecu, own.grandeur);
    if (!b) return true;
    const minOk = b.min === null || (own.min !== null && own.min >= b.min - eps);
    const maxOk = b.max === null || (own.max !== null && own.max <= b.max + eps);
    return minOk && maxOk;
  });
  return visees && bornes;
}
