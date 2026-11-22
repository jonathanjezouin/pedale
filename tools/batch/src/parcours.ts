/* Validation par lot du module de parcours (docs/v0.0.4-parcours.md §6) :
   N étapes par type (distance et seed tirées), contrôle des distributions (D+/km, pentes max), des finales,
   du taux de concordance entre le type demandé et le type lu par l'évaluateur, et des recoupements du tracé. */
import { FINALES, FOURCHETTES, aUnColDecisif, LIBELLE_TYPE, PAS, TYPES, evaluer, genererParcours, mulberry32, penteMax, violations } from '@pedale/parcours';
import type { Parcours, TypeEtape } from '@pedale/parcours';

const arg = (name: string, def: string) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1]! : def; };
const N = Number(arg('n', '1000')), SEED0 = Number(arg('seed0', '1'));
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0') + ' %';
const q = (a: number[], p: number) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };
const f1 = (v: number) => v.toFixed(1);

console.log(`\n# Validation des parcours — ${N} étapes par type (seeds ${SEED0}…), pas de ${PAS} m\n`);
for (const type of TYPES as readonly TypeEtape[]) {
  const t0 = Date.now(), F = FOURCHETTES[type];
  const r = mulberry32(SEED0 * 31 + TYPES.indexOf(type));
  const lignes: { p: Parcours; dens: number; pm: ReturnType<typeof penteMax>; lu: TypeEtape; v: string[]; classees: number; decisifOk: boolean; recouvre: boolean }[] = [];
  for (let i = 0; i < N; i++) {
    const distance = Math.round((20 + r() * 230) * 1000 / PAS) * PAS;
    const p = genererParcours({ seed: SEED0 + i, distance, type });
    const ev = evaluer(p);
    const classees = ev.montees.filter((m) => m.categorie !== 'bosse');
    // montagne : au moins un col décisif (2e catégorie ou mieux) dans les 40 derniers km, ou le dernier tiers pour une étape courte
    const decisifOk = type !== 'montagne' || aUnColDecisif(ev, p.distance);
    lignes.push({ p, dens: ev.densite, pm: penteMax(p.alt), lu: ev.typeLu, v: violations(p, ev), classees: classees.length, decisifOk, recouvre: !p.sansRecoupement });
  }
  console.log(`## ${LIBELLE_TYPE[type]} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const d = lignes.map((l) => l.dens);
  console.log(`D+ par km : min ${f1(Math.min(...d))} · p10 ${f1(q(d, 0.1))} · médiane ${f1(q(d, 0.5))} · p90 ${f1(q(d, 0.9))} · max ${f1(Math.max(...d))}   (fourchette ${F.dens[0]}-${F.dens[1]})`);
  const dansF = lignes.filter((l) => l.dens >= F.dens[0] * 0.9 && l.dens <= F.dens[1] * 1.1).length;
  console.log(`  dans la fourchette (±10 %) : ${pct(dansF, N)}`);
  const pmM = lignes.map((l) => l.pm.montee), pmD = lignes.map((l) => l.pm.descente);
  console.log(`pente max sur 100 m : montée médiane ${f1(q(pmM, 0.5))} % · p99 ${f1(q(pmM, 0.99))} % · max ${f1(Math.max(...pmM))} % ; descente médiane ${f1(q(pmD, 0.5))} % · max ${f1(Math.max(...pmD))} %   (plafond ${F.penteMax} %)`);
  console.log(`concordance type demandé / type lu : ${pct(lignes.filter((l) => l.lu === type).length, N)}`);
  const premier = lignes.filter((l) => l.p.essais === 1).length, max = lignes.filter((l) => l.p.essais >= 10).length;
  console.log(`conformes au PREMIER tirage (qualité du générateur) : ${pct(premier, N)} · après retirage : ${pct(lignes.filter((l) => l.p.conforme).length, N)} · tirages max utilisés : ${pct(max, N)} · essais moyens ${f1(lignes.reduce((s, l) => s + l.p.essais, 0) / N)}`);
  console.log(`tracé qui se recoupe : ${pct(lignes.filter((l) => l.recouvre).length, N)} ; rayon min médian ${q(lignes.map((l) => l.p.rayonMin), 0.5).toFixed(0)} m`);
  const fin: Record<string, number> = {}; for (const l of lignes) fin[l.p.finale] = (fin[l.p.finale] ?? 0) + 1;
  console.log(`finales tirées : ${FINALES[type].map(([f, w]) => `${f} ${pct(fin[f] ?? 0, N)} (attendu ${Math.round(w * 100)} %)`).join(' · ')}`);
  const cl = lignes.map((l) => l.classees), km = lignes.map((l) => l.p.distance / 1000);
  console.log(`montées classées : ${f1(lignes.reduce((s, l) => s + l.classees, 0) / (km.reduce((s, v) => s + v, 0) / 100))} pour 100 km ; étapes sans aucune : ${pct(cl.filter((c) => c === 0).length, N)}`);
  if (type === 'montagne') console.log(`au moins un col décisif (2e catégorie ou mieux) dans les 40 derniers km (ou le dernier tiers) : ${pct(lignes.filter((l) => l.decisifOk).length, N)}`);
  const viol: Record<string, number> = {}; for (const l of lignes) for (const x of l.v) { const k = x.replace(/[\d.,]+/g, '#'); viol[k] = (viol[k] ?? 0) + 1; }
  if (Object.keys(viol).length) console.log('violations : ' + Object.entries(viol).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} × ${v}`).join(' ; '));
  console.log('');
}
