import { agir, interpreter, percevoir, vouloir } from '../esprit/index.ts';
import { appliquerPhysique, creerMondeTemoin, observer, PHYSIQUE } from '../monde/index.ts';
import { creerAlea } from './alea.ts';
import { memoireInitiale, type Dependances, type Partie } from './pas.ts';

/** Les vrais morceaux, branchés ensemble. */
export const DEPENDANCES_TEMOIN: Dependances = {
  observer, percevoir, interpreter, vouloir, agir, physique: appliquerPhysique,
};

/** Partie de départ du coureur témoin sur une piste droite. */
export function creerPartieTemoin(graine: number): Partie {
  const monde = creerMondeTemoin();
  return {
    monde,
    memoires: Object.fromEntries(monde.coureurs.map((c) => [c.id, memoireInitiale()])),
    alea: creerAlea(graine),
    pas_s: PHYSIQUE.pasDeTemps_s,
  };
}
