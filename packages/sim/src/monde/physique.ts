import type { CoureurReel, EtatMonde } from './etat.ts';
import type { Commandes, CoureurId } from '../contrats/index.ts';
import { PHYSIQUE } from './parametres.ts';

const borner = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

function avancerCoureur(c: CoureurReel, cmd: Commandes | undefined, demiLargeur_m: number, dt_s: number): CoureurReel {
  // La physique applique les commandes AVEC ses limites : puissance bornée par le corps réel.
  const puissance_w = borner(cmd?.puissanceVisee_w ?? 0, 0, c.puissanceMax_w);
  const frein = borner(cmd?.freinage_ratio ?? 0, 0, 1);
  const v = c.vitesse_m_s;

  const force_N = puissance_w / Math.max(v, PHYSIQUE.vitesseMiniPourForce_m_s);
  const trainee_N = 0.5 * PHYSIQUE.densiteAir_kg_m3 * PHYSIQUE.surfaceAeroEfficace_m2 * v * v;
  const roulement_N = PHYSIQUE.resistanceRoulement_ratio * c.masse_kg * PHYSIQUE.gravite_m_s2;
  const freinage_N = frein * c.masse_kg * PHYSIQUE.gravite_m_s2 * 0.5;
  const acceleration_m_s2 = (force_N - trainee_N - roulement_N - freinage_N) / c.masse_kg;

  const vitesse_m_s = Math.max(0, v + acceleration_m_s2 * dt_s);

  const cibleD_m = borner(cmd?.positionLateraleVisee_m ?? c.position.d_m, -demiLargeur_m, demiLargeur_m);
  const deplacementMax_m = PHYSIQUE.vitesseLateraleMax_m_s * dt_s;
  const d_m = c.position.d_m + borner(cibleD_m - c.position.d_m, -deplacementMax_m, deplacementMax_m);

  return {
    ...c,
    position: { ...c.position, s_m: c.position.s_m + vitesse_m_s * dt_s, d_m },
    vitesse_m_s,
    puissanceDelivree_w: puissance_w,
    energieLongue_j: Math.max(0, c.energieLongue_j - puissance_w * dt_s),
  };
}

/** Applique les commandes de tous les coureurs et fait avancer le monde d'un pas. Ne modifie pas son entrée. */
export function appliquerPhysique(
  monde: EtatMonde,
  commandes: ReadonlyMap<CoureurId, Commandes>,
  dt_s: number,
): EtatMonde {
  return {
    ...monde,
    instant_s: monde.instant_s + dt_s,
    coureurs: monde.coureurs.map((c) => avancerCoureur(c, commandes.get(c.id), monde.piste.demiLargeur_m, dt_s)),
  };
}
