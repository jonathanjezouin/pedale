/**
 * Géométrie de la route (UF 2.1).
 *
 * La route est une suite de segments à courbure constante (droite si courbure nulle, arc sinon),
 * repérée par l'abscisse curviligne `s` (mètres depuis le départ). Position et cap sont calculés
 * analytiquement : pas d'échantillonnage, donc pas de couture entre segments. Le cap est continu
 * aux jonctions ; la courbure, elle, change par paliers (raccords en clothoïde : à voir en UF 2.2
 * si le rendu ou la physique l'exigent).
 *
 * Repère : x vers l'est, y vers le nord, cap en radians depuis l'axe x, positif vers la gauche
 * (sens trigonométrique). Courbure positive = virage à gauche.
 */

export interface SegmentRoute {
  readonly longueur_m: number;
  /** 0 pour une droite ; signée : > 0 à gauche, < 0 à droite. */
  readonly courbure_rad_m: number;
}

export interface DepartRoute {
  readonly x_m: number;
  readonly y_m: number;
  readonly cap_rad: number;
}

export interface Vecteur {
  readonly x_ratio: number;
  readonly y_ratio: number;
}

/** Point de la route et son repère local. */
export interface PointRoute {
  readonly s_m: number;
  readonly x_m: number;
  readonly y_m: number;
  readonly cap_rad: number;
  readonly courbure_rad_m: number;
  /** Vecteur unitaire dans le sens de la route. */
  readonly devant: Vecteur;
  /** Vecteur unitaire à gauche de la route (devant tourné de +90°). */
  readonly gauche: Vecteur;
  /** Indice du segment contenant `s`. */
  readonly segment: number;
}

export interface Route {
  readonly longueur_m: number;
  readonly segments: readonly SegmentRoute[];
  /** Abscisse de début de chaque segment (même longueur que `segments`). */
  readonly debuts_m: readonly number[];
  /** Point à l'abscisse `s` ; `s` est borné à [0, longueur]. */
  point(s_m: number): PointRoute;
}

/** sin(u)/u, stable en 0. */
function sinc(u: number): number {
  return Math.abs(u) < 1e-4 ? 1 - (u * u) / 6 : Math.sin(u) / u;
}

export function creerRoute(segments: readonly SegmentRoute[], depart: DepartRoute = { x_m: 0, y_m: 0, cap_rad: 0 }): Route {
  if (segments.length === 0) throw new Error('Une route a au moins un segment');
  const debuts: number[] = [];
  const poses: { x: number; y: number; cap: number }[] = [];
  let s = 0;
  let pose = { x: depart.x_m, y: depart.y_m, cap: depart.cap_rad };
  for (const seg of segments) {
    if (!(seg.longueur_m > 0) || !Number.isFinite(seg.longueur_m)) throw new Error('Longueur de segment invalide');
    if (!Number.isFinite(seg.courbure_rad_m)) throw new Error('Courbure de segment invalide');
    debuts.push(s);
    poses.push(pose);
    pose = avancer(pose, seg.courbure_rad_m, seg.longueur_m);
    s += seg.longueur_m;
  }
  const longueur = s;

  const trouver = (abscisse: number): number => {
    let bas = 0;
    let haut = debuts.length - 1;
    while (bas < haut) {
      const milieu = (bas + haut + 1) >> 1;
      if ((debuts[milieu] as number) <= abscisse) bas = milieu;
      else haut = milieu - 1;
    }
    return bas;
  };

  return {
    longueur_m: longueur,
    segments,
    debuts_m: debuts,
    point(s_m: number): PointRoute {
      const sc = Math.min(Math.max(s_m, 0), longueur);
      const i = trouver(sc);
      const seg = segments[i] as SegmentRoute;
      const p = avancer(poses[i] as { x: number; y: number; cap: number }, seg.courbure_rad_m, sc - (debuts[i] as number));
      const c = Math.cos(p.cap);
      const sn = Math.sin(p.cap);
      return {
        s_m: sc,
        x_m: p.x,
        y_m: p.y,
        cap_rad: p.cap,
        courbure_rad_m: seg.courbure_rad_m,
        devant: { x_ratio: c, y_ratio: sn },
        gauche: { x_ratio: -sn, y_ratio: c },
        segment: i,
      };
    },
  };
}

/** Pose après avoir parcouru `d` mètres à courbure constante `k` : formule exacte, stable pour k → 0. */
function avancer(p: { x: number; y: number; cap: number }, k: number, d: number): { x: number; y: number; cap: number } {
  const demi = (k * d) / 2;
  const corde = d * sinc(demi);
  const capMilieu = p.cap + demi;
  return { x: p.x + corde * Math.cos(capMilieu), y: p.y + corde * Math.sin(capMilieu), cap: p.cap + k * d };
}
