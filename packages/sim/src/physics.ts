import type { Rider } from './types';
import { clamp } from './util';

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
export const E_CUIT = 0.12;         // seuil « sans réserve » (§6.3 Veto)
export const X_MIN = 0.15;          // explosivité minimale pour attaquer / suivre

/** Part de la puissance disponible en soutenu selon la réserve d'endurance. */
export const capf = (E: number) => 0.62 + 0.38 * clamp(E / 0.4, 0, 1);

export const capSoutenu = (r: Rider) => r.profile.ftp * capf(r.E);

/** Puissance maximale utilisable en effort explosif (au-dessus du FTP, limitée par l'explosivité restante). */
export function capExplosif(r: Rider): number {
  const s = capSoutenu(r);
  if (r.X < 0.02) return s;
  const k = Math.pow(clamp(r.X / 0.3, 0, 1), 0.6);
  const fE = 0.85 + 0.15 * clamp(r.E / 0.3, 0, 1);
  return Math.max(s, r.profile.ftp + (r.profile.pPeak * fE - r.profile.ftp) * k);
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
  return 0.5 * RHO * r.profile.cda * (1 - draft) * air * along + CRR * r.profile.mass * G;
}

/** Puissance nécessaire pour tenir `vTarget` en partant de `v` (bilan de forces + accélération demandée).
 *  Négative = il faut freiner (puissance « de freinage » : −m·v·décélération supplémentaire). */
export function puissanceVers(vTarget: number, v: number, r: Rider, aMax = 1.2, frein = 0): number {
  // frein = 0 : on ne peut que lever le pied (décélération naturelle) ; frein > 0 : on peut aussi freiner (suiveur qui se rapproche trop)
  const acc = clamp(1.0 * (vTarget - v), -(frein || aMax), aMax);
  return (resistance(v, r.draft, r) + r.profile.mass * acc) * Math.max(v, 2);
}

/** Vitesse d'équilibre en solo pour une puissance donnée (bissection). */
export function vitesseSolo(power: number, cda: number, mass: number, vent: number): number {
  let lo = 0, hi = 30;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const air = Math.max(0, mid + vent);
    const p = (0.5 * RHO * cda * air * air + CRR * mass * G) * mid;
    if (p > power) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Tangente de l'angle du vent relatif vu par un coureur (le sillage dérive du côté où va l'air). */
export const tanVent = (r: Rider) => clamp(r.cw / Math.max(2, r.v + r.hw), -1.2, 1.2);

/** Aspiration : paramètres du modèle (une seule source de vérité, utilisée aussi par l'affichage). docs/v0.0.2-aspiration.md.
 *  Réduction de traînée apportée par UN coureur devant, en cloche latérale qui s'élargit en aval :
 *    A · e^(−x/L) · e^(−y² / 2σ(x)²),  σ(x) = σ0 + k·x
 *  (x = écart entre roues, y = décalage latéral par rapport à son sillage).
 *  Centre : 0,5 m ≈ 38 %, 1 m ≈ 32 %, 3 m ≈ 16 %, 6 m ≈ 6 %. Sommet plat : 0,2 m de décalage coûte peu ; à 0,5 m il reste ≈ 40 % du gain ; au-delà de 0,9 m, presque plus rien.
 *  Cumul multiplicatif de 3 coureurs au plus, plafond 48 %. */
export const ASPIRATION = { base: 0.45, longueur: 3.0, sigma0: 0.35, sigmaPente: 0.03, plafond: 0.48, portee: 14, nbMax: 3 };
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
  const ds: number[] = [];
  for (const o of others) {
    if (o === self || o.status !== 'course') continue;
    const gap = o.x - self.x - RIDER_LEN;
    if (o.x <= self.x || gap > ASPIRATION.portee) continue;
    const dy = Math.abs(self.y - (o.y + Math.max(gap, 0) * tb));
    const d = aspirationValeur(gap, dy);
    if (d > 0) ds.push(d);
  }
  // cumul multiplicatif des sillages les plus forts : 1 − Π(1 − dᵢ)
  ds.sort((a, b) => b - a);
  let reste = 1;
  for (let i = 0; i < Math.min(ASPIRATION.nbMax, ds.length); i++) reste *= 1 - ds[i]!;
  return Math.min(ASPIRATION.plafond, 1 - reste);
}

/** Mise à jour des réserves (Skiba simplifié pour l'explosivité, usure cubique pour l'endurance). */
export function consommer(r: Rider, p: number, dt: number): void {
  const ftp = r.profile.ftp;
  const ratio = Math.min(p / ftp, 1.3);
  r.E = clamp(r.E - (ratio * ratio * ratio * dt) / r.profile.tEnd, 0, 1);
  if (p > ftp) {
    r.X = clamp(r.X - ((p - ftp) * dt) / r.profile.wPrime, 0, 1);
  } else {
    const tauRec = 240;
    r.X = clamp(r.X + (1 - r.X) * ((ftp - p) / ftp) * (dt / tauRec), 0, 1);
  }
}
