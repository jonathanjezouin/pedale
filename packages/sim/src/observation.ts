/* =====================================================================
   Observation : la partie continue de « Percevoir » (docs/v0.0.3-comportement.md §4.7).
   Une fois par seconde, chaque coureur regarde autour de lui : il voit les autres à portée (positions et vitesses bruitées,
   posture), retient qui a roulé devant et qui accélère fort, perçoit l'allure du groupe. Il ne voit jamais le profil,
   la réserve ou les intentions des autres : il les déduit de ce qu'il a observé.
   Bruit et délai (≈ 1 s) vivent ici ; l'expérience réduit le bruit.
   ===================================================================== */
import type { Rider, Souvenir, VuAutre, World } from './types';
import { abrite, enLigne } from './placement';
import { clamp } from './util';

export const OBS_PERIODE = 1;          // s entre deux observations
export const VUE_DEVANT = 45;          // m : on voit les coureurs jusqu'à 45 m devant
export const VUE_DERRIERE = 15;        // m : et jusqu'à 15 m derrière (on se retourne, on entend)

/** Bruit gaussien (Box-Muller) tiré du flux propre au coureur. */
export function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Niveau de bruit d'un coureur : 1 pour un novice, ≈ 0,4 pour un expérimenté. */
export const bruitDe = (r: Rider) => 1.3 - r.profile.experience;

const nouveauSouvenir = (v: number, t: number): Souvenir => ({ vu: 0, tete: 0, v, accel: 0, accelMax: 0, derniereVue: t });

/** Danger supposé d'un coureur : ce que j'ai vu de ses accélérations (jamais sa pointe). */
export const dangerSuppose = (s: Souvenir | undefined) => (s ? clamp((s.accelMax - 0.35) / 0.9, 0, 1) : 0);

/** Disposition déduite : rouleur (je l'ai vu rouler), suiveur (je l'ai observé longtemps sans le voir rouler), inconnu. */
export function dispositionDe(s: Souvenir | undefined): 'rouleur' | 'suiveur' | 'inconnu' {
  if (!s) return 'inconnu';
  if (s.tete >= 40) return 'rouleur';
  if (s.vu >= 150 && s.tete < 12) return 'suiveur';
  return 'inconnu';
}

/** Observation de tous les coureurs en course (appelée une fois par seconde de simulation). */
export function observer(w: World): void {
  const act = w.vue.ordre;
  for (const r of act) observerUn(w, r, act);
}

function observerUn(w: World, r: Rider, act: Rider[]) {
  const sig = bruitDe(r);
  const dt = OBS_PERIODE;
  const t = w.t;

  // biais durable de la fatigue ressentie (on se croit un peu plus frais ou plus cuit qu'on ne l'est)
  r.biais.reserve = 0.95 * r.biais.reserve + gauss(r.rng) * 0.012 * sig;
  r.biais.explosivite = 0.95 * r.biais.explosivite + gauss(r.rng) * 0.015 * sig;

  // qui est en vue ?
  const visibles = act.filter((o) => o !== r && o.x - r.x < VUE_DEVANT && r.x - o.x < VUE_DERRIERE);
  const vus: VuAutre[] = [];
  for (const o of visibles) {
    const vRel = o.v - r.v + gauss(r.rng) * 0.10 * sig;
    const dx = o.x - r.x + gauss(r.rng) * 0.35 * sig;
    const dy = o.y - r.y + gauss(r.rng) * 0.08 * sig;
    // souvenir : accélération observée, temps en vue
    let s = r.memoire[o.id];
    const vObs = r.v + vRel;
    if (!s || t - s.derniereVue > 4) s = r.memoire[o.id] = nouveauSouvenir(vObs, t);
    const aInst = (vObs - s.v) / Math.max(dt, t - s.derniereVue);
    s.accel = 0.7 * s.accel + 0.3 * aInst;
    s.accelMax = Math.max(s.accelMax * 0.997, s.accel);
    s.v = vObs; s.vu += dt; s.derniereVue = t;
    // l'ai-je vu en tête ? (personne devant lui, parmi ceux que je vois et moi-même, à moins de 10 m dans la file)
    const sansDevant = ![r, ...visibles].some((q) => q !== o && q.x > o.x && q.x - o.x < 10 && Math.abs(q.y - o.y) < 1.3);
    s.tete = s.tete * Math.exp(-dt / 300) + (sansDevant ? dt : 0);
    vus.push({ id: o.id, letter: o.letter, dx, dy, vRel, posture: o.posture, enLigne: enLigne(w, o, 0.9), accel: s.accel });
  }
  r.vus = vus;

  // allure du groupe telle que je la perçois : médiane des vitesses que j'estime, moi compris, parmi ceux de mon groupe en vue
  const groupe = w.vue.groupes.find((g) => g.includes(r)) ?? [r];
  const idsGroupe = new Set(groupe.map((g) => g.id));
  const vitesses = [r.v, ...vus.filter((q) => idsGroupe.has(q.id)).map((q) => r.v + q.vRel)].sort((a, b) => a - b);
  const med = vitesses.length % 2 ? vitesses[(vitesses.length - 1) / 2]! : (vitesses[vitesses.length / 2 - 1]! + vitesses[vitesses.length / 2]!) / 2;
  r.allure.v = r.allure.hist.length ? 0.7 * r.allure.v + 0.3 * med : med;
  r.allure.hist.push(r.allure.v);
  if (r.allure.hist.length > 10) r.allure.hist.shift();
  r.allure.tendance = r.allure.v - r.allure.hist[0]!;

  // devenir le premier est une information : je réévalue
  const enTete = !act.some((o) => o !== r && abrite(w, o, r, 1.0, 1e9));
  if (enTete && !r.enTetePrev) r.intent.forceEval ??= 'tete';
  r.enTetePrev = enTete;

  // une attaque que je crois voir : quelqu'un devant ou à côté qui accélère fort et s'éloigne
  let cand: VuAutre | null = null;
  for (const q of vus) {
    if (q.dx < -2) continue;
    if (q.vRel > 1.2 && (q.accel > 0.3 || q.posture === 2) && (!cand || q.vRel > cand.vRel)) cand = q;
  }
  if (cand) {
    if (!r.attaqueVue || r.attaqueVue.id !== cand.id) { r.attaqueVue = { id: cand.id, t, vu: t }; r.intent.forceEval = 'attaque'; }
    else r.attaqueVue.vu = t;
  } else if (r.attaqueVue && t - r.attaqueVue.vu > 5) r.attaqueVue = null;
}
