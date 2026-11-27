import type { Alea } from '../contrats/index.ts';

/**
 * Générateur mulberry32 : déterministe, rapide, sans dépendance.
 * @param graine entier (32 bits) ; la même graine donne toujours la même suite.
 */
export function creerAlea(graine: number): Alea {
  let etat = graine >>> 0;
  return {
    suivant(): number {
      etat = (etat + 0x6d2b79f5) >>> 0;
      let t = etat;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
