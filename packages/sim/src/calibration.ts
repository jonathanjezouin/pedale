/* =====================================================================
   Calibration des attributs sur le niveau WorldTour (docs/v0.0.3-attributs.md).
   La simulation travaille en unités physiques ; ce module dit « à quel niveau de
   peloton » correspond une valeur. Les ancrages sont fixés sur le réel (jamais sur
   le monde généré), pour que l'échelle ne bouge pas quand les coureurs progressent.
   Ordres de grandeur à valider : ils sont ici, en données, pour être ajustés sans toucher au code.
   ===================================================================== */

import type { Profile } from './types';

/** Masse du vélo (kg) : `Profile.mass` = coureur + vélo ; les W/kg se comptent sur le coureur seul. */
export const VELO_KG = 7;

/** Plage de puissance de pointe (W) sur laquelle `pointe` (0..1) est normalisée : celle des coureurs du POC. */
export const POINTE_REF = { min: 1100, max: 1750 } as const;
export const pointeNorm = (pPeak: number) => Math.max(0, Math.min(1, (pPeak - POINTE_REF.min) / (POINTE_REF.max - POINTE_REF.min)));

/** Les 5 niveaux, du plus bas au plus haut. Quatre seuils les séparent (résolution fine en haut). */
export const NIVEAUX = ['sous le WorldTour', 'équipier', 'leader', 'top 10 mondial', 'phénomène'] as const;
export type Niveau = 0 | 1 | 2 | 3 | 4;

export interface Ancrage {
  unite: string;
  /** Les 4 seuils entre niveaux, croissants en niveau (pour une échelle inversée, ils sont décroissants en valeur). */
  seuils: [number, number, number, number];
  /** true : plus la valeur est basse, meilleur est le niveau (traînée, temps de récupération). */
  inverse?: boolean;
}

export const ANCRAGES = {
  ftp:         { unite: 'W/kg', seuils: [5.0, 5.7, 6.2, 6.6] },
  explosivite: { unite: 'kJ',   seuils: [15, 20, 25, 30] },
  pointe:      { unite: 'W',    seuils: [1100, 1400, 1700, 2000] },
  durabilite:  { unite: '% du FTP conservé après 3000 kJ', seuils: [91, 94, 96, 98] },
} as const satisfies Record<string, Ancrage>;

export type Attribut = keyof typeof ANCRAGES;

/** Niveau (0..4) d'une valeur pour un attribut. */
export function niveauDe(attr: Attribut, valeur: number): Niveau {
  const a: Ancrage = ANCRAGES[attr];
  let p = 0;
  for (const s of a.seuils) if (a.inverse ? valeur <= s : valeur >= s) p++;
  return p as Niveau;
}

/* --------------------- conversions vers les valeurs lisibles --------------------- */

/** FTP en W/kg, rapporté au coureur seul (le modèle n'a qu'un seuil : le FTP). */
export const ftpWkg = (p: Pick<Profile, 'ftp' | 'mass'>) => p.ftp / (p.mass - VELO_KG);

/** Durabilité lisible : % du FTP conservé après 3000 kJ de travail, interpolé depuis `tEnd` (unité interne en secondes). */
const DURABILITE_PTS: [number, number][] = [[2000, 90], [2600, 94], [3200, 96.5], [3800, 98.5], [5000, 99.5]];
export function durabilitePct(tEnd: number): number {
  const pts = DURABILITE_PTS;
  if (tEnd <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i]!, [x0, y0] = pts[i - 1]!;
    if (tEnd <= x1) return y0 + ((y1 - y0) * (tEnd - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1]![1];
}

/** Valeurs lisibles et niveaux d'un profil (utilisé par l'interface et le rapport de cohérence). */
export function lecture(p: Profile) {
  const v = { ftp: ftpWkg(p), explosivite: p.wPrime / 1000, pointe: p.pPeak, durabilite: durabilitePct(p.tEnd) };
  const niveaux = Object.fromEntries((Object.keys(v) as Attribut[]).map((k) => [k, niveauDe(k, v[k])])) as Record<Attribut, Niveau>;
  return { valeurs: v, niveaux };
}

/* --------------------- aptitudes par terrain et type physique (docs/v0.0.5-pente.md §8) --------------------- */

/** Les quatre aptitudes d'un coureur (jamais stockées, toujours calculées depuis les attributs moteur et le gabarit). */
export interface Aptitudes { montagne: number; plat: number; punch: number; sprint: number }
export type TypePhysique = 'grimpeur' | 'rouleur' | 'puncheur' | 'sprinteur';
export const TYPES_PHYSIQUES: readonly TypePhysique[] = ['grimpeur', 'rouleur', 'puncheur', 'sprinteur'];

export function aptitudes(p: Pick<Profile, 'ftp' | 'cda' | 'mass' | 'wPrime' | 'pPeak'>): Aptitudes {
  const coureur = p.mass - VELO_KG;
  return {
    montagne: p.ftp / coureur,          // FTP en W/kg : la côte longue
    plat: p.ftp / p.cda,                 // FTP / CdA (W/m²) : contre le vent, à plat
    punch: p.wPrime / coureur,           // W′ / masse (J/kg) : la côte courte, la relance
    sprint: p.pPeak / coureur,           // pointe / masse (W/kg) : le final
  };
}

/** Moyenne et écart-type de chaque aptitude dans un peloton WorldTour de la composition d'étape (mesurés sur 2 000 coureurs générés par la composition d'étape). */
export const REF_APTITUDES: Record<keyof Aptitudes, { moy: number; sd: number }> = {
  montagne: { moy: 5.86, sd: 0.32 }, plat: { moy: 1194, sd: 65 }, punch: { moy: 341, sd: 43 }, sprint: { moy: 21.4, sd: 3.2 },
};
const CORRESPONDANCE: Record<keyof Aptitudes, TypePhysique> = { montagne: 'grimpeur', plat: 'rouleur', punch: 'puncheur', sprint: 'sprinteur' };

/** Écart de chaque aptitude à la moyenne du peloton, en écarts-types. */
export function aptitudesRelatives(p: Pick<Profile, 'ftp' | 'cda' | 'mass' | 'wPrime' | 'pPeak'>): Aptitudes {
  const a = aptitudes(p);
  const z = (k: keyof Aptitudes) => (a[k] - REF_APTITUDES[k].moy) / REF_APTITUDES[k].sd;
  return { montagne: z('montagne'), plat: z('plat'), punch: z('punch'), sprint: z('sprint') };
}

/** Type physique : l'aptitude où le coureur ressort le mieux *relativement au peloton*. */
export function typePhysique(p: Pick<Profile, 'ftp' | 'cda' | 'mass' | 'wPrime' | 'pPeak'>): TypePhysique {
  const z = aptitudesRelatives(p);
  let best: keyof Aptitudes = 'montagne';
  for (const k of Object.keys(z) as (keyof Aptitudes)[]) if (z[k] > z[best]) best = k;
  return CORRESPONDANCE[best];
}
