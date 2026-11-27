import type { EtatMonde } from './etat.ts';
import { COUREUR_TEMOIN, PISTE_TEMOIN } from './parametres.ts';

/** Monde de départ : une piste droite, un coureur témoin à l'arrêt. */
export function creerMondeTemoin(): EtatMonde {
  return {
    instant_s: 0,
    piste: { ...PISTE_TEMOIN },
    coureurs: [
      {
        id: 'temoin',
        position: { s_m: 0, d_m: 0, capRelatif_rad: 0 },
        vitesse_m_s: 0,
        puissanceDelivree_w: 0,
        energieLongue_j: COUREUR_TEMOIN.energieLongue_j,
        energieLongueMax_j: COUREUR_TEMOIN.energieLongue_j,
        energieCourte_j: COUREUR_TEMOIN.energieCourte_j,
        energieCourteMax_j: COUREUR_TEMOIN.energieCourte_j,
        masse_kg: COUREUR_TEMOIN.masseAvecVelo_kg,
        puissanceMax_w: COUREUR_TEMOIN.puissanceMax_w,
      },
    ],
  };
}
