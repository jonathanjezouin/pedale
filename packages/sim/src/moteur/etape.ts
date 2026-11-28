import {
  ACCOTEMENT_M, RAYON_DROITE_M, TYPES_ETAPE, analyserTrace, classePente, creerRoute2D, genererLargeur, genererProfil, genererTrace,
  type ClassePente, type TypeEtape, type TypeTroncon,
} from '../monde/index.ts';
import { creerAlea } from './alea.ts';

export { TYPES_ETAPE };
export type { ClassePente, TypeEtape, TypeTroncon };

/** Tout ce que l'on sait d'une étape en un point de la route, lu sans jamais écrire dans le monde. */
export interface LectureEtape {
  readonly s_m: number;
  readonly x_m: number;
  readonly y_m: number;
  /** Cap de la route, radians depuis l'axe x (est), positif vers la gauche. */
  readonly cap_rad: number;
  /** Positive à gauche, négative à droite ; 0 en ligne droite. */
  readonly courbure_rad_m: number;
  /** Rayon de courbure (m), ou null pour une ligne droite (rayon > 5 km). */
  readonly rayon_m: number | null;
  readonly altitude_m: number;
  readonly pente_ratio: number;
  readonly classePente: ClassePente;
  readonly largeurChaussee_m: number;
  readonly accotement_m: number;
  readonly troncon: TypeTroncon;
  readonly enLacets: boolean;
}

export interface Point2D { readonly x_m: number; readonly y_m: number }
export interface ProjectionEtape { readonly s_m: number; readonly d_m: number; readonly bord_m: number; readonly cap_rad: number }
export interface BordsEtape {
  readonly gaucheAccotement: Point2D;
  readonly gaucheChaussee: Point2D;
  readonly droiteChaussee: Point2D;
  readonly droiteAccotement: Point2D;
}

/** Points de la route échantillonnés à pas régulier (tableaux parallèles). */
export interface EchantillonsEtape {
  readonly pas_m: number;
  readonly s_m: readonly number[];
  readonly x_m: readonly number[];
  readonly y_m: readonly number[];
  readonly altitude_m: readonly number[];
  /** 0 = pente faible, 1 = moyenne, 2 = forte. */
  readonly classe: readonly (0 | 1 | 2)[];
}

export interface BilanEtape {
  readonly denivelePositif_m: number;
  readonly altitudeMin_m: number;
  readonly altitudeMax_m: number;
  readonly partDroite_ratio: number;
  readonly plusLongueDroite_m: number;
  readonly viragesParKm: number;
  readonly angleMoyen_rad: number;
  readonly rayonMin_m: number;
  readonly nbLacets: number;
  readonly longueurLacets_m: number;
  readonly largeurMin_m: number;
  readonly largeurMax_m: number;
}

export interface TronconEtape { readonly type: TypeTroncon; readonly debut_m: number; readonly fin_m: number }
export interface ZoneEtape { readonly debut_m: number; readonly fin_m: number }

/** Une étape : profil, tracé et largeur de route d'une même graine, avec leur lecture en lecture seule. */
export interface Etape {
  readonly graine: number;
  readonly type: TypeEtape;
  readonly longueur_m: number;
  readonly troncons: readonly TronconEtape[];
  readonly lacets: readonly ZoneEtape[];
  readonly bilan: BilanEtape;
  lire(s_m: number): LectureEtape;
  bords(s_m: number): BordsEtape;
  /** Point du plan à l'abscisse `s` et au décalage `d` (positif à gauche), sans toucher à l'étape. */
  versMonde(s_m: number, d_m: number): Point2D;
  /** Demi-largeur de chaussée (sans accotement) à l'abscisse `s`. */
  demiChaussee(s_m: number): number;
  /** Demi-largeur de chaussée + accotement à l'abscisse `s`. */
  demiTotale(s_m: number): number;
  /**
   * Où est la route par rapport à ce point du plan : abscisse et décalage du point le plus proche de l'axe, cap de la route,
   * et `bord_m` = distance au bord extérieur de l'accotement (négative sur la route ou l'accotement).
   * `null` si l'axe est à plus de 12 m : le point est alors à plus de 7 m de tout bord de route.
   * Avec `indice_s_m`, seuls les segments à ±400 m de cet indice sont examinés (beaucoup plus rapide ; null si la route proche en est plus loin).
   */
  projeter(x_m: number, y_m: number, indice_s_m?: number): ProjectionEtape | null;
  echantillonner(pas_m: number): EchantillonsEtape;
}

const CLASSE_INDEX: Record<ClassePente, 0 | 1 | 2> = { faible: 0, moyenne: 1, forte: 2 };

/**
 * Génère l'étape de cette graine, de ce type et de cette longueur (UF 2.5).
 * Profil, tracé et largeur tirent chacun sur leur propre flux dérivé de la graine : même graine, même étape.
 */
export function creerEtape(graine: number, type: TypeEtape, longueur_m: number): Etape {
  const g = graine >>> 0;
  const profil = genererProfil(type, longueur_m, creerAlea(g ^ 0x9e3779b9));
  const trace = genererTrace(type, longueur_m, creerAlea(g), profil);
  const largeur = genererLargeur(type, longueur_m, creerAlea(g ^ 0x85ebca6b), trace.lacets);
  const route2d = creerRoute2D(trace.route, largeur);
  const analyse = analyserTrace(trace.route.segments, trace.lacets);

  const enLacets = (s: number) => trace.lacets.some((z) => s >= z.debut_m && s <= z.fin_m);
  const tronconDe = (s: number): TypeTroncon => {
    const t = profil.troncons.find((x) => s >= x.debut_m && s <= x.fin_m) ?? profil.troncons[profil.troncons.length - 1];
    return (t as { type: TypeTroncon }).type;
  };

  let zMin = Infinity, zMax = -Infinity, wMin = Infinity, wMax = -Infinity;
  for (let s = 0; s <= longueur_m; s += 20) {
    const z = profil.altitude(s), w = largeur.chaussee_m(s);
    zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); wMin = Math.min(wMin, w); wMax = Math.max(wMax, w);
  }

  return {
    graine: g,
    type,
    longueur_m,
    troncons: profil.troncons.map((t) => ({ type: t.type, debut_m: t.debut_m, fin_m: t.fin_m })),
    lacets: trace.lacets.map((z) => ({ debut_m: z.debut_m, fin_m: z.fin_m })),
    bilan: {
      denivelePositif_m: profil.denivelePositif_m,
      altitudeMin_m: zMin,
      altitudeMax_m: zMax,
      partDroite_ratio: analyse.partDroite_ratio,
      plusLongueDroite_m: analyse.plusLongueDroite_m,
      viragesParKm: analyse.viragesParKm,
      angleMoyen_rad: analyse.angleMoyen_rad,
      rayonMin_m: Math.min(analyse.rayonMinHorsLacet_m, analyse.rayonMinLacet_m),
      nbLacets: trace.lacets.length,
      longueurLacets_m: analyse.longueurLacets_m,
      largeurMin_m: wMin,
      largeurMax_m: wMax,
    },
    lire(s_m) {
      const p = trace.route.point(s_m);
      const k = p.courbure_rad_m;
      const pente = profil.pente(p.s_m);
      return {
        s_m: p.s_m, x_m: p.x_m, y_m: p.y_m, cap_rad: p.cap_rad, courbure_rad_m: k,
        rayon_m: Math.abs(k) < 1 / RAYON_DROITE_M ? null : 1 / Math.abs(k),
        altitude_m: profil.altitude(p.s_m), pente_ratio: pente, classePente: classePente(pente),
        largeurChaussee_m: largeur.chaussee_m(p.s_m), accotement_m: ACCOTEMENT_M,
        troncon: tronconDe(p.s_m), enLacets: enLacets(p.s_m),
      };
    },
    bords(s_m) { return route2d.bords(s_m); },
    versMonde(s_m, d_m) { const q = route2d.versMonde(s_m, d_m); return { x_m: q.x_m, y_m: q.y_m }; },
    demiChaussee(s_m) { return route2d.demiChaussee_m(s_m); },
    demiTotale(s_m) { return route2d.demiTotale_m(s_m); },
    projeter(x_m, y_m, indice_s_m) {
      const r = route2d.versRoute(x_m, y_m, indice_s_m);
      if (!r) return null;
      return { s_m: r.s_m, d_m: r.d_m, bord_m: Math.abs(r.d_m) - route2d.demiTotale_m(r.s_m), cap_rad: trace.route.point(r.s_m).cap_rad };
    },
    echantillonner(pas_m) {
      const n = Math.max(1, Math.ceil(longueur_m / pas_m));
      const s: number[] = [], x: number[] = [], y: number[] = [], z: number[] = [], c: (0 | 1 | 2)[] = [];
      for (let i = 0; i <= n; i++) {
        const sc = Math.min(i * pas_m, longueur_m);
        const p = trace.route.point(sc);
        s.push(sc); x.push(p.x_m); y.push(p.y_m); z.push(profil.altitude(sc)); c.push(CLASSE_INDEX[classePente(profil.pente(sc))]);
      }
      return { pas_m, s_m: s, x_m: x, y_m: y, altitude_m: z, classe: c };
    },
  };
}
