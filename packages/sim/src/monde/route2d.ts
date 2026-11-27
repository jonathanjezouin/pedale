import type { Alea } from '../contrats/index.ts';
import type { ZoneLacets } from './analyse.ts';
import {
  ACCOTEMENT_M, PARAMETRES_LARGEUR, VARIATION_LARGEUR_MAX_M_PAR_M, type TypeEtape,
} from './etapes.ts';
import type { Route, SegmentRoute } from './route.ts';

/** Tronçon de largeur : la largeur de chaussée varie linéairement de `largeurDebut_m` à `largeurFin_m` (plateau si égales). */
export interface TronconLargeur {
  readonly debut_m: number;
  readonly fin_m: number;
  readonly largeurDebut_m: number;
  readonly largeurFin_m: number;
}

export interface Largeur {
  readonly longueur_m: number;
  readonly troncons: readonly TronconLargeur[];
  /** Largeur de chaussée (m) à l'abscisse `s`, bornée à [0, longueur]. */
  chaussee_m(s_m: number): number;
}

export function creerLargeur(troncons: readonly TronconLargeur[]): Largeur {
  if (troncons.length === 0) throw new Error('Une largeur a au moins un tronçon');
  const fin = (troncons[troncons.length - 1] as TronconLargeur).fin_m;
  return {
    longueur_m: fin,
    troncons,
    chaussee_m(s_m: number): number {
      const s = Math.min(Math.max(s_m, 0), fin);
      let bas = 0;
      let haut = troncons.length - 1;
      while (bas < haut) {
        const milieu = (bas + haut + 1) >> 1;
        if ((troncons[milieu] as TronconLargeur).debut_m <= s) bas = milieu; else haut = milieu - 1;
      }
      const t = troncons[bas] as TronconLargeur;
      const f = t.fin_m > t.debut_m ? (s - t.debut_m) / (t.fin_m - t.debut_m) : 0;
      return t.largeurDebut_m + (t.largeurFin_m - t.largeurDebut_m) * f;
    },
  };
}

/**
 * Largeur de chaussée d'une étape (UF 2.4) : des plateaux de 800 à 4 000 m reliés par des transitions linéaires
 * (pente de largeur ≤ 0,02 m par m) ; sur les zones de lacets, la largeur est celle des lacets, dès le premier mètre :
 * les zones sont des contraintes imposées, la largeur libre est tirée entre elles.
 */
export function genererLargeur(type: TypeEtape, longueur_m: number, alea: Alea, lacets: readonly ZoneLacets[] = []): Largeur {
  const p = PARAMETRES_LARGEUR[type];
  const entre = ([min, max]: readonly [number, number]) => min + (max - min) * alea.suivant();
  /** Longueur d'une transition entre deux largeurs : 75 % de la pente maximale, par marge. */
  const duree = (de: number, vers: number) => Math.abs(vers - de) / (VARIATION_LARGEUR_MAX_M_PAR_M * 0.75);
  const troncons: TronconLargeur[] = [];
  let s = 0;
  let w = 0;

  const plateau = (fin: number) => {
    if (fin > s + 1e-9) troncons.push({ debut_m: s, fin_m: fin, largeurDebut_m: w, largeurFin_m: w });
    s = Math.max(s, fin);
  };
  const transition = (vers: number) => {
    const d = duree(w, vers);
    if (d > 1e-9) troncons.push({ debut_m: s, fin_m: s + d, largeurDebut_m: w, largeurFin_m: vers });
    s += d; w = vers;
  };

  /** Remplit [s, b] en partant de la largeur courante et en finissant sur `wb` (largeur imposée) ou libre. */
  const remplir = (b: number, wb: number | null) => {
    while (s < b - 1e-9) {
      const reste = b - s;
      const retour = wb === null ? 0 : duree(w, wb);
      if (reste <= retour + 1e-9) { if (wb !== null) transition(wb); return; }
      const fin = Math.min(s + entre(p.tronconLongueur_m), b - retour);
      plateau(fin);
      if (s >= b - 1e-9) break;
      const prochaine = entre(p.chaussee_m);
      const apres = wb === null ? 0 : duree(prochaine, wb);
      if (Math.abs(prochaine - w) > 0.05 && s + duree(w, prochaine) + apres <= b) transition(prochaine);
      else if (wb !== null && b - s < duree(w, wb) + p.tronconLongueur_m[0]) { transition(wb); plateau(b); return; }
    }
  };

  const zones = (p.lacets_m === null ? [] : lacets)
    .filter((z) => z.fin_m > 0 && z.debut_m < longueur_m)
    .map((z) => ({ debut_m: Math.max(z.debut_m, 0), fin_m: Math.min(z.fin_m, longueur_m) }))
    .sort((a, b) => a.debut_m - b.debut_m);

  w = entre(p.chaussee_m);
  // Une zone tout près du départ : la route démarre déjà à la largeur de cette zone (pas la place d'une transition).
  const premiere = zones[0];
  const largeurPremiere = premiere && p.lacets_m ? entre(p.lacets_m) : null;
  if (premiere && largeurPremiere !== null && premiere.debut_m < 150) w = largeurPremiere;
  for (const [i, z] of zones.entries()) {
    if (z.debut_m < s) continue; // zone déjà couverte par la précédente
    const largeurLacets = i === 0 && largeurPremiere !== null ? largeurPremiere : entre(p.lacets_m as readonly [number, number]);
    if (z.debut_m - s < duree(w, largeurLacets) - 1e-9) throw new Error('Zone de lacets trop proche pour une transition de largeur');
    remplir(z.debut_m, largeurLacets);
    w = largeurLacets;
    plateau(z.fin_m);
  }
  remplir(longueur_m, null);
  plateau(longueur_m);
  // La dernière transition peut dépasser la longueur d'étape : on la coupe.
  const bornes = troncons.filter((t) => t.debut_m < longueur_m - 1e-9);
  const dernier = bornes[bornes.length - 1] as TronconLargeur;
  if (dernier.fin_m > longueur_m) {
    const f = (longueur_m - dernier.debut_m) / (dernier.fin_m - dernier.debut_m);
    bornes[bornes.length - 1] = { ...dernier, fin_m: longueur_m, largeurFin_m: dernier.largeurDebut_m + (dernier.largeurFin_m - dernier.largeurDebut_m) * f };
  }
  return creerLargeur(bornes);
}

export type SurfaceRoute = 'chaussee' | 'accotement' | 'hors';

/** Position (s, d) d'un point du plan. */
export interface PointProjete {
  readonly s_m: number;
  readonly d_m: number;
  readonly surface: SurfaceRoute;
}

/** Bords de la route à une abscisse : points du plan. */
export interface BordsRoute {
  readonly gaucheAccotement: { readonly x_m: number; readonly y_m: number };
  readonly gaucheChaussee: { readonly x_m: number; readonly y_m: number };
  readonly droiteChaussee: { readonly x_m: number; readonly y_m: number };
  readonly droiteAccotement: { readonly x_m: number; readonly y_m: number };
}

/** Route à deux dimensions : l'axe, sa largeur, et la conversion entre (s, d) et le plan. */
export interface Route2D {
  readonly route: Route;
  readonly largeur: Largeur;
  /** Demi-largeur de chaussée à l'abscisse `s`. */
  demiChaussee_m(s_m: number): number;
  /** Demi-largeur de chaussée + accotement. */
  demiTotale_m(s_m: number): number;
  /** Point du plan à l'abscisse `s` et au décalage `d` (positif à gauche). */
  versMonde(s_m: number, d_m: number): { x_m: number; y_m: number; cap_rad: number };
  /**
   * Abscisse et décalage d'un point du plan. Avec `indice_s_m`, la recherche se limite aux segments proches de cet indice
   * (rapide, pour suivre un point qui avance) ; sans indice, toute la route est examinée.
   */
  versRoute(x_m: number, y_m: number, indice_s_m?: number): PointProjete | null;
  bords(s_m: number): BordsRoute;
}

const FENETRE_INDICE_M = 400;
/** Au-delà de ce décalage on ne cherche plus (aucune route ne s'approche autant d'elle-même, voir ECART_MIN_M). */
const D_MAX_RECHERCHE_M = 12;

export function creerRoute2D(route: Route, largeur: Largeur): Route2D {
  const n = route.segments.length;
  const debuts = route.debuts_m;
  const departs = debuts.map((s) => route.point(s));
  const milieux = debuts.map((s, i) => route.point(s + (route.segments[i] as SegmentRoute).longueur_m / 2));

  const demiChaussee = (s: number) => largeur.chaussee_m(s) / 2;
  const demiTotale = (s: number) => demiChaussee(s) + ACCOTEMENT_M;

  const classer = (s: number, d: number): SurfaceRoute => {
    const a = Math.abs(d);
    const dc = demiChaussee(s);
    return a <= dc ? 'chaussee' : a <= dc + ACCOTEMENT_M ? 'accotement' : 'hors';
  };

  function candidats(i: number, x: number, y: number): { s: number; d: number }[] {
    const seg = route.segments[i] as SegmentRoute;
    const p0 = departs[i] as ReturnType<Route['point']>;
    const k = seg.courbure_rad_m;
    const sortie: { s: number; d: number }[] = [];
    const eps = 1e-6;
    if (Math.abs(k) < 1e-9) {
      const ux = x - p0.x_m, uy = y - p0.y_m;
      const delta = ux * p0.devant.x_ratio + uy * p0.devant.y_ratio;
      if (delta >= -eps && delta <= seg.longueur_m + eps) sortie.push({ s: debuts[i] as number + delta, d: ux * p0.gauche.x_ratio + uy * p0.gauche.y_ratio });
      return sortie;
    }
    // Arc : centre à 1/k sur la gauche du point de départ (k > 0) ou sur sa droite (k < 0).
    const cx = p0.x_m + p0.gauche.x_ratio / k, cy = p0.y_m + p0.gauche.y_ratio / k;
    const vx = x - cx, vy = y - cy;
    const rho = Math.hypot(vx, vy);
    if (rho < 1e-9) return sortie;
    const r0x = p0.x_m - cx, r0y = p0.y_m - cy;
    const phi = Math.atan2(r0x * vy - r0y * vx, r0x * vx + r0y * vy);
    const d = 1 / k - Math.sign(k) * rho;
    for (const m of [-1, 0, 1]) {
      const delta = (phi + 2 * Math.PI * m) / k;
      if (delta >= -eps && delta <= seg.longueur_m + eps) sortie.push({ s: debuts[i] as number + delta, d });
    }
    return sortie;
  }

  function premierSegmentApres(s: number): number {
    let bas = 0;
    let haut = n - 1;
    while (bas < haut) {
      const milieu = (bas + haut + 1) >> 1;
      if ((debuts[milieu] as number) <= s) bas = milieu; else haut = milieu - 1;
    }
    return bas;
  }

  return {
    route,
    largeur,
    demiChaussee_m: demiChaussee,
    demiTotale_m: demiTotale,
    versMonde(s_m, d_m) {
      const p = route.point(s_m);
      return { x_m: p.x_m + d_m * p.gauche.x_ratio, y_m: p.y_m + d_m * p.gauche.y_ratio, cap_rad: p.cap_rad };
    },
    versRoute(x_m, y_m, indice_s_m) {
      let de = 0, a = n - 1;
      if (indice_s_m !== undefined) {
        de = premierSegmentApres(indice_s_m - FENETRE_INDICE_M);
        a = premierSegmentApres(indice_s_m + FENETRE_INDICE_M);
      }
      let meilleur: { s: number; d: number } | null = null;
      for (let i = de; i <= a; i++) {
        const seg = route.segments[i] as SegmentRoute;
        const m = milieux[i] as ReturnType<Route['point']>;
        if (Math.hypot(x_m - m.x_m, y_m - m.y_m) > seg.longueur_m / 2 + D_MAX_RECHERCHE_M) continue;
        for (const c of candidats(i, x_m, y_m)) {
          if (Math.abs(c.d) <= D_MAX_RECHERCHE_M && (!meilleur || Math.abs(c.d) < Math.abs(meilleur.d))) meilleur = c;
        }
      }
      if (!meilleur) return null;
      const s = Math.min(Math.max(meilleur.s, 0), route.longueur_m);
      return { s_m: s, d_m: meilleur.d, surface: classer(s, meilleur.d) };
    },
    bords(s_m) {
      const dc = demiChaussee(s_m);
      const pt = (d: number) => { const q = this.versMonde(s_m, d); return { x_m: q.x_m, y_m: q.y_m }; };
      return { gaucheAccotement: pt(dc + ACCOTEMENT_M), gaucheChaussee: pt(dc), droiteChaussee: pt(-dc), droiteAccotement: pt(-dc - ACCOTEMENT_M) };
    },
  };
}
