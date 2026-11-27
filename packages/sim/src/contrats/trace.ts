import type { CoureurId, NomEtage, Raison } from './commun.ts';
import type { Observation } from './observation.ts';
import type { Percu } from './percu.ts';
import type { Croyances } from './croyances.ts';
import type { Volontes } from './volontes.ts';
import type { Commandes } from './commandes.ts';

/** Toute donnée qui circule entre deux étages. */
export type DonneeEtage = Observation | Percu | Croyances | Volontes | Commandes;

/** Ce qu'un étage a reçu, produit, et pourquoi. */
export interface EntreeTrace {
  readonly etage: NomEtage;
  readonly recu: DonneeEtage;
  readonly produit: DonneeEtage;
  /** Phrase lisible résumant ce que l'étage a fait. */
  readonly resume: string;
  readonly raisons: readonly Raison[];
}

/** Une grandeur perçue et sa valeur réelle côte à côte (« je me crois frais, réel : 70 % »). */
export interface EcartPercuReel {
  readonly grandeur: string;
  readonly unite: string;
  readonly percu: number;
  readonly reel: number;
}

/** Trace d'une décision complète d'un coureur à un instant. */
export interface TraceDecision {
  readonly coureurId: CoureurId;
  readonly instant_s: number;
  readonly percevoir: EntreeTrace;
  readonly interpreter: EntreeTrace;
  readonly vouloir: EntreeTrace;
  readonly agir: EntreeTrace;
  /** Rempli par le moteur, seul à connaître à la fois le perçu et le réel. */
  readonly ecartsPercuReel: readonly EcartPercuReel[];
}
