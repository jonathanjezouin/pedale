import type { CoureurId, EchantillonRoute } from './commun.ts';

/** Ce que le coureur pense de lui-même. */
export interface CroyancesSoi {
  readonly vitesse_m_s: number;
  readonly reserveLongueEstimee_ratio: number;
  readonly reserveCourteEstimee_ratio: number;
  /** Puissance qu'il croit pouvoir tenir longtemps. */
  readonly puissanceSoutenable_w: number;
  /** Part de l'effort aérodynamique évitée grâce à l'abri : 0 = plein vent, 1 = totalement abrité. */
  readonly abriEstime_ratio: number;
}

/** Estimation du reste à parcourir (chantier 4). */
export interface CroyancesReste {
  readonly distance_m: number;
  readonly tempsEstime_s: number;
}

/** Ce que le coureur pense d'un autre coureur. */
export interface CroyanceAutre {
  readonly id: CoureurId;
  readonly ecartDevant_m: number;
  readonly ecartLateral_m: number;
  readonly vitesse_m_s: number;
  /** Fatigue qu'il lui prête (déduite de signes visibles, jamais lue directement). */
  readonly fatigueEstimee_ratio: number;
}

/** Sortie d'INTERPRÉTER : ce que le coureur en conclut. */
export interface Croyances {
  readonly etage: 'croyances';
  readonly instant_s: number;
  readonly soi: CroyancesSoi;
  readonly resteAParcourir: CroyancesReste;
  readonly routeDevant: readonly EchantillonRoute[];
  readonly autres: readonly CroyanceAutre[];
}
