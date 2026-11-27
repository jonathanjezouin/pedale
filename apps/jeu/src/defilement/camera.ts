// Caméra du défilement (UF 2.6) : fonctions pures, sans état. Les repères sont ceux du monde (x est, y nord, mètres)
// et ceux de l'écran (pixels CSS, y vers le bas).

export type Orientation = 'cap' | 'nord';
export type ChoixOrientation = Orientation | 'auto';

/**
 * Au-delà de ×4, la caméra « route vers le haut » tourne de plusieurs tours par seconde dans les lacets
 * (mesuré : 1 000 °/s au p99 à ×16 en montagne) : en mode auto, on passe au nord en haut.
 */
export const ACCELERATION_MAX_ROUTE_EN_HAUT = 4;
export const orientationEffective = (choix: ChoixOrientation, acceleration: number): Orientation =>
  choix === 'auto' ? (acceleration <= ACCELERATION_MAX_ROUTE_EN_HAUT ? 'cap' : 'nord') : choix;

export interface Camera {
  /** Point du monde au centre de la vue (le point qui avance). */
  readonly cx_m: number;
  readonly cy_m: number;
  /** Rotation appliquée au monde : 0 en « nord en haut », π/2 − cap en « route vers le haut ». */
  readonly rotation_rad: number;
  readonly zoom_px_m: number;
  /** Position à l'écran du point suivi. */
  readonly ancrageX_px: number;
  readonly ancrageY_px: number;
}

/** Matrice 2D du canvas : (x, y) local → écran, x' = a·x + c·y + e, y' = b·x + d·y + f. */
export interface Matrice { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number }

/** Part de la hauteur où se tient le point en « route vers le haut » : on voit plus de route devant que derrière. */
export const ANCRAGE_CAP = 0.7;
/** Distance sur laquelle on moyenne le cap pour l'anticiper (m). */
export const FENETRE_CAP_M = 30;

export function creerCamera(
  x_m: number, y_m: number, capLisse_rad: number, orientation: Orientation, zoom_px_m: number, largeur_px: number, hauteur_px: number,
): Camera {
  return {
    cx_m: x_m, cy_m: y_m,
    rotation_rad: orientation === 'cap' ? Math.PI / 2 - capLisse_rad : 0,
    zoom_px_m,
    ancrageX_px: largeur_px / 2,
    ancrageY_px: orientation === 'cap' ? hauteur_px * ANCRAGE_CAP : hauteur_px / 2,
  };
}

/** Position à l'écran d'un point du monde. */
export function versEcran(c: Camera, x_m: number, y_m: number): { x_px: number; y_px: number } {
  const ux = x_m - c.cx_m, uy = y_m - c.cy_m;
  const co = Math.cos(c.rotation_rad), si = Math.sin(c.rotation_rad);
  return { x_px: c.ancrageX_px + c.zoom_px_m * (co * ux - si * uy), y_px: c.ancrageY_px - c.zoom_px_m * (si * ux + co * uy) };
}

/**
 * Matrice qui envoie les coordonnées locales d'un bloc (origine en `ox, oy` dans le monde) à l'écran.
 * Le décalage de l'origine est soustrait en double précision AVANT d'être converti : les chemins des blocs ne contiennent que
 * de petites coordonnées, quelle que soit la distance au départ (sinon, à 250 km, les flottants 32 bits du canvas tremblent).
 */
export function matriceBloc(c: Camera, ox_m: number, oy_m: number): Matrice {
  const co = Math.cos(c.rotation_rad), si = Math.sin(c.rotation_rad), z = c.zoom_px_m;
  const ux = ox_m - c.cx_m, uy = oy_m - c.cy_m;
  return {
    a: z * co, b: -z * si, c: -z * si, d: -z * co,
    e: c.ancrageX_px + z * (co * ux - si * uy), f: c.ancrageY_px - z * (si * ux + co * uy),
  };
}

/** Cap lissé : direction moyenne de la route sur `fenetre_m` devant `s` (moyenne de vecteurs unitaires, donc sans saut de ±π). */
export function capLisse(capEn: (s_m: number) => number, s_m: number, fenetre_m: number = FENETRE_CAP_M, longueur_m = Infinity): number {
  let sx = 0, sy = 0;
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const cap = capEn(Math.min(s_m + (fenetre_m * i) / n, longueur_m));
    sx += Math.cos(cap); sy += Math.sin(cap);
  }
  return Math.atan2(sy, sx);
}

/** Rayon (m) du disque centré sur le point suivi qui contient tout l'écran. */
export function rayonVue_m(c: Camera, largeur_px: number, hauteur_px: number): number {
  const dx = Math.max(c.ancrageX_px, largeur_px - c.ancrageX_px), dy = Math.max(c.ancrageY_px, hauteur_px - c.ancrageY_px);
  return Math.hypot(dx, dy) / c.zoom_px_m;
}
