/* Validation de la pente dans la simulation (docs/v0.0.5-pente.md §9) : N étapes par type, générées puis courues par huit coureurs.
   Mesure ce que la v0.0.5 doit obtenir : des étapes qui se terminent, des groupes qui se désagrègent par la pente (et non par un script),
   un abri qui ne vaut presque rien en côte, et des vainqueurs qui dépendent du terrain. */
import { ARCHETYPE_LABEL, creerMonde, pas, resistance, typePhysique, TYPES_PHYSIQUES } from '@pedale/sim';
import type { Archetype, TypePhysique } from '@pedale/sim';
import { LIBELLE_TYPE, TYPES, genererParcours } from '@pedale/parcours';
import type { TypeEtape } from '@pedale/parcours';

const arg = (name: string, def: string) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1]! : def; };
const N = Number(arg('n', '30')), KM = Number(arg('km', '100')), SEED0 = Number(arg('seed0', '1'));
const types = arg('types', TYPES.join(',')).split(',') as TypeEtape[];
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) : '0') + ' %';
const moy = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

console.log(`\n# Étapes courues — ${N} par type, ${KM} km, huit coureurs (seeds ${SEED0}…)\n`);
for (const type of types) {
  const t0 = Date.now();
  const gagnants: Record<string, number> = {}, gagnantsType: Record<string, number> = {};
  const dur: number[] = [], vit: number[] = [], efin: number[] = [], dec: number[] = [], tete20: number[] = [], ecart: number[] = [];
  const etCote: number[] = [], etPlat: number[] = [], drCote: number[] = [], drPlat: number[] = [], vCote: number[] = [], vPlat: number[] = [];
  let neutralisees = 0, sprints = 0;
  for (let i = 0; i < N; i++) {
    const seed = SEED0 + i;
    const parcours = genererParcours({ seed, distance: KM * 1000, type });
    const w = creerMonde({ seed, parcours });
    let vu20 = false;
    while (w.result.statut !== 'termine' && w.t < w.tMax + 600) {
      pas(w);
      if (!vu20 && w.finishX - w.vue.xFront < 20_000) { vu20 = true; tete20.push(w.vue.groupes[0]?.length ?? 0); }
      if (w.t > 300 && Math.abs(w.t % 10) < 0.13 && w.vue.ordre.length >= 6) {
        const o = w.vue.ordre, pentes = o.map((r) => r.pente * 100), m = moy(pentes);
        const cote = m > 4, plat = Math.abs(m) < 1;
        const vm = Math.max(1, moy(o.map((r) => r.v))), etendue = (o[0]!.x - o[o.length - 1]!.x) / vm;   // étirement du peloton en secondes (comparable entre côte et plat)
        if (cote) { etCote.push(etendue); vCote.push(vm * 3.6); }
        if (plat) { etPlat.push(etendue); vPlat.push(vm * 3.6); }
        // gain de puissance de l'abri, en part de la puissance nécessaire (ce qui compte : l'abri en % de traînée est le même, son effet en watts non)
        const suiveurs = o.filter((r) => r.draft > 0.05);
        if (suiveurs.length) {
          const g = moy(suiveurs.map((r) => { const sans = resistance(r.v, 0, r), avec = resistance(r.v, r.draft, r); return sans > 0 ? (sans - avec) / sans : 0; }));
          if (cote) drCote.push(g); if (plat) drPlat.push(g);
        }
      }
    }
    if (w.result.neutralisee) neutralisees++;
    const win = w.riders[w.result.ordre[0]!]!;
    gagnants[win.archetype] = (gagnants[win.archetype] ?? 0) + 1;
    const tp = typePhysique(win.profile); gagnantsType[tp] = (gagnantsType[tp] ?? 0) + 1;
    dur.push(w.result.tFin / 3600); vit.push(KM / (w.result.tFin / 3600)); efin.push(moy(w.riders.map((r) => r.E)));
    dec.push(w.events.filter((e) => e.type === 'decroche').length);
    const t = w.riders.map((r) => r.finishTime!).sort((a, b) => a - b); ecart.push((t[t.length - 1]! - t[0]!) / 60); if (t[1]! - t[0]! < 2) sprints++;
  }
  console.log(`## ${LIBELLE_TYPE[type]} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${((Date.now() - t0) / N / 1000).toFixed(1)} s par étape)`);
  console.log(`durée ${moy(dur).toFixed(2)} h · ${moy(vit).toFixed(1)} km/h · neutralisées ${pct(neutralisees, N)} · réserve moyenne à l'arrivée ${(moy(efin) * 100).toFixed(0)} % · décrochages ${moy(dec).toFixed(0)}/étape`);
  console.log(`étirement du peloton : en côte (pente moy. > 4 %) ${moy(etCote).toFixed(0)} s (allure ${moy(vCote).toFixed(1)} km/h) · à plat ${moy(etPlat).toFixed(0)} s (allure ${moy(vPlat).toFixed(1)} km/h)`);
  console.log(`gain de l'abri en puissance (part de la puissance nécessaire) : en côte ${(moy(drCote) * 100).toFixed(0)} % · à plat ${(moy(drPlat) * 100).toFixed(0)} %`);
  console.log(`dans le groupe de tête à 20 km de l'arrivée : ${moy(tete20).toFixed(1)} / 8 · écart 1er-dernier ${moy(ecart).toFixed(1)} min · arrivées au sprint (< 2 s) ${pct(sprints, N)}`);
  const ordre = Object.keys(ARCHETYPE_LABEL) as Archetype[];
  console.log('vainqueurs par profil : ' + ordre.map((a) => `${ARCHETYPE_LABEL[a]} ${pct(gagnants[a] ?? 0, N)}`).join(' · '));
  console.log('vainqueurs par type physique : ' + (TYPES_PHYSIQUES as readonly TypePhysique[]).map((a) => `${a} ${pct(gagnantsType[a] ?? 0, N)}`).join(' · '));
  console.log('');
}
