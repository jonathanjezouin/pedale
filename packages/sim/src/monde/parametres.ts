// Paramètres chiffrés du monde. Chaque valeur : nom avec unité, source ou justification.
// Valeurs de départ pour le coureur témoin (chantier 1) ; le chantier 3 les affinera.

export const PHYSIQUE = {
  gravite_m_s2: 9.81, // constante
  densiteAir_kg_m3: 1.225, // air standard au niveau de la mer, 15 °C
  surfaceAeroEfficace_m2: 0.32, // CdA d'un coureur en position de course (ordre de grandeur courant)
  resistanceRoulement_ratio: 0.004, // Crr d'un pneu route sur bon asphalte
  vitesseMiniPourForce_m_s: 1, // évite la division par zéro quand P/v à l'arrêt
  vitesseLateraleMax_m_s: 1, // un coureur ne se déplace pas latéralement plus vite
  pasDeTemps_s: 0.25, // pas fixe de la simulation
} as const;

export const COUREUR_TEMOIN = {
  masseAvecVelo_kg: 78, // 70 kg + 8 kg de vélo
  puissanceMax_w: 400, // limite d'exécution : la physique ne délivre pas plus
  energieLongue_j: 2_000_000, // réserve de fond (arbitraire, trivial au chantier 1)
  energieCourte_j: 20_000, // réserve explosive (non consommée au chantier 1)
} as const;

export const PISTE_TEMOIN = {
  longueur_m: 100_000, // piste droite fictive, assez longue pour ne jamais finir en test
  demiLargeur_m: 3,
} as const;

export const OBSERVATION = {
  distancesRoute_m: [10, 50, 100, 200], // où la route devant est échantillonnée
  visibilite_m: 150, // distance max à laquelle un autre coureur est vu
} as const;
