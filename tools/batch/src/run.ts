/* Validation statistique du POC (§6.6) : lance N courses sans affichage et vérifie les critères.
   Huit coureurs, aucun peloton : chacun joue sa course. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { ARCHETYPE_LABEL, ANCRAGES, INTENTION_LABEL, INTENTIONS, NIVEAUX, creerMonde, lecture, simuler } from '@pedale/sim';
import type { Archetype, Attribut, Intention } from '@pedale/sim';

const arg = (name: string, def: string) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1]! : def; };
const N = Number(arg('n', '300')), SEED0 = Number(arg('seed0', '1'));
const VENT = arg('vent', 'fixe') as 'fixe' | 'face', ROUTE = arg('route', 'courbes') as 'courbes' | 'droite';
const ARCHS = Object.keys(ARCHETYPE_LABEL) as Archetype[];
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) : '0') + ' %';
const moy = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const mediane = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : 0; };

interface Course {
  seed: number; gagnant: Archetype; distance: number; vent: number; duree: number; ecart12: number;
  changements: number; leaders: number; maxStreak: number;
  attaques: number; maxAttaquesParCoureur: number; decroches: number; cuits: number;
  partTete: Record<Archetype, number>; attaquesParArch: Record<Archetype, number>;
  decisions: number; decisionsScoreNegatif: number; relaisSansRaison: number; vitesseMoy: number;
  neutralisee: boolean; tempsIntention: Record<Intention, number>; vitesseMin: number;
}

const courses: Course[] = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const seed = SEED0 + i;
  const w = simuler(creerMonde({ seed, trace: 'changements', ventMode: VENT, route: ROUTE }));
  const parArch = <T,>(init: T) => Object.fromEntries(ARCHS.map((a) => [a, init])) as Record<Archetype, T>;
  const partTete = parArch(0), attaquesParArch = parArch(0);
  let totalLead = 0;
  for (const r of w.riders) { partTete[r.archetype] += r.stats.leadTime; attaquesParArch[r.archetype] += r.stats.attaques; totalLead += r.stats.leadTime; }
  const parRider = new Map<number, number>();
  for (const e of w.events) if (e.type === 'attaque' && e.riderId !== null) parRider.set(e.riderId, (parRider.get(e.riderId) ?? 0) + 1);
  let neg = 0, sansRaison = 0;
  for (const d of w.trace) {
    const ev = d.evaluations.find((e) => e.intention === d.intention)!;
    if (ev.score < 0) neg++;
    if (d.intention === 'participer' && ev.score < 1) sansRaison++;
  }
  const o = w.result.ordre, win = w.riders[o[0]!]!;
  courses.push({
    seed, gagnant: win.archetype, distance: w.cfg.distance, vent: w.cfg.vent, duree: w.result.tFin,
    ecart12: w.riders[o[1]!]!.finishTime! - win.finishTime!,
    changements: w.changementsDeTete, leaders: w.riders.filter((r) => r.stats.relaisPris > 0).length,
    maxStreak: Math.max(...w.riders.map((r) => r.stats.maxLeadStreak)),
    attaques: w.events.filter((e) => e.type === 'attaque').length, maxAttaquesParCoureur: Math.max(0, ...parRider.values()),
    decroches: w.events.filter((e) => e.type === 'decroche').length, cuits: w.events.filter((e) => e.type === 'cuit').length,
    partTete: Object.fromEntries(ARCHS.map((a) => [a, totalLead ? partTete[a] / totalLead : 0])) as Record<Archetype, number>,
    attaquesParArch, decisions: w.trace.length, decisionsScoreNegatif: neg, relaisSansRaison: sansRaison,
    vitesseMoy: w.cfg.distance / w.result.tFin * 3.6,
    neutralisee: w.result.neutralisee,
    tempsIntention: Object.fromEntries(INTENTIONS.map((k) => [k, w.riders.reduce((s, r) => s + r.stats.tempsParIntention[k], 0)])) as Record<Intention, number>,
    vitesseMin: Math.min(...w.riders.map((r) => (r.status === 'arrive' && r.finishTime ? w.cfg.distance / r.finishTime * 3.6 : 0))),
  });
}

/* ------------------------------ rapport ------------------------------ */
console.log(`\n# Batch POC — ${N} courses (seeds ${SEED0}…${SEED0 + N - 1}), vent ${VENT}, route ${ROUTE}, en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

console.log('## 3. Déroulement de la course (huit coureurs, pas de peloton)');
console.log(`Durée moyenne ${(moy(courses.map((c) => c.duree)) / 60).toFixed(0)} min, vitesse moyenne ${moy(courses.map((c) => c.vitesseMoy)).toFixed(1)} km/h`);
console.log(`Écart 1er–2e : médiane ${mediane(courses.map((c) => c.ecart12)).toFixed(1)} s ; victoire détachée (> 4 s) : ${pct(courses.filter((c) => c.ecart12 > 4).length, N)} ; arrivée au sprint (< 2 s) : ${pct(courses.filter((c) => c.ecart12 < 2).length, N)}`);
console.log(`Vitesse moyenne selon la distance : < 19 km ${moy(courses.filter((c) => c.distance < 19000).map((c) => c.vitesseMoy)).toFixed(1)} km/h ; ≥ 19 km ${moy(courses.filter((c) => c.distance >= 19000).map((c) => c.vitesseMoy)).toFixed(1)} km/h`);

console.log(`Courses neutralisées (garde-fou : plus personne n'avance) : ${pct(courses.filter((c) => c.neutralisee).length, N)} ; courses lentes (< 30 km/h de moyenne) : ${pct(courses.filter((c) => c.vitesseMoy < 30).length, N)}`);

console.log('\n## 1. Rotations de relais (sans avoir été écrites)');
console.log(`Changements de tête / course : ${moy(courses.map((c) => c.changements)).toFixed(0)} en moyenne`);
console.log(`Coureurs distincts ayant pris la tête : ${moy(courses.map((c) => c.leaders)).toFixed(1)} / 8 ; plus longue séquence en tête : ${moy(courses.map((c) => c.maxStreak)).toFixed(0)} s en moyenne, max ${Math.max(...courses.map((c) => c.maxStreak)).toFixed(0)} s`);
console.log(`Courses avec ≥ 5 coureurs différents en tête : ${pct(courses.filter((c) => c.leaders >= 5).length, N)}`);

console.log('\n## 2. Les quatre profils se comportent différemment');
console.log('| Profil | part du temps en tête | attaques/course | victoires |');
console.log('|---|---|---|---|');
for (const a of ARCHS) {
  console.log(`| ${ARCHETYPE_LABEL[a]} | ${(moy(courses.map((c) => c.partTete[a])) * 100).toFixed(0)} % (équitable = 25 %) | ${moy(courses.map((c) => c.attaquesParArch[a])).toFixed(2)} | ${pct(courses.filter((c) => c.gagnant === a).length, N)} |`);
}

console.log('\n## 5. Sprint');
console.log(`Le sprinteur gagne ${pct(courses.filter((c) => c.gagnant === 'sprinteur').length, N)} des courses (2 sprinteurs sur 8 → hasard pur = 25 %).`);

console.log('\n## 4. Absurdités');
console.log(`Quelqu'un roule seul > 4 min en continu : ${pct(courses.filter((c) => c.maxStreak > 240).length, N)} des courses`);
console.log(`Orage d'attaques (> 8 attaques ou > 4 par le même coureur) : ${pct(courses.filter((c) => c.attaques > 8 || c.maxAttaquesParCoureur > 4).length, N)}`);
console.log(`Attaques par course : ${moy(courses.map((c) => c.attaques)).toFixed(1)} ; décrochages : ${moy(courses.map((c) => c.decroches)).toFixed(1)} ; coureurs cuits : ${moy(courses.map((c) => c.cuits)).toFixed(1)}`);
const dec = courses.reduce((s, c) => s + c.decisions, 0), neg = courses.reduce((s, c) => s + c.decisionsScoreNegatif, 0), sr = courses.reduce((s, c) => s + c.relaisSansRaison, 0);
console.log(`Changements d'intention : ${dec} ; avec un score négatif (choix « par défaut ») : ${pct(neg, dec)} ; « Participer » à score < 1 : ${sr}`);
{
  const tot = courses.reduce((s, c) => s + INTENTIONS.reduce((a, k) => a + c.tempsIntention[k], 0), 0);
  console.log('Part du temps par intention : ' + INTENTIONS.map((k) => `${INTENTION_LABEL[k]} ${pct(courses.reduce((s, c) => s + c.tempsIntention[k], 0), tot)}`).join(' ; '));
}

console.log('\n## 6. Calibration WorldTour des coureurs générés (docs/v0.0.3-attributs.md)');
{
  const ATTRS = Object.keys(ANCRAGES) as Attribut[];
  const lus = Array.from({ length: N }, (_, i) => creerMonde({ seed: SEED0 + i }).riders.map((r) => ({ arch: r.archetype, ...lecture(r.profile) }))).flat();
  console.log('| Attribut | médiane | min – max | répartition par niveau (' + NIVEAUX.join(' / ') + ') |');
  console.log('|---|---|---|---|');
  for (const a of ATTRS) {
    const vals = lus.map((l) => l.valeurs[a]);
    const rep = NIVEAUX.map((_, k) => pct(lus.filter((l) => l.niveaux[a] === k).length, lus.length)).join(' / ');
    const f = (v: number) => (a === 'ftp' ? v.toFixed(2) : v.toFixed(0));
    console.log(`| ${a} (${ANCRAGES[a].unite}) | ${f(mediane(vals))} | ${f(Math.min(...vals))} – ${f(Math.max(...vals))} | ${rep} |`);
  }
  // cohérence : écart de niveau entre le seuil et les autres attributs d'un même coureur
  const ecarts = lus.filter((l) => Math.abs(l.niveaux.ftp - l.niveaux.durabilite) >= 2 || Math.abs(l.niveaux.ftp - l.niveaux.explosivite) >= 3);
  console.log(`Coureurs au profil incohérent (niveau du FTP à ≥ 2 de la durabilité ou ≥ 3 de l'explosivité) : ${pct(ecarts.length, lus.length)}`);
}

if (process.argv.includes('--json')) {
  mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../out/batch.json', import.meta.url), JSON.stringify(courses, null, 1));
}
