import type { Scene } from './commun.ts';

/**
 * Sortie de PERCEVOIR : l'Observation après bruit de perception (biais, retard, grossièreté).
 * Au début, Perçu = Observation. Le champ `etage` empêche de passer l'une pour l'autre.
 */
export interface Percu extends Scene {
  readonly etage: 'percu';
}
