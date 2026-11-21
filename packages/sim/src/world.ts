import type { Decision, Intention, Rider, SimEvent, World } from './types';
import { INTENTIONS, INTENTION_LABEL } from './types';
import { agir, decrireAction } from './action';
import {
  aspiration, capExplosif, consommer, E_CUIT, MAX_LAT_SPEED, LAT_ACCEL, LAT_TAU, FREINAGE_MAX, resistance, RIDER_LEN, capSoutenu,
} from './physics';
import { axeY, enLigne, LIMITE } from './placement';
import { distanceSprint, engagement, evaluer, interpreter, percevoir, TUNE } from './mind';
import { clamp } from './util';

const URGENT = new Set(['depart', 'cuit', 'sprint', 'lache', 'rejoint', 'attaque']);

function evt(w: World, type: SimEvent['type'], riderId: number | null, texte: string, grave = false) {
  w.events.push({ t: w.t, type, riderId, texte, grave });
}

/* ------------------------ instantané du groupe ------------------------ */
function instantane(w: World) {
  const actifs = w.riders.filter((r) => r.status === 'course').sort((a, b) => b.x - a.x);
  const groupe: Rider[] = [];
  for (let i = 0; i < actifs.length; i++) {
    const r = actifs[i]!;
    if (i === 0) { groupe.push(r); continue; }
    const seuil = r.inGroup ? 50 : 35;
    if (actifs[i - 1]!.x - r.x <= seuil && groupe[groupe.length - 1] === actifs[i - 1]) groupe.push(r); else break;
  }
  // vent relatif de chaque coureur : le vent est fixe dans le monde, la route tourne
  for (const r of actifs) {
    if (w.cfg.ventMode === 'face') { r.hw = w.cfg.vent; r.cw = 0; continue; }
    const h = w.road.heading(r.x), hx = Math.cos(h), hy = Math.sin(h);
    r.hw = -(w.vent.wx * hx + w.vent.wy * hy);
    r.cw = w.vent.wx * -hy + w.vent.wy * hx;
  }
  // allure du groupe = médiane (un suiveur qui freine un instant ne doit pas tirer l'allure vers le bas)
  const vs = groupe.map((r) => r.v).sort((x, y) => x - y);
  const vitesse = vs.length ? (vs.length % 2 ? vs[(vs.length - 1) / 2]! : (vs[vs.length / 2 - 1]! + vs[vs.length / 2]!) / 2) : 0;
  const ref = groupe.length ? groupe : actifs;
  const cwMoy = ref.length ? ref.reduce((s, r) => s + r.cw, 0) / ref.length : 0;
  const alongMoy = ref.length ? ref.reduce((s, r) => s + r.v + r.hw, 0) / ref.length : 10;
  const tanB = Math.max(-1.2, Math.min(1.2, cwMoy / Math.max(2, alongMoy)));
  const coteMontant: -1 | 1 = Math.abs(cwMoy) < 0.5 ? -1 : cwMoy > 0 ? -1 : 1;   // côté du vent
  const k = Math.max(0, Math.min(1, (Math.abs(tanB) - 0.05) / 0.25));
  const xFront = groupe.length ? groupe[0]!.x : 0;
  const xMoyen = actifs.length ? actifs.reduce((s, r) => s + r.x, 0) / actifs.length : 0;
  w.groupe = { ordre: actifs, groupe, vitesse, meneur: null, queue: groupe[groupe.length - 1] ?? null, xMoyen, xFront, tanB, yTete: coteMontant * k * (LIMITE - 0.5), coteMontant };
  let meneur: Rider | null = null;
  for (const r of groupe) if (enLigne(w, r) && (!meneur || r.x > meneur.x)) meneur = r;
  w.groupe.meneur = meneur;
  for (const r of actifs) {
    r.wasInGroup = r.inGroup;
    r.inGroup = groupe.includes(r);
    if (r.wasInGroup && !r.inGroup) { evt(w, 'lache', r.id, `${r.letter} est lâché`, true); r.intent.forceEval = 'lache'; }
    else if (!r.wasInGroup && r.inGroup) { evt(w, 'rejoint', r.id, `${r.letter} recolle au groupe`); r.intent.forceEval = 'rejoint'; }
  }
}

function suiviDeTete(w: World) {
  const dt = w.cfg.dt, m = w.groupe.meneur;
  for (const r of w.groupe.ordre) r.stats.leadRecent *= Math.exp(-dt / 300);
  const cand = m ? m.id : null;
  if (cand !== w.meneurId) {
    if (cand === w.meneurCandidat) {
      if (cand !== null && w.t - w.meneurCandidatDepuis >= 2) {
        const n = w.riders[cand]!;
        if (w.meneurId !== null) { const o = w.riders[w.meneurId]!; o.stats.maxLeadStreak = Math.max(o.stats.maxLeadStreak, w.t - w.meneurDepuis); }
        w.meneurId = cand; w.meneurDepuis = w.t; w.changementsDeTete++;
        n.stats.relaisPris++; n.stats.leadStreakStart = w.t;
        evt(w, 'tete', cand, `${n.letter} prend la tête`);
      }
    } else { w.meneurCandidat = cand; w.meneurCandidatDepuis = w.t; }
  }
  if (w.meneurId !== null) {
    const r = w.riders[w.meneurId]!;
    if (r.status === 'course') {
      // le meneur ajuste le rythme de l'échappée : plus vite si l'écart fond, plus calme s'il est confortable
      if (r.intent.kind === 'relais' && r.intent.phase === 'tete') {
        const cible = Math.max(40, 0.75 * w.cfg.ecartInit);
        const vMax = w.groupe.groupe.reduce((m, o) => Math.max(m, o.v), 0);
        // l'allure visée ne suit jamais la vitesse mesurée vers le bas (spirale) ; elle ne dépasse pas ce que le groupe sait faire
        w.vRef = clamp(w.vRef + 0.00012 * (cible - w.ecart) * dt, 0.8 * w.vRef0, Math.max(0.8 * w.vRef0, vMax + 0.6));
      }
      r.stats.leadTime += dt; r.stats.leadRecent += dt;
      r.stats.maxLeadStreak = Math.max(r.stats.maxLeadStreak, w.t - w.meneurDepuis);
    } else { w.meneurId = null; }
  }
}

/* ------------------------ décision ------------------------ */
function decider(w: World, r: Rider, declencheur: string) {
  const it = r.intent;
  const { percu, reel } = percevoir(w, r);
  const interp = interpreter(percu);
  const evals = evaluer(w, r, percu, interp);
  const valides = evals.filter((e) => e.vetos.length === 0);
  let best = valides[0];
  for (const e of valides) if (!best || e.score > best.score + 1e-9) best = e;
  const cur = it.kind ? evals.find((e) => e.intention === it.kind) : undefined;
  let choisie: Intention = best ? best.intention : 'gerer';
  if (cur && cur.vetos.length === 0 && best && best.intention !== cur.intention && best.score < cur.score + TUNE.hysteresis) choisie = cur.intention;
  const ev = evals.find((e) => e.intention === choisie)!;
  const precedente = it.kind;
  const change = precedente !== choisie;
  // à moins de 600 m, toute attaque est de fait un sprint (pas d'« écart » à tenter sur un sprint)
  const sprintRaison = ev.raisons.some((q) => q.id === 'sprint' && q.valeur > 0) || (choisie === 'attaquer' && percu.course.distRestante <= 600);

  if (change) {
    it.kind = choisie; it.since = w.t; it.phase = ''; it.phaseSince = w.t; it.sprint = false; it.cible = null;
    if (choisie === 'relais') it.phase = 'passe';
    if (choisie === 'rabattre') it.phase = 'decale';
    if (choisie === 'attaquer') {
      it.phase = 'burst';
      it.sprint = sprintRaison;
      r.stats.attaques++; r.stats.lastAttackT = w.t;
      // un lanceur de sprint est aussi une « attaque » à suivre : les autres sautent dans sa roue (à l'abri) jusqu'à leur propre lancement
      w.attaque = { id: r.id, t: w.t };
      if (sprintRaison) {
        if (!w.sprintLance) { w.sprintLance = true; evt(w, 'sprint', r.id, `${r.letter} lance le sprint`, true); }
      } else {
        evt(w, 'attaque', r.id, `${r.letter} attaque à ${(Math.max(0, w.finishX - r.x) / 1000).toFixed(1)} km de l'arrivée`, true);
      }
      for (const o of w.riders) if (o !== r && o.status === 'course' && !(o.intent.kind === 'attaquer' && o.intent.sprint)) o.intent.forceEval = 'attaque';
    }
    if (choisie === 'suivre') it.cible = percu.groupe.attaque ? percu.groupe.attaque.id : null;
  } else if (choisie === 'attaquer' && sprintRaison) {
    it.sprint = true;
  }
  it.commitUntil = it.sprint ? Infinity : w.t + engagement(r, choisie);
  it.nextEval = w.t + TUNE.intervalleBase * (1 - 0.4 * r.profile.experience);
  it.forceEval = null;

  const dec: Decision = {
    t: w.t, riderId: r.id, letter: r.letter, archetype: r.archetype, distRestante: percu.course.distRestante,
    declencheur, percu, reel, interprete: interp,
    evaluations: evals, precedente, intention: choisie, change, raisons: ev.raisons.slice().sort((a, b) => Math.abs(b.valeur) - Math.abs(a.valeur)),
    action: decrireAction(w, r, choisie), engagementJusqua: it.commitUntil,
  };
  r.last = dec;
  if (w.cfg.trace === 'complet' || (w.cfg.trace === 'changements' && (change || declencheur === 'depart'))) w.trace.push(dec);
}

function decisions(w: World) {
  for (const r of w.groupe.ordre) {
    const it = r.intent;
    // événements propres au coureur
    if (!r.cuit && r.E < E_CUIT) { r.cuit = true; evt(w, 'cuit', r.id, `${r.letter} est à bout de réserves`); it.forceEval = 'cuit'; }
    const d = w.finishX - r.x - 0.9;
    if (d <= distanceSprint(r) && !it.sprint && it.kind !== null && !(it.kind === 'attaquer' && it.sprint)) it.forceEval = 'sprint';
    let trigger: string | null = null;
    if (it.kind === null) trigger = 'depart';
    else if (it.forceEval) trigger = it.forceEval;
    else if (w.t >= it.nextEval) trigger = 'periodique';
    if (!trigger) continue;
    if (it.kind !== null && w.t < it.commitUntil && !URGENT.has(trigger)) { it.forceEval = null; continue; }
    decider(w, r, trigger);
  }
}

/* ------------------------ physique ------------------------ */
function physique(w: World) {
  const dt = w.cfg.dt;
  const act = w.groupe.ordre;
  for (const r of act) r.draft = aspiration(r, act);
  const cmds = act.map((r) => ({ r, c: agir(w, r) }));
  for (const { r, c } of cmds) {
    const pFrein = -r.profile.mass * Math.max(r.v, 2) * FREINAGE_MAX;
    const pRaw = clamp(c.p, pFrein, capExplosif(r));     // < 0 : freinage
    const p = Math.max(0, pRaw);
    // bilan de forces : m·a = P/v − F
    const acc = (pRaw / Math.max(r.v, 2) - resistance(r.v, r.draft, r)) / r.profile.mass;
    r.v = Math.max(0, r.v + acc * dt);
    // vitesse sol → avancement le long de la ligne centrale : à l'intérieur d'un virage on parcourt moins de distance
    r.x += (r.v * dt) / Math.max(0.5, 1 - w.road.courbure(r.x) * r.y);
    // posture visible (cocottes / bas du cintre / danseuse / écrasé), avec un temps minimal entre deux changements
    let post: 0 | 1 | 2 | 3 = 0;
    if (r.intent.kind === 'attaquer' && (r.intent.sprint || r.intent.phase === 'burst')) post = 2;
    else if (r.E < 0.2) post = 3;
    else if (p > 0.9 * capSoutenu(r) && r.draft < 0.15) post = 1;
    if (post !== r.posture && w.t - r.postureT > 1.5) { r.posture = post; r.postureT = w.t; }
    r.p = p;
    consommer(r, p, dt);
    r.stats.tempsParIntention[r.intent.kind ?? 'abriter'] += dt;
    // déplacement latéral (on n'entre dans la file que s'il y a de la place)
    // trajectoire lissée : consigne filtrée, vitesse latérale bornée, accélération latérale bornée
    r.yTf += (c.yT - r.yTf) * (1 - Math.exp(-dt / LAT_TAU));
    const vyDes = clamp((r.yTf - r.y) / 0.9, -MAX_LAT_SPEED, MAX_LAT_SPEED);
    r.vy += clamp(vyDes - r.vy, -LAT_ACCEL * dt, LAT_ACCEL * dt);
    const ny = Math.max(-LIMITE, Math.min(LIMITE, r.y + r.vy * dt));
    // on n'entre dans la file que s'il y a de la place
    if (!enLigne(w, r, 0.9) && Math.abs(ny - axeY(w, r.x)) < 0.9) {
      const occupe = act.some((o) => o !== r && enLigne(w, o, 0.9) && Math.abs(o.x - r.x) < RIDER_LEN + 0.4);
      if (!occupe) r.y = ny; else r.vy = 0;
    } else r.y = ny;
  }
  // pas de chevauchement : on ne passe pas à travers la roue de devant
  const tri = act.slice().sort((a, b) => b.x - a.x);
  for (let i = 0; i < tri.length; i++) {
    const b = tri[i]!;
    for (let j = 0; j < i; j++) {
      const a = tri[j]!;
      const recouvre = RIDER_LEN + 0.15 - (a.x - b.x);
      // contact doux : on ne « téléporte » plus le coureur de derrière, on le repousse progressivement et on freine
      if (Math.abs(a.y - b.y) < 0.55 && a.x > b.x - 0.01 && recouvre > 0) { b.x -= Math.min(recouvre, 0.35) * 0.5; b.v = Math.min(b.v, a.v - 0.2 * recouvre); }
    }
  }
}

/* ------------------------ peloton, arrivée, reprise ------------------------ */
function peloton(w: World) {
  const dt = w.cfg.dt, p = w.peloton;
  const ecart = w.ecart;
  const accel = 1 + 0.05 * clamp((60 - ecart) / 60, 0, 1) + 0.03 * clamp((12000 - (w.finishX - p.x)) / 12000, 0, 1);
  p.v = w.cfg.vPeloton * accel;
  p.x += p.v * dt;
  w.ecart = w.groupe.ordre.length ? (w.groupe.xMoyen - p.x) / p.v : w.ecart;
  if (Math.round(w.t / dt) % Math.round(5 / dt) === 0) {
    w.gapHistory.push({ t: w.t, gap: w.ecart });
    const ref = w.gapHistory.find((h) => h.t >= w.t - 30 - 1e-6);
    w.tendance = ref && w.t >= 30 ? w.ecart - ref.gap : 0;
  }
  const s = w.seuils;
  const seuil = (cle: 'ecart60' | 'ecart40' | 'ecart25', v: number) => {
    if (!s[cle] && w.ecart < v && w.t > 5) {
      s[cle] = true; evt(w, 'ecart', null, `Le peloton n'est plus qu'à ${Math.round(w.ecart)} s`, v <= 40);
      for (const r of w.groupe.ordre) if (!r.intent.forceEval) r.intent.forceEval = 'ecart';
    }
  };
  seuil('ecart60', 60); seuil('ecart40', 40); seuil('ecart25', 25);
}

function arrivees(w: World) {
  for (const r of w.groupe.ordre) {
    if (r.x + 0.9 >= w.finishX) {
      r.status = 'arrive'; r.finishTime = w.t + w.cfg.dt;
      w.result.ordre.push(r.id);
      if (w.result.ordre.length === 1) evt(w, 'arrivee', r.id, `${r.letter} remporte l'étape !`, true);
      else evt(w, 'arrivee', r.id, `${r.letter} franchit la ligne (${w.result.ordre.length}e)`);
    } else if (w.peloton.x >= r.x) {
      r.status = 'repris'; r.caughtAt = w.t;
      w.result.repris.push(r.id);
      evt(w, 'repris', r.id, `${r.letter} est repris par le peloton`, true);
      w.result.distanceReprise = Math.max(0, w.finishX - r.x);
    }
  }
  if (!w.riders.some((r) => r.status === 'course')) {
    w.result.statut = 'termine'; w.result.tFin = w.t;
    w.result.echappeeSurvit = w.result.ordre.length > 0;
    w.result.vainqueur = w.result.ordre[0] ?? null;
    if (w.result.echappeeSurvit) w.result.distanceReprise = null;
    else evt(w, 'repris', null, "L'échappée est reprise : le peloton gagne", true);
  }
}

/** Un pas de simulation (dt fixe). */
export function pas(w: World): void {
  if (w.result.statut === 'termine') return;
  if (w.t === 0) evt(w, 'depart', null, `${w.riders.length} coureurs à l'avant, ${Math.round(w.ecart)} s d'avance, vent ${w.cfg.ventMode === 'face' ? 'de face' : 'fixe'} ${w.cfg.vent} m/s`);
  instantane(w);
  suiviDeTete(w);
  decisions(w);
  physique(w);
  w.t += w.cfg.dt;
  instantane(w);
  peloton(w);
  arrivees(w);
}

export function simuler(w: World, tMax = 7200): World {
  while (w.result.statut !== 'termine' && w.t < tMax) pas(w);
  return w;
}

export { INTENTIONS, INTENTION_LABEL };
