/* =====================================================================
   Paliers d'effort : les 7 zones de puissance (Zwift), en part du FTP.
   docs/v0.0.3-comportement.md §4.1. Le palier est ce que le joueur lit ;
   le code manipule la part du FTP (continue). Frontière Z4 / Z5 = 100 % du FTP :
   au-dessus, on puise dans l'explosivité.
   ===================================================================== */

export interface Palier { zone: 1 | 2 | 3 | 4 | 5 | 6 | 7; code: string; nom: string; max: number }

/** `max` : borne haute de la zone, en part du FTP (Z7 : sans borne). */
export const PALIERS: readonly Palier[] = [
  { zone: 1, code: 'Z1', nom: 'récupération', max: 0.45 },
  { zone: 2, code: 'Z2', nom: 'endurance', max: 0.75 },
  { zone: 3, code: 'Z3', nom: 'tempo', max: 0.87 },
  { zone: 4, code: 'Z4', nom: 'seuil', max: 1.0 },
  { zone: 5, code: 'Z5', nom: 'VO2max', max: 1.2 },
  { zone: 6, code: 'Z6', nom: 'anaérobie', max: 1.5 },
  { zone: 7, code: 'Z7', nom: 'neuromusculaire', max: Infinity },
];

/** Palier correspondant à un effort (part du FTP). */
export function palierDe(effort: number): Palier {
  for (const p of PALIERS) if (effort <= p.max + 1e-9) return p;
  return PALIERS[6]!;
}

/** « Z4 seuil · 92 % du FTP » */
export const libellePalier = (effort: number) => { const p = palierDe(effort); return `${p.code} ${p.nom} · ${Math.round(effort * 100)} % du FTP`; };

/** Plancher d'effort : haut de Z3. Sans raison supplémentaire, un coureur roule à l'effort qu'il peut tenir longtemps sans se cramer ;
 *  en dessous (économiser, stratégie) ou au-dessus (user un rival, attaquer), il lui faut une raison. docs/v0.0.3-comportement.md §9. */
export const PLANCHER = 0.87;
