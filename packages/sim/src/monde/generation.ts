import type { Alea } from '../contrats/index.ts';
import { analyserTrace, ecartsAuxBornes, type ZoneLacets } from './analyse.ts';
import {
  ECART_MIN_M, PARAMETRES_ETAPE, RECROISEMENT_S_M, droitesLonguesRequises, type ParametresEtape, type TypeEtape,
} from './etapes.ts';
import { avancer, creerRoute, type Route, type SegmentRoute } from './route.ts';

export interface Trace {
  readonly type: TypeEtape;
  readonly longueur_m: number;
  readonly route: Route;
  /** Zones de lacets (montagne) : l'UF 2.3 y place les montées. */
  readonly lacets: readonly ZoneLacets[];
  /** Nombre de constructions complètes nécessaires (1 = du premier coup). */
  readonly tentatives: number;
}

const TENTATIVES_MAX = 40;
const ESSAIS_PAR_BLOC = 20;
const RETOURS_MAX = 400;
const PAS_ECHANTILLON_M = 4;
/** Marge d'échantillonnage : l'écart exigé entre échantillons est ECART_MIN + pas, donc l'écart réel est ≥ ECART_MIN. */
const SEUIL_M = ECART_MIN_M + PAS_ECHANTILLON_M;
const DROITE_MIN_M = 15;
const TAILLE_CELLULE_M = SEUIL_M;
const DEG = Math.PI / 180;

const entre = (a: Alea, min: number, max: number): number => min + (max - min) * a.suivant();
const entreLog = (a: Alea, min: number, max: number): number => min * Math.exp(Math.log(max / min) * a.suivant());

interface Pose { x: number; y: number; cap: number }

/** État de construction : tracé en cours, échantillons de contrôle du recroisement, compteurs. */
class Chantier {
  segments: SegmentRoute[] = [];
  zones: ZoneLacets[] = [];
  pose: Pose = { x: 0, y: 0, cap: 0 };
  s = 0;
  droite = 0;
  virage = 0;
  private xs: number[] = [];
  private ys: number[] = [];
  private ss: number[] = [];
  private cles: number[] = [];
  private grille = new Map<number, number[]>();

  constructor() { this.inserer(0, 0, 0); }

  private cle(x: number, y: number): number {
    return (Math.floor(x / TAILLE_CELLULE_M) + 1_048_576) * 2_097_152 + (Math.floor(y / TAILLE_CELLULE_M) + 1_048_576);
  }

  private inserer(x: number, y: number, s: number): void {
    const cle = this.cle(x, y);
    const i = this.xs.length;
    this.xs.push(x); this.ys.push(y); this.ss.push(s); this.cles.push(cle);
    const liste = this.grille.get(cle);
    if (liste) liste.push(i); else this.grille.set(cle, [i]);
  }

  private retirerJusqua(n: number): void {
    while (this.xs.length > n) {
      const cle = this.cles.pop() as number;
      (this.grille.get(cle) as number[]).pop();
      this.xs.pop(); this.ys.pop(); this.ss.pop();
    }
  }

  private libre(x: number, y: number, s: number): boolean {
    const cx = Math.floor(x / TAILLE_CELLULE_M);
    const cy = Math.floor(y / TAILLE_CELLULE_M);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const liste = this.grille.get((cx + dx + 1_048_576) * 2_097_152 + (cy + dy + 1_048_576));
        if (!liste) continue;
        for (const j of liste) {
          if (Math.abs(s - (this.ss[j] as number)) <= RECROISEMENT_S_M) continue;
          const ex = x - (this.xs[j] as number);
          const ey = y - (this.ys[j] as number);
          if (ex * ex + ey * ey < SEUIL_M * SEUIL_M) return false;
        }
      }
    }
    return true;
  }

  /** Ajoute un bloc de segments s'il ne frôle pas le tracé existant ; sinon, rien ne change. */
  tenter(bloc: readonly SegmentRoute[]): boolean {
    const avant = this.xs.length;
    let pose = this.pose;
    let s = this.s;
    for (const seg of bloc) {
      const n = Math.max(1, Math.ceil(seg.longueur_m / PAS_ECHANTILLON_M));
      const pas = seg.longueur_m / n;
      for (let i = 1; i <= n; i++) {
        const p = avancer(this.poseDe(pose), seg.courbure_rad_m, pas * i);
        if (!this.libre(p.x, p.y, s + pas * i)) { this.retirerJusqua(avant); return false; }
        this.inserer(p.x, p.y, s + pas * i);
      }
      pose = avancer(pose, seg.courbure_rad_m, seg.longueur_m);
      s += seg.longueur_m;
    }
    this.pose = pose;
    this.s = s;
    this.segments.push(...bloc);
    for (const seg of bloc) {
      if (Math.abs(seg.courbure_rad_m) < 1 / 5000) this.droite += seg.longueur_m; else this.virage += seg.longueur_m;
    }
    return true;
  }

  private poseDe(p: Pose): Pose { return p; }

  instantane() {
    return { n: this.segments.length, z: this.zones.length, pose: this.pose, s: this.s, d: this.droite, v: this.virage, e: this.xs.length };
  }

  restaurer(t: ReturnType<Chantier['instantane']>): void {
    this.segments.length = t.n;
    this.zones.length = t.z;
    this.pose = t.pose; this.s = t.s; this.droite = t.d; this.virage = t.v;
    this.retirerJusqua(t.e);
  }
}

/** Position de repère le long de l'étape, tirée par strates pour répartir les événements. */
function positionsStratifiees(a: Alea, n: number, longueur_m: number): number[] {
  return Array.from({ length: n }, (_, i) => ((i + a.suivant()) * longueur_m) / n);
}

function tirerVirage(a: Alea, p: ParametresEtape, signe: number): SegmentRoute[] {
  const angle = entre(a, p.angleTirage_deg[0], p.angleTirage_deg[1]) * DEG;
  const nbArcs = a.suivant() < 0.5 ? 1 : 2;
  const parts = nbArcs === 1 ? [1] : (() => { const u = entre(a, 0.3, 0.7); return [u, 1 - u]; })();
  return parts.map((part) => {
    const rayon = entreLog(a, p.rayonMin_m, p.rayonMax_m);
    return { longueur_m: rayon * angle * part, courbure_rad_m: signe / rayon };
  });
}

/** Série de lacets : épingles alternées reliées par de courtes lignes droites, cap d'entrée retrouvé à la sortie. */
function tirerLacets(a: Alea, p: ParametresEtape, signe: number): SegmentRoute[] {
  const rayonMin = p.rayonMinLacet_m as number;
  const nb = 2 * Math.floor(entre(a, 2, 6)); // 4 à 10, pair : le cap d'entrée est retrouvé
  const segs: SegmentRoute[] = [];
  let cumul = 0; // somme des angles signés déjà tournés
  for (let i = 0; i < nb; i++) {
    const sg = i % 2 === 0 ? signe : -signe;
    const rayon = entre(a, rayonMin, rayonMin + 10);
    const dernier = i === nb - 1;
    const angle = dernier ? Math.abs(cumul) : entre(a, 165, 185) * DEG;
    cumul += sg * angle;
    segs.push({ longueur_m: rayon * angle, courbure_rad_m: sg / rayon });
    if (!dernier) segs.push({ longueur_m: entre(a, 40, 100), courbure_rad_m: 0 });
  }
  return segs;
}

function construire(type: TypeEtape, longueur_m: number, a: Alea): { segments: SegmentRoute[]; zones: ZoneLacets[] } | null {
  const p = PARAMETRES_ETAPE[type];
  const c = new Chantier();
  const cible = entre(a, p.partCible[0], p.partCible[1]);
  const rapport = cible / (1 - cible);
  const km = longueur_m / 1000;
  const longues = positionsStratifiees(a, Math.max(droitesLonguesRequises(p, longueur_m) + 1, Math.ceil(km * (p.droitesLonguesPar50km / 50) * 1.3)), longueur_m);
  const lacets = p.rayonMinLacet_m === null ? [] : positionsStratifiees(a, Math.max(1, Math.round(km / 12)), longueur_m);
  let iLongue = 0;
  let iLacets = 0;
  const droiteLongue = (): number => {
    const bas = p.droiteLongueMin_m * 1.05;
    const haut = p.droiteMax_m * 0.85;
    return bas + (haut - bas) * a.suivant() ** 2;
  };
  const signeVers = (): number => {
    const ecart = c.pose.cap;
    return a.suivant() < 0.5 - 0.45 * Math.tanh(ecart / 0.7) ? 1 : -1;
  };

  const historique: ReturnType<Chantier['instantane']>[] = [];
  const reperes: [number, number][] = [];
  let retours = 0;

  while (c.s < longueur_m) {
    const t0 = c.instantane();
    const mem: [number, number] = [iLongue, iLacets];
    const zoneLacets = iLacets < lacets.length && c.s >= (lacets[iLacets] as number);
    const droiteForcee = !zoneLacets && iLongue < longues.length && c.s >= (longues[iLongue] as number);
    let ok = false;
    for (let essai = 0; essai < ESSAIS_PAR_BLOC && !ok; essai++) {
      const virage = zoneLacets ? tirerLacets(a, p, signeVers()) : tirerVirage(a, p, signeVers());
      const longueurVirage = virage.reduce((t, s) => t + s.longueur_m, 0);
      let droite: number;
      if (droiteForcee) droite = droiteLongue();
      else {
        const manque = rapport * (c.virage + (zoneLacets ? 0 : longueurVirage)) - c.droite;
        droite = Math.min(Math.max(manque * Math.exp((a.suivant() - 0.5) * 1.6), DROITE_MIN_M), p.droiteMax_m * 0.85);
      }
      const reste = longueur_m - c.s;
      const bloc: SegmentRoute[] = [{ longueur_m: droite, courbure_rad_m: 0 }, ...virage];
      if (zoneLacets) {
        // La zone commence après la droite d'approche.
        const debut = c.s + droite;
        if (c.tenter(bloc)) { c.zones.push({ debut_m: debut, fin_m: c.s }); ok = true; }
      } else ok = c.tenter(bloc);
      if (ok && reste <= 0) break;
    }
    if (ok) {
      historique.push(t0);
      reperes.push(mem);
      if (droiteForcee) iLongue++;
      if (zoneLacets) iLacets++;
    } else {
      // Impasse : on défait le dernier bloc et on repart d'un autre tirage.
      if (++retours > RETOURS_MAX || historique.length === 0) return null;
      const arriere = Math.min(historique.length, 1 + Math.floor(a.suivant() * 3));
      for (let i = 0; i < arriere; i++) {
        c.restaurer(historique.pop() as ReturnType<Chantier['instantane']>);
        const r = reperes.pop() as [number, number];
        iLongue = r[0]; iLacets = r[1];
      }
    }
  }
  return { segments: couper(c.segments, longueur_m), zones: c.zones.filter((z) => z.debut_m < longueur_m).map((z) => ({ debut_m: z.debut_m, fin_m: Math.min(z.fin_m, longueur_m) })) };
}

/** Ramène exactement le tracé à la longueur demandée en raccourcissant le dernier segment. */
function couper(segments: readonly SegmentRoute[], longueur_m: number): SegmentRoute[] {
  const sortie: SegmentRoute[] = [];
  let s = 0;
  for (const seg of segments) {
    if (s >= longueur_m) break;
    const l = Math.min(seg.longueur_m, longueur_m - s);
    if (l > 1e-6) sortie.push({ longueur_m: l, courbure_rad_m: seg.courbure_rad_m });
    s += seg.longueur_m;
  }
  return sortie;
}

/**
 * Génère un tracé réaliste (UF 2.2) pour un type d'étape et une longueur, à partir du générateur seedé.
 * Même `alea` dans le même état, mêmes paramètres : même tracé.
 */
export function genererTrace(type: TypeEtape, longueur_m: number, alea: Alea): Trace {
  if (!(longueur_m >= 1000)) throw new Error('Longueur d\'étape trop courte');
  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative++) {
    const r = construire(type, longueur_m, alea);
    if (!r) continue;
    if (ecartsAuxBornes(analyserTrace(r.segments, r.zones), type, longueur_m).length > 0) continue;
    return { type, longueur_m, route: creerRoute(r.segments), lacets: r.zones, tentatives: tentative };
  }
  throw new Error(`Génération impossible (${type}, ${longueur_m} m) après ${TENTATIVES_MAX} tentatives`);
}
