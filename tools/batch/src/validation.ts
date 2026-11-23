/* Validation de la v0.1.0 (docs/v0.1.0-validation.md) : des étapes de 20 à 250 km, de chaque type, courues de bout en bout.
   Deux modes : `--worker --type montagne --n 250 --seed0 1 --out f.json` court des étapes ; `--agg f1.json f2.json …` agrège et commente. */
import { writeFileSync, readFileSync } from 'node:fs';
import { ARCHETYPE_LABEL, creerMonde, mulberry32, pas } from '@pedale/sim';
import type { Archetype } from '@pedale/sim';
import { LIBELLE_TYPE, TYPES, genererParcours } from '@pedale/parcours';
import type { TypeEtape } from '@pedale/parcours';

const argv = process.argv;
const arg = (name: string, def: string) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1]! : def; };
const moy = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0') + ' %';
const quant = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0; };

interface Ligne {
  type: TypeEtape; seed: number; km: number; finale: string; duree: number; vitesse: number; termine: boolean; neutralisee: boolean; arrives: number; nan: boolean;
  ecart: number; sprint: boolean; gagnant: Archetype; eMin: number; cuits: number; decrochages: number; calcul: number; tFin: number; tMax: number;
}

if (argv.includes('--worker')) {
  const type = arg('type', 'plate') as TypeEtape, n = Number(arg('n', '10')), seed0 = Number(arg('seed0', '1')), out = arg('out', 'out.json');
  const lignes: Ligne[] = [];
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i, rr = mulberry32(seed * 7919 + 13);
    const km = Math.round(20 + rr() * 230);
    const t0 = Date.now();
    const parcours = genererParcours({ seed, distance: km * 1000, type });
    const w = creerMonde({ seed, parcours });
    while (w.result.statut !== 'termine' && w.t < w.tMax + 600) pas(w);
    const t = w.riders.map((r) => r.finishTime).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const nan = w.riders.some((r) => !Number.isFinite(r.x) || !Number.isFinite(r.E) || !Number.isFinite(r.X) || !Number.isFinite(r.p) || !Number.isFinite(r.v));
    lignes.push({
      type, seed, km, finale: parcours.finale, duree: w.result.tFin / 3600, vitesse: km / (w.result.tFin / 3600), termine: w.result.statut === 'termine', neutralisee: !!w.result.neutralisee,
      arrives: t.length, nan, ecart: t.length > 1 ? (t[t.length - 1]! - t[0]!) / 60 : 0, sprint: t.length > 1 && t[1]! - t[0]! < 2,
      gagnant: w.riders[w.result.ordre[0]!]!.archetype, eMin: Math.min(...w.riders.map((r) => r.E)), cuits: w.riders.filter((r) => r.cuit).length,
      decrochages: w.events.filter((e) => e.type === 'decroche').length, calcul: (Date.now() - t0) / 1000, tFin: w.result.tFin, tMax: w.tMax,
    });
  }
  writeFileSync(out, JSON.stringify(lignes));
} else if (argv.includes('--agg')) {
  const fichiers = argv.slice(argv.indexOf('--agg') + 1);
  const toutes: Ligne[] = fichiers.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as Ligne[]);
  console.log(`# Validation v0.1.0 — ${toutes.length} étapes courues de bout en bout\n`);
  const ordre = Object.keys(ARCHETYPE_LABEL) as Archetype[];
  for (const type of TYPES) {
    const L = toutes.filter((l) => l.type === type), N = L.length;
    if (!N) continue;
    console.log(`## ${LIBELLE_TYPE[type]} (${N} étapes, ${Math.min(...L.map((l) => l.km))} à ${Math.max(...L.map((l) => l.km))} km)`);
    console.log(`- bloquées (neutralisées) ${pct(L.filter((l) => l.neutralisee).length, N)} · non terminées ${pct(L.filter((l) => !l.termine).length, N)} · valeurs non finies ${pct(L.filter((l) => l.nan).length, N)} · coureurs non arrivés ${L.reduce((s, l) => s + (8 - l.arrives), 0)} sur ${8 * N}`);
    console.log(`- vitesse moyenne ${moy(L.map((l) => l.vitesse)).toFixed(1)} km/h (10e-90e centile ${quant(L.map((l) => l.vitesse), 0.1).toFixed(1)}-${quant(L.map((l) => l.vitesse), 0.9).toFixed(1)}) · hors de 20-50 km/h : ${pct(L.filter((l) => l.vitesse < 20 || l.vitesse > 50).length, N)}`);
    console.log(`- durée moyenne ${moy(L.map((l) => l.duree)).toFixed(2)} h (max ${Math.max(...L.map((l) => l.duree)).toFixed(1)} h) · temps de calcul moyen ${moy(L.map((l) => l.calcul)).toFixed(1)} s (max ${Math.max(...L.map((l) => l.calcul)).toFixed(0)} s)`);
    console.log(`- écart premier-dernier : médiane ${quant(L.map((l) => l.ecart), 0.5).toFixed(1)} min (90e centile ${quant(L.map((l) => l.ecart), 0.9).toFixed(1)}) · arrivées au sprint (< 2 s) ${pct(L.filter((l) => l.sprint).length, N)}`);
    console.log(`- réserve minimale à l'arrivée ${(moy(L.map((l) => l.eMin)) * 100).toFixed(0)} % · coureurs cuits par étape ${moy(L.map((l) => l.cuits)).toFixed(2)} · décrochages par étape ${moy(L.map((l) => l.decrochages)).toFixed(0)}`);
    console.log('- victoires : ' + ordre.map((a) => `${ARCHETYPE_LABEL[a]} ${pct(L.filter((l) => l.gagnant === a).length, N)}`).join(' · '));
    for (const [nom, lo, hi] of [['court (< 80 km)', 0, 80], ['moyen (80-160 km)', 80, 160], ['long (> 160 km)', 160, 999]] as const) {
      const S = L.filter((l) => l.km >= lo && l.km < hi); if (!S.length) continue;
      console.log(`  - ${nom} : ${S.length} étapes, ${moy(S.map((l) => l.vitesse)).toFixed(1)} km/h, grimpeurs ${pct(S.filter((l) => l.gagnant === 'grimpeur').length, S.length)}, sprinteurs ${pct(S.filter((l) => l.gagnant === 'sprinteur').length, S.length)}, réserve min ${(moy(S.map((l) => l.eMin)) * 100).toFixed(0)} %`);
    }
    const finales = [...new Set(L.map((l) => l.finale))];
    console.log('- par finale : ' + finales.map((f) => { const S = L.filter((l) => l.finale === f); return `${f} (${S.length}) → sprint ${pct(S.filter((l) => l.sprint).length, S.length)}, grimpeur ${pct(S.filter((l) => l.gagnant === 'grimpeur').length, S.length)}, sprinteur ${pct(S.filter((l) => l.gagnant === 'sprinteur').length, S.length)}`; }).join(' ; '));
    const anomalies = L.filter((l) => l.neutralisee || !l.termine || l.nan || l.vitesse < 20 || l.vitesse > 50);
    if (anomalies.length) console.log('- à regarder : ' + anomalies.slice(0, 8).map((l) => `seed ${l.seed} (${l.km} km, ${l.vitesse.toFixed(1)} km/h${l.neutralisee ? ', neutralisée' : ''}${!l.termine ? ', non terminée' : ''})`).join(' ; '));
    console.log('');
  }
}
