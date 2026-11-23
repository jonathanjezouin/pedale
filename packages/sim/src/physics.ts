import type { Rider } from './types';
import { clamp } from './util';
import { PLANCHER } from './paliers';

/** Physique simplifiée mais honnête : traînée aérodynamique (avec aspiration), roulement, bilan de forces. */
export const RHO = 1.2;
export const G = 9.81;
export const CRR = 0.004;
export const RIDER_LEN = 1.8;       // m
export const MARGE_BORD = 0.45;     // m : un coureur reste à au moins cette distance du bord de la route
export const MAX_LAT_SPEED = 1.0;   // m/s
export const LAT_ACCEL = 1.3;       // m/s² : un coureur ne change pas de trajectoire d'un coup
export const LAT_TAU = 0.7;         // s : constante de temps du filtre de consigne latérale
export const FREINAGE_MAX = 2.5;    // m/s² de décélération par les freins
/** Deux régimes d'usure de la réserve d'endurance (docs/v0.0.5-pente.md §6).
 *  - fin d'étape du POC : calibrée sur 35 minutes de course (usure en 1/tEnd, en cube de l'effort), conservée telle quelle ;
 *  - étape : sur 4-5 h, la durabilité gouverne. L'usure est 6 fois plus lente et, sous le plancher, elle chute encore (× (effort / plancher)³) :
 *    5 h à 55 % du FTP ne vident pas la réserve. Recalage commun prévu avec la durabilité (v0.0.7). */
export const USURE_FINALE = { echelle: 1, legere: false } as const;
export const USURE_ETAPE = { echelle: 6, legere: true } as const;
export const E_CUIT = 0.12;         // seuil « sans réserve » (§6.3 Veto)
export const X_MIN = 0.15;          // explosivité minimale pour attaquer / suivre

/** Part de la puissance disponible en soutenu selon la réserve d'endurance. */
export const capf = (E: number) => 0.62 + 0.38 * clamp(E / 0.4, 0, 1);

/** Durabilité d'étape (docs/v0.0.7-fatigue.md §2) : au-delà de la falaise de `capf`, la capacité soutenue s'érode progressivement avec l'usure de la réserve
 *  (perte maximale `DUR_PERTE` quand `E` = 0). Seulement en étape : la finale du POC arrive déjà entamée et garde sa falaise. */
export const DUR_PERTE = 0.06;
export const facteurFond = (u: { legere: boolean }, E: number) => (u.legere ? 1 - DUR_PERTE * (1 - E) : 1);
/** Fatigue aiguë F (0..1) : monte au-dessus du plancher, redescend en dessous ; baisse un peu la capacité soutenue. C'est elle qui fait la durée d'un tour de relais. */
export const AIGUE = { montee: 0.085, descente: 0.012, effet: 0.03 };

export const capSoutenu = (r: Rider) => r.profile.ftp * capf(r.E) * facteurFond(r.usure, r.E) * (1 - AIGUE.effet * r.aigue);

/** Décroissance neuromusculaire d'un effort maximal : la puissance qu'on peut produire retombe avec le temps passé au-dessus de 1,25 × FTP
 *  (≈ 100 % de la pointe à 5 s, ≈ 60 % à 15 s, ≈ 45 % à 30 s), en plus de l'épuisement de l'explosivité. Elle se récupère vite quand on relâche. */
export const SPRINT = { seuil: 1.25, tau: 10, plancher: 0.4, recup: 0.5 };
const facteurSprint = (r: Rider) => SPRINT.plancher + (1 - SPRINT.plancher) * Math.exp(-r.tSprint / SPRINT.tau);

/** Puissance maximale utilisable en effort explosif (au-dessus du FTP, limitée par l'explosivité restante et par la décroissance neuromusculaire). */
export function capExplosif(r: Rider): number {
  const s = capSoutenu(r);
  if (r.X < 0.02) return s;
  const k = Math.pow(clamp(r.X / 0.3, 0, 1), 0.6);
  const fE = 0.85 + 0.15 * clamp(r.E / 0.3, 0, 1);
  return Math.max(s, r.profile.ftp + (r.profile.pPeak * fE - r.profile.ftp) * k * facteurSprint(r));
}

/** Conversion d'un effort (part du FTP) en watts : ce que le coureur vise, borné par ce que la physique lui permet
 *  (réserve d'endurance en dessous du FTP, explosivité au-dessus). C'est le « geste » d'Agir ; le choix de l'effort est dans Vouloir. */
export function wattsPour(r: Rider, effort: number): number {
  return Math.min(effort * r.profile.ftp, effort > 1 ? capExplosif(r) : capSoutenu(r));
}

/** Force de résistance à vitesse v avec une réduction de traînée `draft` (aspiration).
 *  Le vent est décomposé dans le repère du coureur : de face (hw) et de côté (cw).
 *  Composante longitudinale de la traînée : ½ρ·CdA·|a|·(v + hw), avec |a|² = (v + hw)² + cw². */
export function resistance(v: number, draft: number, r: Rider): number {
  const along = v + r.hw;
  const air = Math.sqrt(along * along + r.cw * r.cw);
  return 0.5 * RHO * r.profile.cda * (1 - draft) * air * along + forcePenteRoulement(r.pente, r.profile.mass);
}

/** Roulement et gravité sur une pente `g` (fraction, > 0 en montée) : m·g·(Crr·cos θ + sin θ). Négative en descente raide : la gravité pousse (docs/v0.0.5-pente.md §3). */
export function forcePenteRoulement(g: number, mass: number): number {
  const n = Math.sqrt(1 + g * g);
  return mass * G * (CRR / n + g / n);
}

/** Puissance nécessaire pour tenir `vTarget` en partant de `v` (bilan de forces + accélération demandée).
 *  Négative = il faut freiner (puissance « de freinage » : −m·v·décélération supplémentaire). */
export function puissanceVers(vTarget: number, v: number, r: Rider, aMax = 1.2, frein = 0): number {
  // frein = 0 : on ne peut que lever le pied (décélération naturelle) ; frein > 0 : on peut aussi freiner (suiveur qui se rapproche trop)
  const acc = clamp(1.0 * (vTarget - v), -(frein || aMax), aMax);
  return (resistance(v, r.draft, r) + r.profile.mass * acc) * Math.max(v, 2);
}

/** Vitesse d'équilibre en solo pour une puissance donnée (bissection). */
export function vitesseSolo(power: number, cda: number, mass: number, vent: number, pente = 0): number {
  let lo = 0, hi = 30;
  const fPente = forcePenteRoulement(pente, mass);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const air = Math.max(0, mid + vent);
    const p = (0.5 * RHO * cda * air * air + fPente) * mid;
    if (p > power) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Tangente de l'angle du vent relatif vu par un coureur (le sillage dérive du côté où va l'air). */
export const tanVent = (r: Rider) => clamp(r.cw / Math.max(2, r.v + r.hw), -1.2, 1.2);

/** Aspiration : paramètres du modèle (une seule source de vérité, utilisée aussi par l'affichage). docs/v0.0.2-aspiration.md, docs/v0.1.2-groupe.md §3.
 *  Réduction de traînée apportée par UN coureur devant, en cloche latérale qui s'élargit en aval (un cône) :
 *    A · e^(−x/L) · e^(−y² / 2σ(x)²),  σ(x) = σ0 + k·x
 *  (x = écart entre roues, y = décalage latéral par rapport à son sillage).
 *  Sur l'axe : 0,5 m ≈ 36 %, 1 m ≈ 34 %, 3 m ≈ 21 %, 6 m ≈ 10 %, 10 m ≈ 4 %. À 0,5 m de décalage il reste ≈ 50 % du gain.
 *  v0.1.2a : cumul multiplicatif de **tous** les sillages à portée (avant : les 3 plus forts), plafond 85 % (avant 48 %) : une position enveloppée par plusieurs
 *  coureurs (triangle, bloc) est mieux abritée que la file indienne. Calibré sur des formations (file : rang 2 ≈ 38 %, rangs 3-4 ≈ 50-56 % ;
 *  triangle ≈ 58 % ; bloc de 8 : suiveurs ≈ 50 % en moyenne, le mieux abrité ≈ 70 %, soit une traînée moyenne de groupe ≈ 0,56). L'abri ne réduit que la traînée
 *  aérodynamique (le roulement reste), voir `resistance`. */
export const ASPIRATION = { base: 0.44, longueur: 4.0, sigma0: 0.40, sigmaPente: 0.06, plafond: 0.85, portee: 20 };
const sigmaAspiration = (ecart: number) => ASPIRATION.sigma0 + ASPIRATION.sigmaPente * Math.max(ecart, 0);
export function aspirationValeur(ecart: number, dy: number): number {
  if (ecart > ASPIRATION.portee) return 0;
  const s = sigmaAspiration(ecart);
  const d = ASPIRATION.base * Math.exp(-Math.max(ecart, 0) / ASPIRATION.longueur) * Math.exp(-(dy * dy) / (2 * s * s));
  return d < 0.003 ? 0 : d;
}

/** Réduction de traînée due aux coureurs devant. Le sillage d'un coureur dérive latéralement avec le vent de côté :
 *  à `gap` mètres derrière lui il est centré à o.y + gap·tanβ. De face : tout droit derrière ; de côté : en éventail. */
export function aspiration(self: Rider, others: Rider[]): number {
  const tb = tanVent(self);
  let reste = 1;
  for (const o of others) {
    if (o === self || o.status !== 'course') continue;
    const gap = o.x - self.x - RIDER_LEN;
    if (o.x <= self.x || gap > ASPIRATION.portee) continue;
    const dy = Math.abs(self.y - (o.y + Math.max(gap, 0) * tb));
    const d = aspirationValeur(gap, dy);
    if (d > 0) reste *= 1 - d;          // cumul multiplicatif : 1 − Π(1 − dᵢ)
  }
  return Math.min(ASPIRATION.plafond, 1 - reste);
}

/** Mise à jour des réserves (Skiba simplifié pour l'explosivité, usure cubique pour l'endurance). */
export function consommer(r: Rider, p: number, dt: number): void {
  const ftp = r.profile.ftp;
  if (p > SPRINT.seuil * ftp) r.tSprint += dt; else r.tSprint = Math.max(0, r.tSprint - SPRINT.recup * dt);
  const ratio = Math.min(p / ftp, 1.3);
  // usure en cube de l'effort ; sous le plancher elle chute encore (coût × (effort / plancher)³) : 5 h à 55 % du FTP ne vident pas la réserve (docs/v0.0.5-pente.md §6)
  const leger = r.usure.legere && ratio < PLANCHER ? Math.pow(ratio / PLANCHER, 3) : 1;
  r.E = clamp(r.E - (ratio * ratio * ratio * leger * dt) / (r.profile.tEnd * r.usure.echelle), 0, 1);
  // fatigue aiguë : monte au-dessus du plancher, redescend en dessous (plus vite qu'on ne l'a chargée n'est pas le cas : la récupération prend des minutes)
  r.aigue = clamp(r.aigue + (ratio > PLANCHER ? AIGUE.montee * (ratio - PLANCHER) : -AIGUE.descente * (PLANCHER - ratio)) * dt, 0, 1);
  if (p > ftp) {
    r.X = clamp(r.X - ((p - ftp) * dt) / r.profile.wPrime, 0, 1);
  } else {
    const tauRec = 240;
    r.X = clamp(r.X + (1 - r.X) * ((ftp - p) / ftp) * (dt / tauRec), 0, 1);
  }
}
