/* Validation statistique du POC v0.0.1 (§6.6) : lance N courses sans affichage et vérifie les 5 critères. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { ARCHETYPE_LABEL, creerMonde, simuler, INTENTIONS } from '@pedale/sim';
import type { Archetype, Intention } from '@pedale/sim';

const arg = (name: string, def: string) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1]! : def; };
const N = Number(arg('n', '300')), SEED0 = Number(arg('seed0', '1'));
const VENT = arg('vent', 'fixe') as 'fixe' | 'face', ROUTE = arg('route', 'courbes') as 'courbes' | 'droite';
const ARCHS = Object.keys(ARCHETYPE_LABEL) as Archetype[];
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) : '0') + ' %';
const moy = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

interface Course {
  seed: number; survit: boolean; gagnant: Archetype | null; ecartInit: number; distance: number; vent: number;
  changements: number; leaders: number; maxStreak: number; duree: number;
  attaques: number; maxAttaquesParCoureur: number; laches: number; cuits: number;
  partTete: Record<Archetype, number>; attaquesParArch: Record<Archetype, number>;
  decisions: number; decisionsScoreNegatif: number; relaisSansRaison: number;
  nbArrives: number; sprinteurDansLesDeux: boolean; sprintGagnantSprinteurPresent: boolean;
  distanceReprise: number | null;
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
  const nonSprint = w.events.filter((e) => e.type === 'attaque').length;
  const parRider = new Map<number, number>();
  for (const e of w.events) if (e.type === 'attaque' && e.riderId !== null) parRider.set(e.riderId, (parRider.get(e.riderId) ?? 0) + 1);
  let neg = 0, sansRaison = 0;
  for (const d of w.trace) {
    const ev = d.evaluations.find((e) => e.intention === d.intention)!;
    if (ev.score < 0) neg++;
    if (d.intention === 'relais' && ev.score < 1) sansRaison++;
  }
  const win = w.result.vainqueur !== null ? w.riders[w.result.vainqueur]! : null;
  const spr = w.riders.filter((r) => r.archetype === 'sprinteur');
  courses.push({
    seed, survit: w.result.echappeeSurvit, gagnant: win ? win.archetype : null, ecartInit: w.cfg.ecartInit, distance: w.cfg.distance, vent: w.cfg.vent,
    changements: w.changementsDeTete, leaders: w.riders.filter((r) => r.stats.relaisPris > 0).length,
    maxStreak: Math.max(...w.riders.map((r) => r.stats.maxLeadStreak)), duree: w.result.tFin,
    attaques: nonSprint, maxAttaquesParCoureur: Math.max(0, ...parRider.values()),
    laches: w.events.filter((e) => e.type === 'lache').length, cuits: w.events.filter((e) => e.type === 'cuit').length,
    partTete: Object.fromEntries(ARCHS.map((a) => [a, totalLead ? partTete[a] / totalLead : 0])) as Record<Archetype, number>,
    attaquesParArch, decisions: w.trace.length, decisionsScoreNegatif: neg, relaisSansRaison: sansRaison,
    nbArrives: w.result.ordre.length, sprinteurDansLesDeux: spr.length >= 2, sprintGagnantSprinteurPresent: win?.archetype === 'sprinteur',
    distanceReprise: w.result.distanceReprise,
  });
}

/* ------------------------------ rapport ------------------------------ */
const surv = courses.filter((c) => c.survit);
console.log(`\n# Batch POC — ${N} courses (seeds ${SEED0}…${SEED0 + N - 1}), vent ${VENT}, route ${ROUTE}, en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

console.log('## 3. Survie / reprise de l’échappée');
console.log(`Survie globale : ${pct(surv.length, N)}`);
const buckets: [string, (c: Course) => boolean][] = [
  ['écart < 75 s', (c) => c.ecartInit < 75], ['75–100 s', (c) => c.ecartInit >= 75 && c.ecartInit < 100], ['≥ 100 s', (c) => c.ecartInit >= 100],
];
for (const [n, f] of buckets) { const g = courses.filter(f); console.log(`  - ${n.padEnd(14)} survie ${pct(g.filter((c) => c.survit).length, g.length)} (${g.length} courses)`); }
const bd: [string, (c: Course) => boolean][] = [['distance < 19 km', (c) => c.distance < 19000], ['≥ 19 km', (c) => c.distance >= 19000]];
for (const [n, f] of bd) { const g = courses.filter(f); console.log(`  - ${n.padEnd(16)} survie ${pct(g.filter((c) => c.survit).length, g.length)} (${g.length} courses)`); }
const rep = courses.filter((c) => !c.survit && c.distanceReprise !== null);
console.log(`  - reprises : à ${(moy(rep.map((c) => c.distanceReprise!)) / 1000).toFixed(1)} km de l'arrivée en moyenne`);

console.log('\n## 1. Rotations de relais (sans avoir été écrites)');
console.log(`Changements de tête / course : ${moy(courses.map((c) => c.changements)).toFixed(0)} en moyenne (durée moyenne ${(moy(courses.map((c) => c.duree)) / 60).toFixed(0)} min)`);
console.log(`Coureurs distincts ayant pris la tête : ${moy(courses.map((c) => c.leaders)).toFixed(1)} / 8 ; plus longue séquence en tête : ${moy(courses.map((c) => c.maxStreak)).toFixed(0)} s en moyenne, max ${Math.max(...courses.map((c) => c.maxStreak)).toFixed(0)} s`);
console.log(`Courses avec ≥ 5 coureurs différents en tête : ${pct(courses.filter((c) => c.leaders >= 5).length, N)}`);

console.log('\n## 2. Les quatre profils se comportent différemment');
console.log('| Profil | part du temps en tête | attaques/course | victoires (échappée arrivée) |');
console.log('|---|---|---|---|');
for (const a of ARCHS) {
  const part = moy(courses.map((c) => c.partTete[a])) * 100;
  const att = moy(courses.map((c) => c.attaquesParArch[a]));
  console.log(`| ${ARCHETYPE_LABEL[a]} | ${part.toFixed(0)} % (équitable = 25 %) | ${att.toFixed(2)} | ${pct(surv.filter((c) => c.gagnant === a).length, surv.length)} |`);
}

console.log('\n## 5. Sprint');
console.log(`Le sprinteur gagne dans ${pct(surv.filter((c) => c.gagnant === 'sprinteur').length, surv.length)} des arrivées d'échappée (2 sprinteurs sur 8 → hasard pur = 25 %).`);
console.log(`Courses où il y a eu un sprint à ≥ 2 : ${pct(surv.filter((c) => c.nbArrives >= 2).length, surv.length)}`);

console.log('\n## 4. Absurdités');
const solo = courses.filter((c) => c.maxStreak > 240);
const storm = courses.filter((c) => c.attaques > 8 || c.maxAttaquesParCoureur > 4);
console.log(`Quelqu'un roule seul > 4 min en continu : ${pct(solo.length, N)} des courses`);
console.log(`Orage d'attaques (> 8 attaques ou > 4 par le même coureur) : ${pct(storm.length, N)}`);
console.log(`Attaques par course : ${moy(courses.map((c) => c.attaques)).toFixed(1)} ; lâchés : ${moy(courses.map((c) => c.laches)).toFixed(1)} ; coureurs cuits : ${moy(courses.map((c) => c.cuits)).toFixed(1)}`);
const dec = courses.reduce((s, c) => s + c.decisions, 0), neg = courses.reduce((s, c) => s + c.decisionsScoreNegatif, 0), sr = courses.reduce((s, c) => s + c.relaisSansRaison, 0);
console.log(`Changements d'intention : ${dec} ; avec un score négatif (choix « par défaut ») : ${pct(neg, dec)} ; « Prendre un relais » à score < 1 : ${sr}`);

if (process.argv.includes('--json')) {
  mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../out/batch.json', import.meta.url), JSON.stringify(courses, null, 1));
}
void INTENTIONS; void ({} as Intention);
