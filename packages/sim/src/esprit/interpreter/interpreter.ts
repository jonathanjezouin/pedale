import type { Interpreter } from '../../contrats/index.ts';
import { TEMOIN } from '../parametres.ts';

/** Étage 2. Le témoin en conclut sa vitesse, sa forme, ce qu'il peut tenir et ce qui reste à faire. */
export const interpreter: Interpreter = (percu, _memoire) => {
  const reserve = percu.corps.reserveLongue_ratio;
  return {
    sortie: {
      etage: 'croyances',
      instant_s: percu.instant_s,
      soi: {
        vitesse_m_s: percu.corps.vitesse_m_s,
        reserveLongueEstimee_ratio: reserve,
        reserveCourteEstimee_ratio: percu.corps.reserveCourte_ratio,
        puissanceSoutenable_w:
          TEMOIN.puissanceSoutenableBase_w *
          (1 - TEMOIN.partReserveSurSoutenable_ratio + TEMOIN.partReserveSurSoutenable_ratio * reserve),
        abriEstime_ratio: 0,
      },
      resteAParcourir: {
        distance_m: percu.distanceArrivee_m,
        tempsEstime_s: percu.distanceArrivee_m / Math.max(percu.corps.vitesse_m_s, 0.1),
      },
      routeDevant: percu.routeDevant,
      autres: percu.coureursVisibles.map((c) => ({
        id: c.id,
        ecartDevant_m: c.ecartDevant_m,
        ecartLateral_m: c.ecartLateral_m,
        vitesse_m_s: c.vitesse_m_s,
        fatigueEstimee_ratio: 0,
      })),
    },
    memoire: { dernierInstant_s: percu.instant_s },
    resume: 'Je me crois en forme et je compare ma vitesse à ce que je veux tenir.',
    raisons: [{ code: 'croyances_directes', explication: 'Mes croyances reprennent simplement ce que je perçois.' }],
  };
};
