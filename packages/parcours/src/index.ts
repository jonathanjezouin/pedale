/* =====================================================================
   Module de parcours : génération (profil + tracé) et évaluation d'une étape.
   Pur TypeScript, indépendant de la simulation ; la `Road` consommera son résultat.
   ===================================================================== */
import type { Evaluation, Finale, Parcours, TypeEtape } from './types';
import { DISTANCE_MAX, DISTANCE_MIN, PAS } from './types';
import { mulberry32, borne } from './rng';
import { FOURCHETTES, genererProfil, tirerFinale } from './profil';
import { genererTrace } from './trace';
import { denivelePositif, evaluer } from './evaluer';

export * from './types';
export { evaluer, denivelePositif, LECTURE } from './evaluer';
export { FOURCHETTES, FINALES, genererProfil, tirerFinale } from './profil';
export { genererTrace, seRecoupe, DISTANCE_RECOUPEMENT, RAYON_MIN_LACET } from './trace';
export { mulberry32 } from './rng';

/** Nombre maximal de tirages avant de garder le meilleur (docs/v0.0.3-parcours.md §4.6). */
export const ESSAIS_MAX = 10;

export interface OptionsParcours { seed: number; distance: number; type: TypeEtape; finale?: Finale }

const graine = (seed: number, essai: number) => ((seed | 0) ^ Math.imul(essai + 1, 0x9e3779b1)) >>> 0;

/** Pente maximale du profil, mesurée sur 100 m (la pente d'une route, pas d'un échantillon). */
export function penteMax(alt: ArrayLike<number>, pas = PAS, fenetre = 100): { montee: number; descente: number } {
  const k = Math.max(1, Math.round(fenetre / pas));
  let mont = 0, desc = 0;
  for (let i = 0; i + k < alt.length; i++) { const p = ((alt[i + k]! - alt[i]!) / (k * pas)) * 100; if (p > mont) mont = p; if (p < desc) desc = p; }
  return { montee: mont, descente: -desc };
}

/** Montagne : y a-t-il un col décisif (2e catégorie ou mieux) dans les 40 derniers km, ou le dernier tiers d'une étape courte ? */
export function aUnColDecisif(ev: Evaluation, distance: number): boolean {
  return ev.montees.some((m) => m.score >= 2200 && (m.arriveeAuSommet || m.distanceArrivee <= Math.min(40_000, distance / 3) + 1500));
}

/**
 * Violations des fourchettes de l'étape (liste vide : l'étape est conforme).
 * Les fourchettes sont celles de `FOURCHETTES` ; une marge de 10 % est tolérée sur la densité de D+.
 */
export function violations(p: Parcours, ev: Evaluation = evaluer(p)): string[] {
  const F = FOURCHETTES[p.type], v: string[] = [];
  const dens = p.denivele / (p.distance / 1000);
  if (dens < F.dens[0] * 0.9 || dens > F.dens[1] * 1.1) v.push(`densité de D+ ${dens.toFixed(1)} m/km hors de [${F.dens[0]}, ${F.dens[1]}]`);
  const pm = penteMax(p.alt, p.pas);
  if (pm.montee > F.penteMax + 0.6) v.push(`pente de ${pm.montee.toFixed(1)} % au-dessus de ${F.penteMax} %`);
  if (pm.descente > F.penteMax + 0.6) v.push(`descente de ${pm.descente.toFixed(1)} % au-dessus de ${F.penteMax} %`);
  if (ev.typeLu !== p.type) v.push(`se lit comme « ${ev.typeLu} » au lieu de « ${p.type} »`);
  if (p.type === 'montagne' && !aUnColDecisif(ev, p.distance)) v.push('pas de col décisif dans les 40 derniers km');
  if (!p.sansRecoupement) v.push('le tracé se recoupe');
  return v;
}

/**
 * Génère une étape : un profil altimétrique et un tracé en plan, déterministes pour (seed, distance, type).
 * Si l'étape ne se lit pas comme demandé (ou sort des fourchettes), on retire, dans la limite de `ESSAIS_MAX`.
 */
export function genererParcours(opt: OptionsParcours): Parcours {
  const distance = Math.round(borne(opt.distance, DISTANCE_MIN, DISTANCE_MAX) / PAS) * PAS;
  let meilleur: Parcours | null = null, meilleurNb = Infinity;
  for (let essai = 1; essai <= ESSAIS_MAX; essai++) {
    const r = mulberry32(graine(opt.seed, essai));
    const finale = opt.finale ?? tirerFinale(r, opt.type);
    const prof = genererProfil(r, distance, opt.type, finale);
    const trace = genererTrace(r, opt.type, prof.alt);
    const p: Parcours = {
      seed: opt.seed, distance, type: opt.type, finale, pas: PAS, n: prof.alt.length, alt: prof.alt, x: trace.x, y: trace.y, cap: trace.cap,
      elements: prof.elements, denivele: denivelePositif(prof.alt), rayonMin: trace.rayonMin, essais: essai, conforme: false, sansRecoupement: trace.sansRecoupement,
    };
    const v = violations(p);
    if (v.length === 0) { p.conforme = true; return p; }
    if (v.length < meilleurNb) { meilleurNb = v.length; meilleur = p; }
  }
  meilleur!.essais = ESSAIS_MAX;
  return meilleur!;
}

/** Évalue un parcours généré (raccourci : `evaluer(parcours)`). */
export const evaluerParcours = (p: Parcours, de = 0, a = p.distance, arrivee = a) => evaluer(p, de, a, arrivee);
