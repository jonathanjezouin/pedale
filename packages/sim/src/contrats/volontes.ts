import type { Raison } from './commun.ts';

/** Les trois niveaux de Vouloir, du plus lent au plus rapide (voir architecture.md §4). */
export type NiveauVouloir = 'objectif' | 'intention' | 'manoeuvre';

/** Grandeurs qu'un niveau supérieur peut borner pour le niveau inférieur. */
export type GrandeurCadree =
  | 'puissanceVisee_w'
  | 'positionLateraleVisee_m'
  | 'ecartRoueProche_m'
  | 'abriMinimal_ratio';

/** Une borne simple : min et/ou max (null = pas de borne de ce côté). */
export interface Borne {
  readonly grandeur: GrandeurCadree;
  readonly min: number | null;
  readonly max: number | null;
}

/** Cadre descendant : ce que le niveau inférieur n'a pas le droit de dépasser. */
export type Cadre = readonly Borne[];

/** Une valeur voulue pour une grandeur (l'unité est celle de la grandeur : « puissanceVisee_w » = watts). */
export interface Visee {
  readonly grandeur: GrandeurCadree;
  readonly valeur: number;
}

/** Volonté d'un niveau. */
export interface Volonte {
  readonly niveau: NiveauVouloir;
  /** Ce qui est voulu, en un nom stable (ex. « rester_dans_le_groupe »). */
  readonly but: string;
  readonly raisons: readonly Raison[];
  /** Valeurs chiffrées voulues (utile surtout à la Manœuvre, que Agir traduit en Commandes). */
  readonly visees: readonly Visee[];
  /** Cadre donné au niveau d'en dessous (vide pour la Manœuvre : elle va vers Agir). */
  readonly cadre: Cadre;
  /** Instant de réévaluation prévu (null = seulement sur déclencheur). */
  readonly echeance_s: number | null;
  /** Événements qui forcent une réévaluation avant l'échéance (ex. « fin_de_relais »). */
  readonly declencheurs: readonly string[];
  /** Renseigné quand ce niveau ne peut plus tenir son cadre : le niveau au-dessus réévalue. */
  readonly impossibilite: Raison | null;
}

/** Sortie de VOULOIR : la pile des trois niveaux. */
export interface Volontes {
  readonly etage: 'volontes';
  readonly instant_s: number;
  readonly objectif: Volonte;
  readonly intention: Volonte;
  readonly manoeuvre: Volonte;
}
