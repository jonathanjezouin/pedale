/* =====================================================================
   Placement : où se met un coureur sur la largeur de la route.
   La « file » n'est plus l'axe d = 0 mais une ligne dont l'inclinaison dépend du vent :
     de face  → file indienne droite ;  de côté → éventail sous le vent (le sillage dérive).
   La tête de file se place côté vent quand il est de côté (elle laisse la place à l'éventail).
   ===================================================================== */
import type { Rider, World } from './types';
import { MARGE_BORD, RIDER_LEN } from './physics';
import { ROAD_HALF } from './road';
import { clamp } from './util';

export const LIMITE = ROAD_HALF - MARGE_BORD;
export const limiter = (y: number) => clamp(y, -LIMITE, LIMITE);

/** Ordonnée de l'axe de la file à l'abscisse x, ancré sur la tête de **son groupe** (`xf`), pas sur le coureur le plus avancé de la course :
 *  un groupe qui se scinde garde sa propre file (v0.1.2b ; avant, le second groupe n'était « en ligne » pour personne et roulait sans roue à suivre). */
/** Pente de la file : le sillage dérive de `gap·tanβ` ; avec ~0,7 m entre les roues et 2,5 m entre les centres, ≈ 0,3 · tanβ par mètre. */
export const PENTE_FILE = 0.3;
export const axeY = (w: World, x: number, xf: number = w.vue.xFront) => limiter(w.vue.yTete + (xf - x) * w.vue.tanB * PENTE_FILE);
/** Axe de la file au droit du coureur `r`, ancré sur la tête de son groupe. */
export const axeDe = (w: World, r: Rider) => axeY(w, r.x, xTeteDe(w, r));
export const xTeteDe = (w: World, r: Rider) => w.vue.xTeteGroupe[r.id] ?? w.vue.xFront;

/** Le coureur est-il dans la file (et non en train de passer ou de se laisser glisser sur le côté) ? */
export const enLigne = (w: World, r: Rider, tol = 0.8) => Math.abs(r.y - axeDe(w, r)) < tol;

/** Décalage latéral des couloirs de passage : propre à chaque coureur (expérience), un peu plus large en sprint. */
export const decalage = (r: Rider, sprint = false) => 1.3 + 0.35 * (1 - r.profile.experience) + (sprint ? 0.25 : 0);

/** Position voulue dans la file : sur l'axe, avec l'habitude personnelle du coureur. */
export const placeDansLaFile = (w: World, r: Rider) =>
  xTeteDe(w, r) - r.x > 60 ? limiter(r.profile.lateral) : limiter(axeDe(w, r) + r.profile.lateral * 0.6);   // lâché : on revient vers le milieu de la route

/** Couloir montant (on remonte, exposé au vent) et couloir descendant (on se laisse glisser, à l'abri). */
export const yMontant = (w: World, r: Rider, sprint = false) => limiter(axeDe(w, r) + w.vue.coteMontant * decalage(r, sprint));
export const yDescendant = (w: World, r: Rider) => limiter(axeDe(w, r) - w.vue.coteMontant * decalage(r));

/** `o` abrite-t-il `r` du vent (r est dans le sillage de o, à `portee` m max) ? */
export function abrite(w: World, o: Rider, r: Rider, tol = 1.0, portee = 40): boolean {
  const gap = o.x - r.x;
  if (gap <= 0 || gap > portee) return false;
  return Math.abs(r.y - (o.y + Math.max(0, gap - RIDER_LEN) * w.vue.tanB)) < tol;
}

/** Roue à suivre dans la file : le coureur le plus proche devant moi, *dans la file*, dont le sillage me couvre.
 *  (On suit la file, pas un coureur qui passe ou qui se décale : sinon toute la file partirait avec lui.) */
export function roueEnLigne(w: World, r: Rider, portee = 40): Rider | null {
  let best: Rider | null = null;
  for (const o of w.vue.ordre) {
    if (o === r || !enLigne(w, o, 0.9) || !abrite(w, o, r, 1.3, portee) || o.x - r.x < RIDER_LEN - 0.2) continue;       // pas un coureur à ma hauteur
    if (!best || o.x < best.x) best = o;
  }
  return best;
}
