import type { Alea } from '../contrats/index.ts';
import {
  PARAMETRES_PROFIL, RAMPE_M_PAR_UNITE_PENTE, TRONCON_MIN_M, VARIATION_PENTE_MAX_PAR_M,
  type ParametresProfil, type TypeEtape, type TypeTroncon,
} from './etapes.ts';

export interface TronconProfil {
  readonly type: TypeTroncon;
  readonly debut_m: number;
  readonly fin_m: number;
}

/** Profil d'étape : altitude et pente en fonction de l'abscisse curviligne `s` (la même que celle du tracé). */
export interface Profil {
  readonly type: TypeEtape;
  readonly longueur_m: number;
  readonly troncons: readonly TronconProfil[];
  readonly denivelePositif_m: number;
  readonly tentatives: number;
  /** Altitude (m) à l'abscisse `s` ; `s` est borné à [0, longueur]. */
  altitude(s_m: number): number;
  /** Pente (rapport dz/ds, 0,05 = 5 %) à l'abscisse `s`. */
  pente(s_m: number): number;
}

/** Segment à pente linéaire : p varie de p0 à p1 entre s0 et s1 ; z0 est l'altitude en s0. */
interface Morceau { s0: number; s1: number; p0: number; p1: number; z0: number }

const TENTATIVES_MAX = 60;
const PAS_DENIVELE_M = 5;
/** En deçà de cette pente (valeur absolue), on considère être « à plat » pour fixer la frontière d'un tronçon. */
const PENTE_PLATE = 0.005;

const entre = (a: Alea, [min, max]: readonly [number, number]): number => min + (max - min) * a.suivant();
const borne = (x: number, min: number, max: number): number => Math.min(Math.max(x, min), max);

function evaluer(morceaux: readonly Morceau[], s_m: number): { m: Morceau; d: number } {
  const s = borne(s_m, 0, (morceaux[morceaux.length - 1] as Morceau).s1);
  let bas = 0;
  let haut = morceaux.length - 1;
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1;
    if ((morceaux[milieu] as Morceau).s0 <= s) bas = milieu; else haut = milieu - 1;
  }
  const m = morceaux[bas] as Morceau;
  return { m, d: s - m.s0 };
}

/** Constructeur : enchaîne rampes (pente linéaire) et paliers (pente constante). */
class Constructeur {
  morceaux: Morceau[] = [];
  marques: { s: number; type: TypeTroncon }[] = [];
  s = 0;
  p = 0;
  z: number;
  dplus = 0;

  constructor(altitudeDepart_m: number) { this.z = altitudeDepart_m; }

  /** Gain d'altitude d'une rampe de la pente courante vers `pt` (sans la construire). */
  gainRampe(pt: number): number { return ((this.p + pt) / 2) * Math.abs(pt - this.p) * RAMPE_M_PAR_UNITE_PENTE; }
  longueurRampe(pt: number): number { return Math.abs(pt - this.p) * RAMPE_M_PAR_UNITE_PENTE; }

  private ajouter(longueur: number, pt: number): void {
    if (longueur <= 1e-9) return;
    const p0 = this.p;
    this.morceaux.push({ s0: this.s, s1: this.s + longueur, p0, p1: pt, z0: this.z });
    const dz = ((p0 + pt) / 2) * longueur;
    // dénivelé positif : partie positive de l'intégrale de la pente
    if (p0 >= 0 && pt >= 0) this.dplus += dz;
    else if (p0 > 0 !== pt > 0 && p0 !== pt) {
      const part = (p0 > 0 ? p0 : pt) / Math.abs(pt - p0); // fraction de la longueur du côté positif
      this.dplus += ((p0 > 0 ? p0 : pt) * part * longueur) / 2;
    }
    this.s += longueur; this.z += dz; this.p = pt;
  }

  /** Ouvre un tronçon : frontière placée là où la pente passe sous PENTE_PLATE le long de la rampe qui suit. */
  ouvrir(type: TypeTroncon, pt: number): void {
    let debut = this.s;
    const dp = pt - this.p;
    if (Math.abs(this.p) > PENTE_PLATE && dp !== 0 && (Math.abs(pt) <= PENTE_PLATE || Math.sign(pt) !== Math.sign(this.p))) {
      debut = this.s + (Math.abs(this.p) - PENTE_PLATE) / Math.abs(dp) * Math.abs(dp) * RAMPE_M_PAR_UNITE_PENTE;
    }
    this.marques.push({ s: debut, type });
  }

  rampeVers(pt: number): void { this.ajouter(Math.abs(pt - this.p) * RAMPE_M_PAR_UNITE_PENTE, pt); }
  palier(longueur: number): void { this.ajouter(longueur, this.p); }
}

/**
 * Enchaîne des paliers de pentes `pentes` (rampes entre eux) pour gagner la hauteur `hauteur_m`
 * (positive en montée, négative en descente) : les longueurs des paliers sont proportionnelles à `poids`.
 * Retourne la hauteur effectivement obtenue.
 */
function enchainer(c: Constructeur, pentes: readonly number[], poids: readonly number[], hauteur_m: number): void {
  let p = c.p;
  let gainRampes = 0;
  for (const pt of pentes) { gainRampes += ((p + pt) / 2) * Math.abs(pt - p) * RAMPE_M_PAR_UNITE_PENTE; p = pt; }
  const denom = pentes.reduce((t, pt, i) => t + pt * (poids[i] as number), 0);
  const k = denom === 0 ? 0 : Math.max(0, (hauteur_m - gainRampes) / denom);
  pentes.forEach((pt, i) => { c.rampeVers(pt); c.palier(k * (poids[i] as number)); });
}

/** Cible de dénivelé positif par km, tirée dans la moitié basse de la fourchette : le haut est difficile à atteindre avec des pentes réalistes. */
function cibleDenivele(a: Alea, p: ParametresProfil): number {
  const [lo, hi] = p.deniveleParKm_m;
  return lo + (hi - lo) * (0.3 + 0.3 * a.suivant());
}

/** Événement planifié : une côte (bosse ou col) et, le plus souvent, sa descente. */
interface Evenement {
  readonly genre: 'bosse' | 'col';
  readonly hauteur_m: number;
  readonly pentes: readonly number[];
  readonly poids: readonly number[];
  readonly descente: { readonly hauteur_m: number; readonly pentes: readonly number[]; readonly poids: readonly number[] } | null;
  /** Bosse seulement : la descente forme un tronçon « descente » à part. */
  readonly descenteSeparee: boolean;
}

const logUniforme = (a: Alea, [min, max]: readonly [number, number]): number => min * Math.exp(Math.log(max / min) * a.suivant());

function planifierEvenement(a: Alea, p: ParametresProfil, genre: 'bosse' | 'col', hauteur_m: number, avecDescente: boolean): Evenement {
  if (genre === 'col') {
    const g = entre(a, p.colPente_ratio);
    const k = 3 + Math.floor(a.suivant() * 3);
    const pentes = Array.from({ length: k }, () => borne(g + (a.suivant() - 0.5) * 0.05, 0.03, p.penteMaxMontee_ratio));
    const poids = pentes.map(() => 0.5 + a.suivant());
    let descente = null;
    if (avecDescente) {
      const gd = entre(a, p.descentePente_ratio);
      const kd = 2 + Math.floor(a.suivant() * 3);
      const pd = Array.from({ length: kd }, () => -borne(gd + (a.suivant() - 0.5) * 0.04, 0.03, p.penteMaxDescente_ratio));
      descente = { hauteur_m: hauteur_m * (0.9 + 0.25 * a.suivant()), pentes: pd, poids: pd.map(() => 0.5 + a.suivant()) };
    }
    return { genre, hauteur_m, pentes, poids, descente, descenteSeparee: true };
  }
  const g = Math.min(entre(a, p.bossePente_ratio), p.penteMaxMontee_ratio, Math.sqrt(hauteur_m / RAMPE_M_PAR_UNITE_PENTE) * 0.9);
  const hd = hauteur_m * (0.8 + 0.4 * a.suivant());
  const gd = -Math.min(entre(a, p.descentePente_ratio), p.penteMaxDescente_ratio, Math.sqrt(hd / RAMPE_M_PAR_UNITE_PENTE) * 0.9);
  return { genre, hauteur_m, pentes: [g], poids: [1], descente: { hauteur_m: hd, pentes: [gd], poids: [1] }, descenteSeparee: a.suivant() < 0.5 };
}

/** Même événement avec des pentes multipliées par `m` (dans les maxima du type). */
function raidir(e: Evenement, m: number, p: ParametresProfil): Evenement {
  if (m === 1) return e;
  const montee = (x: number) => Math.min(x * m, p.penteMaxMontee_ratio);
  const descente = (x: number) => -Math.min(-x * m, p.penteMaxDescente_ratio);
  return { ...e, pentes: e.pentes.map(montee), descente: e.descente && { ...e.descente, pentes: e.descente.pentes.map(descente) } };
}

/** Exécute un événement (hauteur ajustée par `echelle`), dans les limites d'altitude. */
function executer(c: Constructeur, e: Evenement, echelle: number, p: ParametresProfil): void {
  // Marges : la rampe de retour à plat qui suit gagne (montée) ou perd (descente) encore p²/2 × rampe.
  const queueMontee = (p.penteMaxMontee_ratio ** 2 / 2) * RAMPE_M_PAR_UNITE_PENTE;
  const queueDescente = (p.penteMaxDescente_ratio ** 2 / 2) * RAMPE_M_PAR_UNITE_PENTE;
  const h = Math.min(e.hauteur_m * echelle, p.altitudeMax_m - c.z - queueMontee - 40);
  if (h < 8) return;
  // La rampe seule gagne ou perd p²/2 × RAMPE : une pente trop forte pour la hauteur visée est ramenée à ce que la hauteur permet.
  const pentePermise = (hauteur: number) => Math.sqrt((2 * 0.8 * hauteur) / RAMPE_M_PAR_UNITE_PENTE);
  const pentes = e.pentes.map((x) => Math.min(x, pentePermise(h)));
  c.ouvrir(e.genre, pentes[0] as number);
  enchainer(c, pentes, e.poids, h);
  if (!e.descente) return;
  const hd = Math.min(e.descente.hauteur_m * echelle, c.z - queueDescente - 40);
  if (hd < 8) return;
  const pd = e.descente.pentes.map((x) => -Math.min(-x, pentePermise(hd)));
  if (e.descenteSeparee) c.ouvrir('descente', pd[0] as number);
  enchainer(c, pd, e.descente.poids, -hd);
}

/** Longueur qu'occuperait l'événement, mesurée sur une construction à blanc partant d'une pente nulle. */
function longueurEvenement(e: Evenement, echelle: number, p: ParametresProfil): number {
  const c = new Constructeur(p.altitudeMax_m / 2);
  executer(c, e, echelle, p);
  return c.s;
}

function construire(type: TypeEtape, longueur_m: number, a: Alea): { morceaux: Morceau[]; troncons: TronconProfil[]; dplus: number; z0: number } | null {
  const p = PARAMETRES_PROFIL[type];
  const z0 = entre(a, p.altitudeDepart_m);
  const total = cibleDenivele(a, p) * (longueur_m / 1000);

  // 1. Tirage des événements : des cols d'abord (montagne), puis des bosses, jusqu'au dénivelé visé.
  const evenements: Evenement[] = [];
  let reste = total;
  if (p.colsAutorises && reste >= p.colHauteur_m[0]) {
    let budget = reste * 0.75;
    while (budget >= p.colHauteur_m[0] && p.altitudeMax_m - z0 - 300 >= p.colHauteur_m[0]) {
      const plafond = Math.min(p.colHauteur_m[1], p.altitudeMax_m - z0 - 300); // reste de la marge sous l'altitude maximale
      const h = Math.min(budget, logUniforme(a, [Math.min(Math.max(p.colHauteur_m[0], 450), plafond), plafond]));
      evenements.push(planifierEvenement(a, p, 'col', h, a.suivant() < 0.85));
      budget -= h; reste -= h;
    }
  }
  while (reste >= p.bosseHauteur_m[0] * 0.8) {
    const h = Math.min(reste, logUniforme(a, p.bosseHauteur_m));
    evenements.push(planifierEvenement(a, p, 'bosse', Math.max(h, 8), true));
    reste -= h;
  }
  for (let i = evenements.length - 1; i > 0; i--) { // mélange (Fisher-Yates)
    const j = Math.floor(a.suivant() * (i + 1));
    [evenements[i], evenements[j]] = [evenements[j] as Evenement, evenements[i] as Evenement];
  }

  // 2. Si les événements ne tiennent pas dans l'étape : on raidit d'abord les pentes (dans les maxima du type),
  // ce qui raccourcit les côtes ; en dernier recours, on réduit les hauteurs (donc le dénivelé).
  // Un plat commence par la rampe de retour à pente nulle depuis la fin de l'événement précédent : il doit être plus long qu'elle.
  const finDe = (e: Evenement): number => Math.abs((e.descente ?? e).pentes[(e.descente ?? e).pentes.length - 1] as number);
  const gapMin = (liste: readonly Evenement[]): number[] =>
    Array.from({ length: liste.length + 1 }, (_, i) => (i === 0 ? 500 : finDe(liste[i - 1] as Evenement) * RAMPE_M_PAR_UNITE_PENTE + 300));
  /** Part de la place disponible que les événements peuvent occuper : le reste absorbe les côtes agrandies par le suivi du dénivelé. */
  const RESERVE = 0.9;
  const place = (liste: readonly Evenement[]) => RESERVE * (longueur_m - gapMin(liste).reduce((s, x) => s + x, 0));
  let echelle = 1;
  let occupe = Infinity;
  let evs = evenements;
  for (const raideur of [1, 1.15, 1.3, 1.45]) {
    evs = evenements.map((e) => raidir(e, raideur, p));
    occupe = evs.reduce((s, e) => s + longueurEvenement(e, 1, p), 0);
    if (occupe <= place(evs)) break;
  }
  for (let essai = 0; essai < 30 && occupe > place(evs); essai++) {
    echelle *= 0.92;
    occupe = evs.reduce((s, e) => s + longueurEvenement(e, echelle, p), 0);
  }
  if (occupe > place(evs)) return null;

  // 3. Répartition des plats entre les événements (longueurs exponentielles, min GAP_MIN).
  const minimums = gapMin(evs);
  const libre = longueur_m - occupe - minimums.reduce((s, x) => s + x, 0);
  const poidsPlats = Array.from({ length: evs.length + 1 }, () => -Math.log(1 - a.suivant() * 0.999));
  const somme = poidsPlats.reduce((t, x) => t + x, 0);
  const plats = poidsPlats.map((w, i) => (minimums[i] as number) + (libre * w) / somme);

  // 4. Construction. Le plan est rejoué avec des hauteurs recalées sur le dénivelé obtenu jusqu'à tomber sur la cible.
  const pentesPlat = plats.map(() => (a.suivant() - 0.5) * 0.004);
  const bati = (h: number): Constructeur => {
    const c = new Constructeur(z0);
    // La longueur `l` du plat comprend sa rampe d'entrée.
    const plat = (l: number, pt: number) => { const r = c.longueurRampe(pt); c.ouvrir('plat', pt); c.rampeVers(pt); c.palier(Math.max(l - r, 1)); };
    for (let i = 0; i < evs.length && c.s <= longueur_m; i++) {
      plat(plats[i] as number, pentesPlat[i] as number);
      executer(c, evs[i] as Evenement, h, p);
    }
    if (c.s < longueur_m - 1) plat(longueur_m - c.s, pentesPlat[evs.length] as number);
    return c;
  };
  let h = echelle;
  let c = bati(h);
  for (let tour = 0; tour < 8; tour++) {
    const debordement = c.s > longueur_m + 300; // les côtes agrandies ne tiennent plus : on réduit
    if (!debordement && Math.abs(c.dplus - total) <= 0.03 * total) break;
    h = debordement ? h * 0.92 : h * borne(total / Math.max(c.dplus, 1), 0.7, 1.4);
    c = bati(h);
  }

  const marques = c.marques;
  const troncons: TronconProfil[] = marques.map((m, i) => ({
    type: m.type,
    debut_m: i === 0 ? 0 : m.s,
    fin_m: i === marques.length - 1 ? longueur_m : (marques[i + 1] as { s: number }).s,
  }));
  return { morceaux: c.morceaux, troncons, dplus: c.dplus, z0 };
}

/** Coupe les morceaux à `longueur_m` et recalcule les tronçons correspondants. */
function couper(morceaux: readonly Morceau[], troncons: readonly TronconProfil[], longueur_m: number): { morceaux: Morceau[]; troncons: TronconProfil[] } {
  const m: Morceau[] = [];
  for (const x of morceaux) {
    if (x.s0 >= longueur_m) break;
    if (x.s1 <= longueur_m) m.push(x);
    else {
      const f = (longueur_m - x.s0) / (x.s1 - x.s0);
      m.push({ ...x, s1: longueur_m, p1: x.p0 + (x.p1 - x.p0) * f });
    }
  }
  const t: TronconProfil[] = [];
  for (const x of troncons) {
    if (x.debut_m >= longueur_m) break;
    t.push({ ...x, fin_m: Math.min(x.fin_m, longueur_m) });
  }
  return { morceaux: m, troncons: fusionnerCourts(t) };
}

/** Un tronçon de moins de TRONCON_MIN_M est absorbé par son voisin (le précédent, ou le suivant pour le premier). */
function fusionnerCourts(troncons: readonly TronconProfil[]): TronconProfil[] {
  const t = [...troncons];
  for (let i = 0; i < t.length && t.length > 1;) {
    const x = t[i] as TronconProfil;
    if (x.fin_m - x.debut_m >= TRONCON_MIN_M) { i++; continue; }
    if (i === 0) t[1] = { ...(t[1] as TronconProfil), debut_m: x.debut_m };
    else t[i - 1] = { ...(t[i - 1] as TronconProfil), fin_m: x.fin_m };
    t.splice(i, 1);
    i = Math.max(0, i - 1);
  }
  return t;
}

export interface AnalyseProfil {
  readonly deniveleParKm_m: number;
  readonly penteMax_ratio: number;
  readonly penteMin_ratio: number;
  readonly altitudeMin_m: number;
  readonly altitudeMax_m: number;
  /** Variation de pente maximale mesurée (par mètre) entre deux morceaux, calculée analytiquement. */
  readonly variationPenteMax_par_m: number;
}

export function mesurerProfil(profil: Pick<Profil, 'altitude' | 'pente' | 'longueur_m'>): AnalyseProfil {
  let dplus = 0;
  let pMax = -Infinity, pMin = Infinity, zMin = Infinity, zMax = -Infinity;
  let precedent = profil.altitude(0);
  for (let s = PAS_DENIVELE_M; s <= profil.longueur_m + 1e-9; s += PAS_DENIVELE_M) {
    const z = profil.altitude(Math.min(s, profil.longueur_m));
    dplus += Math.max(0, z - precedent);
    precedent = z;
    zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    const q = profil.pente(Math.min(s, profil.longueur_m));
    pMax = Math.max(pMax, q); pMin = Math.min(pMin, q);
  }
  return {
    deniveleParKm_m: dplus / (profil.longueur_m / 1000),
    penteMax_ratio: pMax, penteMin_ratio: pMin, altitudeMin_m: zMin, altitudeMax_m: zMax,
    variationPenteMax_par_m: VARIATION_PENTE_MAX_PAR_M,
  };
}

/** Critères du tableau de l'UF 2.3 que ce profil ne respecte pas (vide = conforme). */
export function ecartsProfil(profil: Profil): string[] {
  const p = PARAMETRES_PROFIL[profil.type];
  const m = mesurerProfil(profil);
  const e: string[] = [];
  if (m.penteMax_ratio > p.penteMaxMontee_ratio + 1e-9) e.push('pente max en montée');
  if (m.penteMin_ratio < -p.penteMaxDescente_ratio - 1e-9) e.push('pente max en descente');
  if (m.deniveleParKm_m < p.deniveleParKm_m[0] || m.deniveleParKm_m > p.deniveleParKm_m[1]) e.push('dénivelé par km');
  if (m.altitudeMin_m < 0) e.push('altitude négative');
  if (m.altitudeMax_m > p.altitudeMax_m) e.push('altitude max');
  const t = profil.troncons;
  if (t.length === 0 || (t[0] as TronconProfil).debut_m !== 0 || Math.abs((t[t.length - 1] as TronconProfil).fin_m - profil.longueur_m) > 1e-6) e.push('couverture des tronçons');
  for (let i = 0; i < t.length; i++) {
    const x = t[i] as TronconProfil;
    if (i > 0 && Math.abs(x.debut_m - (t[i - 1] as TronconProfil).fin_m) > 1e-9) e.push('trou ou chevauchement');
    if (x.fin_m - x.debut_m < TRONCON_MIN_M) e.push('tronçon trop court');
    if (x.type === 'col' && !p.colsAutorises) e.push('col interdit');
  }
  return [...new Set(e)];
}

/**
 * Génère le profil d'une étape (UF 2.3) : altitude, pente et tronçons nommés.
 * Même `alea` dans le même état, mêmes paramètres : même profil.
 */
export function genererProfil(type: TypeEtape, longueur_m: number, alea: Alea): Profil {
  if (!(longueur_m >= 1000)) throw new Error('Longueur d\'étape trop courte');
  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative++) {
    const r = construire(type, longueur_m, alea);
    if (!r) continue;
    const { morceaux, troncons } = couper(r.morceaux, r.troncons, longueur_m);
    const profil: Profil = {
      type, longueur_m, troncons, denivelePositif_m: 0, tentatives: tentative,
      altitude(s_m) { const { m, d } = evaluer(morceaux, s_m); const l = m.s1 - m.s0; return m.z0 + m.p0 * d + ((m.p1 - m.p0) / l) * d * d / 2; },
      pente(s_m) { const { m, d } = evaluer(morceaux, s_m); return m.p0 + ((m.p1 - m.p0) / (m.s1 - m.s0)) * d; },
    };
    if (ecartsProfil(profil).length > 0) continue;
    return { ...profil, denivelePositif_m: mesurerProfil(profil).deniveleParKm_m * (longueur_m / 1000), altitude: profil.altitude, pente: profil.pente };
  }
  throw new Error(`Profil impossible (${type}, ${longueur_m} m) après ${TENTATIVES_MAX} tentatives`);
}
