// Briques communes aux contrats. Convention : toute grandeur numérique porte son unité (SI)
// en suffixe : _m, _s, _w, _j, _kg, _rad, _m_s (vitesse), _m_s2, _rad_m (courbure),
// _ratio (sans unité, souvent 0..1, ou une pente en m/m), _n (un nombre d'éléments).

/** Identifiant d'un coureur (stable pendant toute la course). */
export type CoureurId = string;

/** Les quatre étages de la chaîne, dans l'ordre d'appel. */
export type NomEtage = 'percevoir' | 'interpreter' | 'vouloir' | 'agir';

/** Une raison nommée : le « pourquoi » lisible d'un choix. */
export interface Raison {
  /** Nom court et stable (ex. « reserve_vide »), utile aux tests et aux statistiques. */
  readonly code: string;
  /** Phrase lisible par le joueur (ex. « Ma réserve est presque vide »). */
  readonly explication: string;
}

/** Position d'un coureur sur la route, dans le repère (s, d) du chantier 2. */
export interface PositionRoute {
  /** Distance parcourue le long de l'axe de la route depuis le départ. */
  readonly s_m: number;
  /** Décalage latéral par rapport à l'axe (positif = à gauche dans le sens de la marche). */
  readonly d_m: number;
  /** Angle entre la direction du coureur et celle de la route. */
  readonly capRelatif_rad: number;
}

/** Ce que le coureur ressent de son propre corps. */
export interface Corps {
  readonly vitesse_m_s: number;
  readonly puissanceDelivree_w: number;
  /** Réserve de fond (endurance) ressentie : 1 = pleine, 0 = vide. */
  readonly reserveLongue_ratio: number;
  /** Réserve de courte durée (efforts explosifs) ressentie : 1 = pleine, 0 = vide. */
  readonly reserveCourte_ratio: number;
}

/** La route à une distance donnée devant le coureur. */
export interface EchantillonRoute {
  readonly devant_m: number;
  /** Pente en mètres de dénivelé par mètre parcouru (0,05 = 5 %). */
  readonly pente_ratio: number;
  /** Courbure de l'axe : positive vers la gauche. */
  readonly courbure_rad_m: number;
  readonly demiLargeurGauche_m: number;
  readonly demiLargeurDroite_m: number;
}

/** Vent tel que le coureur le ressent. */
export interface VentRessenti {
  /** Vitesse du vent par rapport au coureur. */
  readonly vitesse_m_s: number;
  /** Direction d'où vient le vent, relative au cap du coureur (0 = de face). */
  readonly provenance_rad: number;
}

/** Un autre coureur, vu depuis le coureur observateur. */
export interface CoureurVisible {
  readonly id: CoureurId;
  /** Écart le long de la route : positif = devant moi. */
  readonly ecartDevant_m: number;
  /** Écart latéral : positif = à ma gauche. */
  readonly ecartLateral_m: number;
  readonly vitesse_m_s: number;
}

/** Ce qui est vu de la route, du vent et des autres : même forme avant et après le bruit de perception. */
export interface Scene {
  readonly instant_s: number;
  readonly corps: Corps;
  readonly position: PositionRoute;
  readonly distanceArrivee_m: number;
  readonly routeDevant: readonly EchantillonRoute[];
  readonly vent: VentRessenti;
  readonly coureursVisibles: readonly CoureurVisible[];
}
