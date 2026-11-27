import type { Percevoir } from '../../contrats/index.ts';

/** Étage 1. Pour l'instant Perçu = Observation : pas encore de bruit de perception. */
export const percevoir: Percevoir = (observation, _memoire) => ({
  sortie: { ...observation, etage: 'percu' },
  memoire: { dernierInstant_s: observation.instant_s },
  resume: 'Je perçois ce que le monde m’expose, sans déformation.',
  raisons: [{ code: 'pas_de_bruit', explication: 'La perception est exacte à ce stade.' }],
});
