/* =====================================================================
   Types du module de parcours (docs/v0.0.3-parcours.md, docs/v0.0.4-parcours.md).
   Toutes les distances sont en mètres, les altitudes en mètres, les pentes en %.
   ===================================================================== */

export type TypeEtape = 'plate' | 'vallonnee' | 'montagne';
export const TYPES: readonly TypeEtape[] = ['plate', 'vallonnee', 'montagne'];
export const LIBELLE_TYPE: Record<TypeEtape, string> = { plate: 'Plate', vallonnee: 'Vallonnée', montagne: 'Montagne' };

/** Comment l'étape se termine : à plat, après une bosse, après une descente, ou au sommet. */
export type Finale = 'plat' | 'bosse' | 'descente' | 'sommet';
export const LIBELLE_FINALE: Record<Finale, string> = {
  plat: 'arrivée à plat', bosse: 'arrivée après une bosse', descente: 'arrivée après une descente', sommet: 'arrivée au sommet',
};

/** Distance minimale et maximale d'une étape (docs/v0.0.3-parcours.md §8). */
export const DISTANCE_MIN = 20_000;
export const DISTANCE_MAX = 250_000;
/** Écart entre deux échantillons du profil et du tracé. */
export const PAS = 20;

/** Un élément structurant du profil : une montée (col ou bosse) et la descente qui la suit. */
export interface Element {
  sorte: 'col' | 'bosse';
  debut: number;          // m : pied de la montée
  sommet: number;         // m
  fin: number;            // m : fin de la descente (= sommet pour une arrivée au sommet)
  denivele: number;       // m gagnés dans la montée
  pente: number;          // % moyen
}

/** Ce que l'évaluateur lit : un profil échantillonné. Un `Parcours` en est un. */
export interface ProfilAlt { pas: number; alt: ArrayLike<number> }

export interface Parcours extends ProfilAlt {
  seed: number;
  distance: number;
  type: TypeEtape;
  finale: Finale;
  n: number;                 // nombre d'échantillons (distance / pas + 1)
  alt: Float64Array;         // altitude (m)
  x: Float64Array;           // tracé en plan (m)
  y: Float64Array;
  cap: Float64Array;         // cap de la route (rad)
  elements: Element[];       // ce que le générateur a placé (transparence, pas la lecture de l'évaluateur)
  denivele: number;          // D+ total (m), au sens de `denivelePositif`
  rayonMin: number;          // m : le virage le plus serré
  essais: number;            // tirages nécessaires pour que l'étape se lise comme demandée (1 = premier tirage)
  conforme: boolean;         // l'étape respecte les fourchettes de son type et le tracé ne se recoupe pas
  sansRecoupement: boolean;  // le tracé ne se recoupe pas
}

export type Categorie = 'HC' | '1' | '2' | '3' | '4' | 'bosse';
export const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  HC: 'hors catégorie', '1': '1re catégorie', '2': '2e catégorie', '3': '3e catégorie', '4': '4e catégorie', bosse: 'bosse non classée',
};

export interface Montee {
  debut: number; fin: number;        // m depuis le départ de l'étape
  longueur: number; denivele: number; pente: number; penteMax500: number;
  score: number;                     // D+ × pente (m·%)
  categorie: Categorie;
  distanceArrivee: number;           // m entre le sommet et l'arrivée
  arriveeAuSommet: boolean;
  apres: { longueur: number; nature: 'descente' | 'plat' | 'arrivee' };   // ce qui suit le sommet jusqu'à la montée suivante (ou l'arrivée)
  poids: number;                     // 0..1 : importance pour la finale
}

export interface Evaluation {
  de: number; a: number; arrivee: number;
  distance: number;
  denivele: number;                  // D+ (m)
  densite: number;                   // m/km
  denivelePondere: number;           // D+ pondéré par la raideur (usure)
  duree: number;                     // s, estimée à puissance constante (300 W)
  montees: Montee[];
  finale: { sprint: number; puncheur: number; grimpeur: number; arriveeEnCote: boolean };
  typeLu: TypeEtape;                 // comment l'étape « se lit »
  phrase: string;
}
