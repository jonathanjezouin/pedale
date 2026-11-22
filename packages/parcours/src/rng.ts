/** Générateur pseudo-aléatoire seedé (mulberry32). Aucun Math.random : tout est rejouable. */
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const range = (r: Rng, a: number, b: number) => a + r() * (b - a);
export const entier = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
/** Loi log-uniforme : autant de chances d'avoir une montée de 1 km que de 4 km. */
export const logUniforme = (r: Rng, a: number, b: number) => Math.exp(range(r, Math.log(a), Math.log(b)));
export function melanger<T>(r: Rng, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}
/** Tirage pondéré : `poids` est une liste de [valeur, poids]. */
export function tirer<T>(r: Rng, poids: [T, number][]): T {
  const total = poids.reduce((s, [, w]) => s + w, 0);
  let u = r() * total;
  for (const [v, w] of poids) { u -= w; if (u <= 0) return v; }
  return poids[poids.length - 1]![0];
}
export const borne = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lisse = (a: number, b: number, v: number) => { const t = borne((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
