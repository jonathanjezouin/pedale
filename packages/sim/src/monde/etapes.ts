/** Types d'étape et valeurs retenues pour la génération du tracé (UF 2.2, voir docs/chantiers.md). */
export type TypeEtape = 'plaine' | 'vallonne' | 'montagne';
export const TYPES_ETAPE: readonly TypeEtape[] = ['plaine', 'vallonne', 'montagne'];

export const LARGEUR_ROUTE_M = 7;
/** Séparation minimale en plan entre deux points éloignés de plus de RECROISEMENT_S_M en abscisse. */
export const ECART_MIN_M = 3 * LARGEUR_ROUTE_M;
export const RECROISEMENT_S_M = 100;
/** Au-delà de ce rayon, un tronçon est une ligne droite. */
export const RAYON_DROITE_M = 5000;

export type Fourchette = readonly [min: number, max: number];

export interface ParametresEtape {
  readonly rayonMin_m: number;
  readonly rayonMax_m: number;
  readonly rayonMinLacet_m: number | null;
  readonly droiteLongueMin_m: number;
  /** Nombre minimal de droites longues pour 50 km (proportionnel, au moins 1). */
  readonly droitesLonguesPar50km: number;
  readonly droiteMax_m: number;
  readonly partDroite: Fourchette;
  readonly virages_par_km: Fourchette;
  readonly angleMoyen_deg: Fourchette;
  // — réglages internes du tirage (jamais plus larges que les bornes ci-dessus) —
  readonly partCible: Fourchette;
  readonly angleTirage_deg: Fourchette;
}

export const PARAMETRES_ETAPE: Readonly<Record<TypeEtape, ParametresEtape>> = {
  plaine: {
    rayonMin_m: 150, rayonMax_m: 2500, rayonMinLacet_m: null,
    droiteLongueMin_m: 1000, droitesLonguesPar50km: 3, droiteMax_m: 5000,
    partDroite: [0.3, 0.6], virages_par_km: [0.5, 2], angleMoyen_deg: [15, 40],
    partCible: [0.38, 0.52], angleTirage_deg: [12, 46],
  },
  vallonne: {
    rayonMin_m: 80, rayonMax_m: 1200, rayonMinLacet_m: null,
    droiteLongueMin_m: 500, droitesLonguesPar50km: 0, droiteMax_m: 2000,
    partDroite: [0.15, 0.4], virages_par_km: [1.5, 4], angleMoyen_deg: [25, 60],
    partCible: [0.22, 0.33], angleTirage_deg: [20, 64],
  },
  montagne: {
    rayonMin_m: 40, rayonMax_m: 400, rayonMinLacet_m: 20,
    droiteLongueMin_m: 200, droitesLonguesPar50km: 0, droiteMax_m: 1000,
    partDroite: [0.05, 0.25], virages_par_km: [3, 6], angleMoyen_deg: [40, 90],
    partCible: [0.12, 0.2], angleTirage_deg: [28, 98],
  },
};

/** Nombre minimal de droites ≥ droiteLongueMin_m pour une étape de cette longueur. */
export function droitesLonguesRequises(p: ParametresEtape, longueur_m: number): number {
  return Math.max(1, Math.floor((p.droitesLonguesPar50km * longueur_m) / 50_000));
}
