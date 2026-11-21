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

export const capSoutenu = (r: Rider) => r.profile.cp * capf(r.E);

/** Puissance maximale utilisable en effort explosif (au-dessus de cp, limitée par l'explosivité restante). */
export function capExplosif(r: Rider): number {
  const s = capSoutenu(r);
  if (r.X < 0.02) return s;
  const k = Math.pow(clamp(r.X / 0.3, 0, 1), 0.6);
  const fE = 0.85 + 0.15 * clamp(r.E / 0.3, 0, 1);
  return Math.max(s, r.profile.cp + (r.profile.pPeak * fE - r.profile.cp) * k);
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

/** Réduction de traînée due aux coureurs devant. Le sillage d'un coureur dérive latéralement avec le vent de côté :
 *  à `gap` mètres derrière lui il est centré à o.y + gap·tanβ. De face : tout droit derrière ; de côté : en éventail. */
export function aspiration(self: Rider, others: Rider[]): number {
  let d1 = 0, d2 = 0;
  const tb = tanVent(self);
  for (const o of others) {
    if (o === self || o.status !== 'course') continue;
    const gap = o.x - self.x - RIDER_LEN;
    if (o.x <= self.x || gap > 14) continue;
    const dy = Math.abs(self.y - (o.y + Math.max(gap, 0) * tb));
    if (dy >= 0.9) continue;
    const d = 0.40 * Math.exp(-Math.max(gap, 0) / 3.5) * (1 - dy / 0.9);
    if (d > d1) { d2 = d1; d1 = d; } else if (d > d2) d2 = d;
  }
  return Math.min(0.48, d1 + 0.25 * d2);
}

/** Mise à jour des réserves (Skiba simplifié pour l'explosivité, usure cubique pour l'endurance). */
export function consommer(r: Rider, p: number, dt: number): void {
  const cp = r.profile.cp;
  const ratio = Math.min(p / cp, 1.3);
  r.E = clamp(r.E - (ratio * ratio * ratio * dt) / r.profile.tEnd, 0, 1);
  if (p > cp) {
    r.X = clamp(r.X - ((p - cp) * dt) / r.profile.wPrime, 0, 1);
  } else {
    const tauRec = 240;
    r.X = clamp(r.X + (1 - r.X) * ((cp - p) / cp) * (dt / tauRec), 0, 1);
  }
}
