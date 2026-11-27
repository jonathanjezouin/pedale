// Paramètres chiffrés de l'esprit du coureur témoin (chantier 1). Valeurs triviales, à remplacer par
// les profils de coureurs au chantier 8.

export const TEMOIN = {
  vitesseCible_m_s: 10, // 36 km/h
  toleranceVitesse_m_s: 0.3, // en dessous de (cible - tolérance), il se juge « trop lent »
  puissanceEntretien_w: 225, // ordre de grandeur de la puissance qui tient 10 m/s sur le plat
  gainPuissance_w_par_m_s: 60, // watts ajoutés par m/s de retard sur la cible
  puissanceSoutenableBase_w: 280, // puissance qu'il croit tenir longtemps, réserve pleine
  partReserveSurSoutenable_ratio: 0.4, // part de la puissance soutenable qui dépend de la réserve
  margeCadrePuissance_ratio: 1.15, // le cadre autorise jusqu'à +15 % au-dessus du soutenable
} as const;
