import type {
  CoureurId, CoureurVisible, EchantillonRoute, Observation,
} from '../contrats/index.ts';
import type { CoureurReel, EtatMonde } from './etat.ts';
import { OBSERVATION } from './parametres.ts';

function trouver(monde: EtatMonde, id: CoureurId): CoureurReel {
  const c = monde.coureurs.find((x) => x.id === id);
  if (!c) throw new Error(`Coureur inconnu : ${id}`);
  return c;
}

/**
 * Construit ce que le monde EXPOSE au coureur `id`. Seul point de lecture de la vérité par un coureur :
 * tout ce qui n'est pas copié ici (masse, puissance maximale réelle…) lui reste invisible.
 */
export function observer(monde: EtatMonde, id: CoureurId): Observation {
  const moi = trouver(monde, id);
  const distanceArrivee_m = Math.max(0, monde.piste.longueur_m - moi.position.s_m);

  const routeDevant: EchantillonRoute[] = OBSERVATION.distancesRoute_m
    .filter((devant_m) => devant_m <= distanceArrivee_m)
    .map((devant_m) => ({
      devant_m,
      pente_ratio: 0,
      courbure_rad_m: 0,
      demiLargeurGauche_m: monde.piste.demiLargeur_m,
      demiLargeurDroite_m: monde.piste.demiLargeur_m,
    }));

  const coureursVisibles: CoureurVisible[] = monde.coureurs
    .filter((c) => c.id !== id && Math.abs(c.position.s_m - moi.position.s_m) <= OBSERVATION.visibilite_m)
    .map((c) => ({
      id: c.id,
      ecartDevant_m: c.position.s_m - moi.position.s_m,
      ecartLateral_m: c.position.d_m - moi.position.d_m,
      vitesse_m_s: c.vitesse_m_s,
    }));

  return {
    etage: 'observation',
    instant_s: monde.instant_s,
    corps: {
      vitesse_m_s: moi.vitesse_m_s,
      puissanceDelivree_w: moi.puissanceDelivree_w,
      reserveLongue_ratio: moi.energieLongue_j / moi.energieLongueMax_j,
      reserveCourte_ratio: moi.energieCourte_j / moi.energieCourteMax_j,
    },
    position: { ...moi.position },
    distanceArrivee_m,
    routeDevant,
    // Air immobile : le vent ressenti est celui de l'avancement, de face.
    vent: { vitesse_m_s: moi.vitesse_m_s, provenance_rad: 0 },
    coureursVisibles,
  };
}
