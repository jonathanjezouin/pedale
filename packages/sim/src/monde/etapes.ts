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

// — Profil d'étape (UF 2.3) —

/** Variation de pente maximale : 1 point de pente (0,01) par 100 m, soit 1·10⁻⁴ par mètre. */
export const VARIATION_PENTE_MAX_PAR_M = 1e-4;
/** Longueur de rampe nécessaire pour varier la pente de 1 (= 100 %) au maximum permis. */
export const RAMPE_M_PAR_UNITE_PENTE = 1 / VARIATION_PENTE_MAX_PAR_M;
export const TRONCON_MIN_M = 300;

export type TypeTroncon = 'plat' | 'bosse' | 'col' | 'descente';

export interface ParametresProfil {
  readonly penteMaxMontee_ratio: number;
  readonly penteMaxDescente_ratio: number;
  readonly deniveleParKm_m: Fourchette;
  readonly altitudeDepart_m: Fourchette;
  readonly altitudeMax_m: number;
  readonly colsAutorises: boolean;
  // — réglages internes du tirage —
  readonly platLongueur_m: Fourchette;
  readonly bossePente_ratio: Fourchette;
  readonly bosseHauteur_m: Fourchette;
  readonly colPente_ratio: Fourchette;
  readonly colHauteur_m: Fourchette;
  readonly descentePente_ratio: Fourchette;
}

export const PARAMETRES_PROFIL: Readonly<Record<TypeEtape, ParametresProfil>> = {
  plaine: {
    penteMaxMontee_ratio: 0.03, penteMaxDescente_ratio: 0.04,
    deniveleParKm_m: [2, 9], altitudeDepart_m: [50, 200], altitudeMax_m: 400, colsAutorises: false,
    platLongueur_m: [1500, 9000], bossePente_ratio: [0.01, 0.028], bosseHauteur_m: [10, 60],
    colPente_ratio: [0, 0], colHauteur_m: [0, 0], descentePente_ratio: [0.01, 0.035],
  },
  vallonne: {
    penteMaxMontee_ratio: 0.09, penteMaxDescente_ratio: 0.1,
    deniveleParKm_m: [10, 22], altitudeDepart_m: [200, 600], altitudeMax_m: 1200, colsAutorises: false,
    platLongueur_m: [800, 5000], bossePente_ratio: [0.03, 0.085], bosseHauteur_m: [30, 250],
    colPente_ratio: [0, 0], colHauteur_m: [0, 0], descentePente_ratio: [0.03, 0.09],
  },
  montagne: {
    penteMaxMontee_ratio: 0.12, penteMaxDescente_ratio: 0.14,
    deniveleParKm_m: [22, 45], altitudeDepart_m: [500, 1500], altitudeMax_m: 2800, colsAutorises: true,
    platLongueur_m: [500, 3500], bossePente_ratio: [0.03, 0.08], bosseHauteur_m: [30, 200],
    colPente_ratio: [0.05, 0.09], colHauteur_m: [300, 1400], descentePente_ratio: [0.04, 0.1],
  },
};

// — Tracé conditionné par la pente (UF 2.2b) —

/** Seuils de classe de pente, en valeur absolue : faible < 3 %, moyenne de 3 à 7 %, forte > 7 %. */
export const PENTE_FAIBLE_MAX_RATIO = 0.03;
export const PENTE_FORTE_MIN_RATIO = 0.07;
export type ClassePente = 'faible' | 'moyenne' | 'forte';
export const CLASSES_PENTE: readonly ClassePente[] = ['faible', 'moyenne', 'forte'];

export function classePente(pente_ratio: number): ClassePente {
  const p = Math.abs(pente_ratio);
  return p < PENTE_FAIBLE_MAX_RATIO ? 'faible' : p <= PENTE_FORTE_MIN_RATIO ? 'moyenne' : 'forte';
}

/** Pondérations par classe de pente : jamais des interdits, seulement des probabilités. */
export interface ReglagePente {
  /** Facteur sur l'angle d'un virage. */
  readonly angle: number;
  /** Exposant sur le tirage du rayon (w = u^γ : γ < 1 favorise les grands rayons, γ > 1 les petits). */
  readonly rayonGamma: number;
  /** Facteur sur la longueur des lignes droites. */
  readonly droite: number;
}
export const REGLAGE_PENTE: Readonly<Record<ClassePente, ReglagePente>> = {
  faible: { angle: 0.75, rayonGamma: 0.7, droite: 1.4 },
  moyenne: { angle: 1.0, rayonGamma: 1.0, droite: 1.0 },
  forte: { angle: 1.35, rayonGamma: 1.5, droite: 0.6 },
};
/** Probabilité qu'un bloc démarrant sur pente forte soit une série de lacets (montagne). */
export const PROBA_LACETS_PENTE_FORTE = 1 / 3;
/** Part minimale de la longueur des lacets qui doit être sur pente forte. */
export const PART_LACETS_PENTE_FORTE_MIN = 0.9;

// — Largeur de route (UF 2.4) —

export const ACCOTEMENT_M = 1.5;
/** Variation maximale de la largeur de chaussée : 0,02 m par mètre. */
export const VARIATION_LARGEUR_MAX_M_PAR_M = 0.02;

export interface ParametresLargeur {
  readonly chaussee_m: Fourchette;
  /** Largeur imposée sur les zones de lacets (montagne). */
  readonly lacets_m: Fourchette | null;
  readonly tronconLongueur_m: Fourchette;
}

export const PARAMETRES_LARGEUR: Readonly<Record<TypeEtape, ParametresLargeur>> = {
  plaine: { chaussee_m: [6, 7], lacets_m: null, tronconLongueur_m: [800, 4000] },
  vallonne: { chaussee_m: [5.5, 7], lacets_m: null, tronconLongueur_m: [800, 4000] },
  montagne: { chaussee_m: [4.5, 6.5], lacets_m: [4.5, 5.5], tronconLongueur_m: [800, 4000] },
};
