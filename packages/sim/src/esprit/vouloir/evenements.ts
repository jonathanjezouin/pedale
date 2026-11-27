import type { Croyances } from '../../contrats/index.ts';
import { VOULOIR } from '../parametres.ts';

/** Événements présents dans les croyances. Un déclencheur se déclenche quand l'un d'eux APPARAÎT. */
export function detecterEvenements(c: Croyances): string[] {
  const evenements: string[] = [];
  if (c.soi.reserveLongueEstimee_ratio < VOULOIR.seuilReserveBasse_ratio) evenements.push('reserve_basse');
  if (c.resteAParcourir.distance_m < VOULOIR.seuilFinProche_m) evenements.push('fin_de_piste_proche');
  return evenements;
}
