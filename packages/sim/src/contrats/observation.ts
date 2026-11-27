import type { Scene } from './commun.ts';

/**
 * Monde -> coureur. Ce que le monde EXPOSE au coureur (rien de plus). Construite par `monde/`,
 * qui décide de ce qui est visible : c'est le seul endroit où l'on triche, ou non, avec la vérité.
 */
export interface Observation extends Scene {
  readonly etage: 'observation';
}
