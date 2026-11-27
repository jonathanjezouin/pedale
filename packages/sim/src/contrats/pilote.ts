import type { Commandes } from './commandes.ts';
import type { Croyances } from './croyances.ts';
import type { Percu } from './percu.ts';
import type { Volontes } from './volontes.ts';

/**
 * Tout ce qu'une source externe (script de test, plus tard le joueur) reçoit pour décider :
 * le Perçu et les Croyances, comme l'IA. Il n'y a volontairement AUCUN champ pour le monde réel.
 */
export interface EntreePilote {
  readonly percu: Percu;
  readonly croyances: Croyances;
}

/** Ce qu'une source externe peut fournir : des Volontés (Agir les traduit) ou directement des Commandes. */
export type ReponsePilote = Volontes | Commandes;

/**
 * Point d'injection unique, placé après Interpréter. Il remplace Vouloir (et Agir si la réponse
 * est une Commande). Ne doit pas modifier ce qu'il reçoit.
 */
export type Pilote = (entree: EntreePilote) => ReponsePilote;
