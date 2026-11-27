import type { SegmentRoute } from './route.ts';
import {
  PARAMETRES_ETAPE, RAYON_DROITE_M, droitesLonguesRequises, type TypeEtape,
} from './etapes.ts';

export interface ZoneLacets {
  readonly debut_m: number;
  readonly fin_m: number;
}

export interface Droite { readonly debut_m: number; readonly longueur_m: number }
export interface Virage { readonly debut_m: number; readonly longueur_m: number; readonly angle_rad: number }

export interface AnalyseTrace {
  readonly longueur_m: number;
  readonly droites: readonly Droite[];
  readonly partDroite_ratio: number;
  readonly plusLongueDroite_m: number;
  /** Virages hors lacets. */
  readonly virages: readonly Virage[];
  readonly viragesParKm: number;
  readonly angleMoyen_rad: number;
  readonly rayonMinHorsLacet_m: number;
  /** Infinity s'il n'y a pas de lacet. */
  readonly rayonMinLacet_m: number;
  readonly longueurLacets_m: number;
}

const COURBURE_DROITE = 1 / RAYON_DROITE_M;

/** Mesure un tracé : droites, virages, rayons. Définitions de docs/chantiers.md, UF 2.2. */
export function analyserTrace(segments: readonly SegmentRoute[], lacets: readonly ZoneLacets[]): AnalyseTrace {
  const droites: Droite[] = [];
  const virages: Virage[] = [];
  let longueur = 0;
  let droite_m = 0;
  let rayonMin = Infinity;
  let rayonMinLacet = Infinity;
  let longueurLacets = 0;
  let droiteEnCours = null as { debut_m: number; longueur_m: number } | null;
  let virageEnCours = null as { debut_m: number; longueur_m: number; angle_rad: number; signe: number } | null;

  const fermerVirage = () => { if (virageEnCours) virages.push(virageEnCours); virageEnCours = null; };
  const fermerDroite = () => { if (droiteEnCours) droites.push(droiteEnCours); droiteEnCours = null; };

  for (const seg of segments) {
    const debut = longueur;
    const milieu = debut + seg.longueur_m / 2;
    const enLacet = lacets.some((z) => milieu >= z.debut_m && milieu <= z.fin_m);
    const k = Math.abs(seg.courbure_rad_m);
    const estDroite = k < COURBURE_DROITE;
    if (estDroite) {
      droite_m += seg.longueur_m;
      fermerVirage();
      if (droiteEnCours) droiteEnCours = { ...droiteEnCours, longueur_m: droiteEnCours.longueur_m + seg.longueur_m };
      else droiteEnCours = { debut_m: debut, longueur_m: seg.longueur_m };
    } else {
      fermerDroite();
      const rayon = 1 / k;
      if (enLacet) {
        rayonMinLacet = Math.min(rayonMinLacet, rayon);
        longueurLacets += seg.longueur_m;
        fermerVirage();
      } else {
        rayonMin = Math.min(rayonMin, rayon);
        const signe = Math.sign(seg.courbure_rad_m);
        const angle = k * seg.longueur_m;
        if (virageEnCours && virageEnCours.signe === signe) {
          virageEnCours = { ...virageEnCours, longueur_m: virageEnCours.longueur_m + seg.longueur_m, angle_rad: virageEnCours.angle_rad + angle };
        } else {
          fermerVirage();
          virageEnCours = { debut_m: debut, longueur_m: seg.longueur_m, angle_rad: angle, signe };
        }
      }
    }
    if (estDroite && enLacet) longueurLacets += seg.longueur_m;
    longueur += seg.longueur_m;
  }
  fermerVirage();
  fermerDroite();

  const horsLacets_km = Math.max(longueur - longueurLacets, 1) / 1000;
  return {
    longueur_m: longueur,
    droites,
    partDroite_ratio: droite_m / longueur,
    plusLongueDroite_m: droites.reduce((m, d) => Math.max(m, d.longueur_m), 0),
    virages,
    viragesParKm: virages.length / horsLacets_km,
    angleMoyen_rad: virages.length ? virages.reduce((t, v) => t + v.angle_rad, 0) / virages.length : 0,
    rayonMinHorsLacet_m: rayonMin,
    rayonMinLacet_m: rayonMinLacet,
    longueurLacets_m: longueurLacets,
  };
}

/** Liste les critères du tableau de l'UF 2.2 que cette analyse ne respecte pas (vide = conforme). */
export function ecartsAuxBornes(a: AnalyseTrace, type: TypeEtape, longueurDemandee_m: number): string[] {
  const p = PARAMETRES_ETAPE[type];
  const e: string[] = [];
  if (Math.abs(a.longueur_m - longueurDemandee_m) > 0.01 * longueurDemandee_m) e.push('longueur');
  if (a.rayonMinHorsLacet_m < p.rayonMin_m - 1e-6) e.push('rayon hors lacet');
  if (a.rayonMinLacet_m < (p.rayonMinLacet_m ?? Infinity) - 1e-6 && a.longueurLacets_m > 0) e.push('rayon de lacet');
  if (p.rayonMinLacet_m === null && a.longueurLacets_m > 0) e.push('lacets interdits');
  const longues = a.droites.filter((d) => d.longueur_m >= p.droiteLongueMin_m).length;
  if (longues < droitesLonguesRequises(p, longueurDemandee_m)) e.push('droites longues');
  if (a.partDroite_ratio < p.partDroite[0] || a.partDroite_ratio > p.partDroite[1]) e.push('part de droite');
  if (a.plusLongueDroite_m > p.droiteMax_m) e.push('plus longue droite');
  if (a.viragesParKm < p.virages_par_km[0] || a.viragesParKm > p.virages_par_km[1]) e.push('virages par km');
  const deg = (a.angleMoyen_rad * 180) / Math.PI;
  if (deg < p.angleMoyen_deg[0] || deg > p.angleMoyen_deg[1]) e.push('angle moyen');
  return e;
}
