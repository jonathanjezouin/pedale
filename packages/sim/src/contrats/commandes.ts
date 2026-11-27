/**
 * Sortie d'AGIR : ce que le corps tente de faire. Très peu de commandes ; la physique les applique
 * avec ses limites (ce qui est demandé n'est pas toujours obtenu).
 */
export interface Commandes {
  readonly etage: 'commandes';
  readonly instant_s: number;
  readonly puissanceVisee_w: number;
  /** Décalage latéral visé par rapport à l'axe de la route (même repère que `PositionRoute.d_m`). */
  readonly positionLateraleVisee_m: number;
  /** 0 = pas de frein, 1 = freinage maximal. */
  readonly freinage_ratio: number;
}
