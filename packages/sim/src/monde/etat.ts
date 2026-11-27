import type { CoureurId, PositionRoute } from '../contrats/index.ts';

export interface Piste {
  readonly longueur_m: number;
  readonly demiLargeur_m: number;
}

/** Vérité sur un coureur. Les champs « cachés » ne sont jamais exposés par l'Observation. */
export interface CoureurReel {
  readonly id: CoureurId;
  readonly position: PositionRoute;
  readonly vitesse_m_s: number;
  readonly puissanceDelivree_w: number;
  readonly energieLongue_j: number;
  readonly energieLongueMax_j: number;
  readonly energieCourte_j: number;
  readonly energieCourteMax_j: number;
  // — cachés —
  readonly masse_kg: number;
  readonly puissanceMax_w: number;
}

/** Vérité du monde à un instant. */
export interface EtatMonde {
  readonly instant_s: number;
  readonly piste: Piste;
  readonly coureurs: readonly CoureurReel[];
}
