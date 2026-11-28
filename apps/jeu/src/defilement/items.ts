// Éléments du décor (UF 2.7) : des données pures (en mètres, coordonnées locales au conteneur : bloc de route ou cellule du monde).
// Aucune dépendance au navigateur : on peut les générer et les contrôler sans écran.

export type Item =
  | { k: 'arbre'; x: number; y: number; r: number; c: number; v: number; conifere: boolean }
  | { k: 'buisson'; x: number; y: number; r: number; c: number }
  | { k: 'rocher'; x: number; y: number; r: number; a: number; cotes: number }
  | { k: 'cactus' | 'foin'; x: number; y: number; r: number }
  | { k: 'maison'; x: number; y: number; l: number; h: number; a: number; toit: number; plat: boolean; cheminee: boolean }
  | { k: 'tente'; x: number; y: number; l: number; h: number; a: number; c: number }
  | { k: 'barriere'; x: number; y: number; x2: number; y2: number }
  | { k: 'personne'; x: number; y: number; a: number; echelle: number; habit: number; peau: number; genre: 0 | 1 | 2; fanion: number }
  | { k: 'poteau'; x: number; y: number; km: boolean }
  // posés SUR la route par construction (ligne d'arrivée, de départ, portiques) : exclus du contrôle « rien sur la chaussée »
  | { k: 'carre'; x: number; y: number; a: number; cote: number; sombre: boolean }
  | { k: 'ligne'; x: number; y: number; a: number; demi: number }
  | { k: 'portique'; x: number; y: number; a: number; demi: number; fin: boolean };

export interface Tache { x: number; y: number; r: number; c: number; alpha: number }
export interface Champ { x: number; y: number; l: number; h: number; a: number; c: number; ecart: number }
export interface Lac { x: number; y: number; r: number; graine: number }

/** Rayon (m) d'un élément autour de son centre : sert aux contrôles de non-recouvrement de la route. */
export function rayonItem(it: Item): number {
  switch (it.k) {
    case 'arbre': case 'buisson': case 'rocher': case 'cactus': case 'foin': return it.r;
    case 'maison': case 'tente': return Math.hypot(it.l, it.h) / 2;
    case 'personne': return it.genre === 2 ? 0.6 : 0.28 * it.echelle;
    case 'poteau': return it.km ? 0.7 : 0.35;
    case 'barriere': return 0.1; // un segment : on contrôle ses deux extrémités
    default: return 0.3;
  }
}

/** Éléments qui, par construction, sont sur la chaussée. */
export const SUR_LA_ROUTE: ReadonlySet<Item['k']> = new Set(['carre', 'ligne', 'portique']);
