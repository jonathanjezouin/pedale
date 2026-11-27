// Paramètres chiffrés de l'esprit du coureur témoin (chantier 1). Valeurs triviales, à remplacer par
// les profils de coureurs au chantier 8.

export const TEMOIN = {
  vitesseCible_m_s: 10, // 36 km/h
  toleranceVitesse_m_s: 0.3, // en dessous de (cible - tolérance), il se juge « trop lent »
  puissanceEntretien_w: 225, // ordre de grandeur de la puissance qui tient 10 m/s sur le plat
  gainPuissance_w_par_m_s: 60, // watts ajoutés par m/s de retard sur la cible
  puissanceSoutenableBase_w: 250, // puissance qu'il croit tenir longtemps, réserve pleine (> entretien)
  partReserveSurSoutenable_ratio: 0.4, // part de la puissance soutenable qui dépend de la réserve
  margeCadrePuissance_ratio: 1.15, // le cadre autorise jusqu'à +15 % au-dessus du soutenable
} as const;

/** Cadence et seuils du Vouloir hiérarchique du témoin. */
export const VOULOIR = {
  cadenceIntention_s: 10, // l'intention se réévalue au plus tard toutes les 10 s
  seuilReserveBasse_ratio: 0.3, // événement « reserve_basse » : déclenche l'intention
  seuilReserveVide_ratio: 0.05, // en dessous : l'intention déclare qu'elle ne peut plus rien tenir
  seuilFinProche_m: 500, // événement « fin_de_piste_proche » : déclenche l'objectif
  plafondObjectifNormal_ratio: 1.3, // cadre de l'objectif : puissance <= soutenable x 1,30
  plafondObjectifEnForce_ratio: 1.5, // en finale
  plafondObjectifPrudent_ratio: 1.0, // quand la réserve est vide
} as const;
