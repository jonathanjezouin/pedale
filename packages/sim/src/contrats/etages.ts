import type { Alea } from './alea.ts';
import type { Raison } from './commun.ts';
import type { Observation } from './observation.ts';
import type { Percu } from './percu.ts';
import type { Croyances } from './croyances.ts';
import type { Volontes } from './volontes.ts';
import type { Commandes } from './commandes.ts';
import type {
  MemoireAgir,
  MemoireInterpreter,
  MemoirePercevoir,
  MemoireVouloir,
} from './memoires.ts';

/** Ce que rend un étage : sa sortie, sa mémoire mise à jour, et de quoi remplir la trace. */
export interface Resultat<Sortie, Memoire> {
  readonly sortie: Sortie;
  readonly memoire: Memoire;
  readonly resume: string;
  readonly raisons: readonly Raison[];
}

// Chaque étage est une fonction PURE : il ne reçoit que la sortie de l'étage précédent,
// sa propre mémoire (et un générateur seedé si le hasard le concerne). Il ne modifie rien.

export type Percevoir = (
  observation: Observation,
  memoire: MemoirePercevoir,
  alea: Alea,
) => Resultat<Percu, MemoirePercevoir>;

export type Interpreter = (
  percu: Percu,
  memoire: MemoireInterpreter,
) => Resultat<Croyances, MemoireInterpreter>;

export type Vouloir = (
  croyances: Croyances,
  memoire: MemoireVouloir,
) => Resultat<Volontes, MemoireVouloir>;

export type Agir = (
  volontes: Volontes,
  memoire: MemoireAgir,
) => Resultat<Commandes, MemoireAgir>;
