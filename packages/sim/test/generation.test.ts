import { describe, expect, it } from 'vitest';
import { creerAlea } from '../src/moteur/alea.ts';
import {
  ECART_MIN_M, PARAMETRES_ETAPE, RECROISEMENT_S_M, TYPES_ETAPE, analyserTrace, creerRoute, droitesLonguesRequises,
  ecartsAuxBornes, genererTrace, type Route, type TypeEtape,
} from '../src/monde/index.ts';

const NB_SEEDS = 1000;
const NB_LONGUES = 30;
/** 1 000 seeds de 20 à 100 km, puis 30 seeds de 100 à 250 km (le coût du contrôle croît avec la longueur). */
const longueurDe = (graine: number): number =>
  graine <= NB_SEEDS ? (20 + ((graine * 7919) % 81)) * 1000 : (100 + ((graine * 7919) % 151)) * 1000;

/** Vérificateur indépendant du générateur : distance minimale en plan entre points éloignés de plus de 100 m en s. */
function ecartMinimal(route: Route, pas_m = 5): number {
  const cellule = ECART_MIN_M;
  const grille = new Map<string, { x: number; y: number; s: number }[]>();
  let pire = Infinity;
  for (let s = 0; s <= route.longueur_m; s += pas_m) {
    const p = route.point(s);
    const cx = Math.floor(p.x_m / cellule);
    const cy = Math.floor(p.y_m / cellule);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of grille.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (s - q.s > RECROISEMENT_S_M) pire = Math.min(pire, Math.hypot(p.x_m - q.x, p.y_m - q.y));
        }
      }
    }
    const cle = `${cx},${cy}`;
    const l = grille.get(cle);
    if (l) l.push({ x: p.x_m, y: p.y_m, s }); else grille.set(cle, [{ x: p.x_m, y: p.y_m, s }]);
  }
  return pire;
}

/** Même mesure, en force brute (quadratique) : sert à valider le vérificateur ci-dessus. */
function ecartMinimalBrut(route: Route, pas_m: number): number {
  const pts = [];
  for (let s = 0; s <= route.longueur_m; s += pas_m) { const p = route.point(s); pts.push({ x: p.x_m, y: p.y_m, s }); }
  let pire = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i] as { x: number; y: number; s: number }; const b = pts[j] as { x: number; y: number; s: number };
    if (b.s - a.s > RECROISEMENT_S_M) pire = Math.min(pire, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return pire;
}

type Ligne = { graine: number; longueur: number; trace: ReturnType<typeof genererTrace>; analyse: ReturnType<typeof analyserTrace>; ecart: number };
const cache = new Map<TypeEtape, Promise<Ligne[]>>();
/** Calcul asynchrone avec pauses : un calcul de plusieurs dizaines de secondes ne doit pas bloquer le lanceur de tests. */
async function calculer(type: TypeEtape): Promise<Ligne[]> {
  const lignes: Ligne[] = [];
  for (let g = 1; g <= NB_SEEDS + NB_LONGUES; g++) {
    const longueur = longueurDe(g);
    const trace = genererTrace(type, longueur, creerAlea(g * 1000 + TYPES_ETAPE.indexOf(type)));
    lignes.push({ graine: g, longueur, trace, analyse: analyserTrace(trace.route.segments, trace.lacets), ecart: ecartMinimal(trace.route) });
    if (g % 20 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return lignes;
}
const lignesDe = (type: TypeEtape): Promise<Ligne[]> => {
  if (!cache.has(type)) cache.set(type, calculer(type));
  return cache.get(type) as Promise<Ligne[]>;
};

describe.each(TYPES_ETAPE)('génération du tracé : %s, 1 000 seeds de 20 à 100 km + 30 de 100 à 250 km (UF 2.2)', (type) => {
  const p = PARAMETRES_ETAPE[type];
  const T = 300_000;

  it('génère sans échec, longueur à 1 % près', async () => {
    for (const l of await lignesDe(type)) expect(Math.abs(l.trace.route.longueur_m - l.longueur) / l.longueur).toBeLessThan(0.01);
  }, T);

  it('ne se recroise ni ne se frôle jamais : écart ≥ 3 largeurs entre points éloignés de plus de 100 m', async () => {
    const pire = Math.min(...(await lignesDe(type)).map((l) => l.ecart));
    expect(pire).toBeGreaterThanOrEqual(ECART_MIN_M);
  }, T);

  it('rayons minimaux respectés (hors lacet et en lacet)', async () => {
    for (const { analyse } of await lignesDe(type)) {
      expect(analyse.rayonMinHorsLacet_m).toBeGreaterThanOrEqual(p.rayonMin_m - 1e-6);
      if (p.rayonMinLacet_m === null) expect(analyse.longueurLacets_m).toBe(0);
      else expect(analyse.rayonMinLacet_m).toBeGreaterThanOrEqual(p.rayonMinLacet_m - 1e-6);
    }
  }, T);

  it('de vraies lignes droites : nombre minimal de droites longues, plus longue droite bornée', async () => {
    for (const { analyse, longueur } of await lignesDe(type)) {
      const longues = analyse.droites.filter((d) => d.longueur_m >= p.droiteLongueMin_m).length;
      expect(longues).toBeGreaterThanOrEqual(droitesLonguesRequises(p, longueur));
      expect(analyse.plusLongueDroite_m).toBeLessThanOrEqual(p.droiteMax_m);
    }
  }, T);

  it('ni que des droites ni que des virages : part de longueur en droite dans la fourchette du type', async () => {
    for (const { analyse } of await lignesDe(type)) {
      expect(analyse.partDroite_ratio).toBeGreaterThanOrEqual(p.partDroite[0]);
      expect(analyse.partDroite_ratio).toBeLessThanOrEqual(p.partDroite[1]);
    }
  }, T);

  it('virages par km et angle moyen dans les fourchettes du type', async () => {
    for (const { analyse } of await lignesDe(type)) {
      expect(analyse.viragesParKm).toBeGreaterThanOrEqual(p.virages_par_km[0]);
      expect(analyse.viragesParKm).toBeLessThanOrEqual(p.virages_par_km[1]);
      const deg = (analyse.angleMoyen_rad * 180) / Math.PI;
      expect(deg).toBeGreaterThanOrEqual(p.angleMoyen_deg[0]);
      expect(deg).toBeLessThanOrEqual(p.angleMoyen_deg[1]);
    }
  }, T);

  it('lacets : zones ordonnées dans l\'étape (montagne uniquement)', async () => {
    for (const { trace, longueur } of await lignesDe(type)) {
      if (type !== 'montagne') { expect(trace.lacets).toHaveLength(0); continue; }
      expect(trace.lacets.length).toBeGreaterThanOrEqual(1);
      let fin = 0;
      for (const z of trace.lacets) {
        expect(z.debut_m).toBeGreaterThanOrEqual(fin);
        expect(z.fin_m).toBeGreaterThan(z.debut_m);
        fin = z.fin_m;
      }
      expect(fin).toBeLessThanOrEqual(longueur + 1e-6);
    }
  }, T);

  it('la construction réussit presque toujours du premier coup', async () => {
    const lignes = await lignesDe(type);
    expect(Math.max(...lignes.map((l) => l.trace.tentatives))).toBeLessThanOrEqual(5);
    expect(lignes.filter((l) => l.trace.tentatives > 1).length).toBeLessThanOrEqual((NB_SEEDS + NB_LONGUES) * 0.02);
  }, T);
});

describe('génération du tracé : comparaison entre types (UF 2.2)', () => {
  const moyenne = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ecartType = (xs: number[]) => { const m = moyenne(xs); return Math.sqrt(moyenne(xs.map((x) => (x - m) ** 2))); };

  it('distribution des virages différente d\'un type à l\'autre, et stable d\'une seed à l\'autre', async () => {
    const stat = [];
    for (const t of TYPES_ETAPE) {
      const lignes = await lignesDe(t);
      const v = lignes.map((l) => l.analyse.viragesParKm);
      const a = lignes.map((l) => (l.analyse.angleMoyen_rad * 180) / Math.PI);
      stat.push({ t, vm: moyenne(v), vs: ecartType(v), am: moyenne(a), as: ecartType(a) });
    }
    const [plaine, vallonne, montagne] = stat as [typeof stat[0], typeof stat[0], typeof stat[0]];
    expect(plaine.vm).toBeLessThan(vallonne.vm);
    expect(vallonne.vm).toBeLessThan(montagne.vm);
    expect(plaine.am).toBeLessThan(vallonne.am);
    expect(vallonne.am).toBeLessThan(montagne.am);
    for (const s of stat) {
      expect(s.vs / s.vm).toBeLessThan(0.2); // stable : dispersion faible devant la moyenne
      expect(s.as / s.am).toBeLessThan(0.1);
    }
    // Différence nette : l'écart entre deux types voisins dépasse 3 fois la dispersion.
    expect(vallonne.vm - plaine.vm).toBeGreaterThan(3 * Math.max(plaine.vs, vallonne.vs));
    expect(montagne.vm - vallonne.vm).toBeGreaterThan(3 * Math.max(vallonne.vs, montagne.vs));
  }, 300_000);

  it('bornes aux extrémités : 20 km et 250 km pour chaque type', () => {
    for (const type of TYPES_ETAPE) for (const km of [20, 250]) for (const g of [1, 2, 3]) {
      const l = km * 1000;
      const tr = genererTrace(type, l, creerAlea(g));
      expect(ecartsAuxBornes(analyserTrace(tr.route.segments, tr.lacets), type, l)).toEqual([]);
      expect(ecartMinimal(tr.route, 2)).toBeGreaterThanOrEqual(ECART_MIN_M);
    }
  }, 120_000);

  it('déterminisme : même seed, même tracé ; seeds différentes, tracés différents', () => {
    for (const type of TYPES_ETAPE) {
      const a = genererTrace(type, 60_000, creerAlea(5));
      const b = genererTrace(type, 60_000, creerAlea(5));
      expect(b.route.segments).toEqual(a.route.segments);
      expect(b.lacets).toEqual(a.lacets);
      expect(genererTrace(type, 60_000, creerAlea(6)).route.segments).not.toEqual(a.route.segments);
    }
  });
});

describe('outils de vérification du tracé (cas de violation volontaires)', () => {
  it('le vérificateur de recroisement détecte un tracé qui se recoupe et un tracé qui frôle', () => {
    // Carré à angles droits : revient sur lui-même.
    const carre = creerRoute([
      { longueur_m: 400, courbure_rad_m: 0 }, { longueur_m: 100 * Math.PI / 2, courbure_rad_m: 1 / 100 },
      { longueur_m: 400, courbure_rad_m: 0 }, { longueur_m: 100 * Math.PI / 2, courbure_rad_m: 1 / 100 },
      { longueur_m: 300, courbure_rad_m: 0 }, { longueur_m: 100 * Math.PI / 2, courbure_rad_m: 1 / 100 },
      { longueur_m: 800, courbure_rad_m: 0 }, // descend à x = 0 et retraverse le point de départ
    ]);
    expect(ecartMinimal(carre)).toBeLessThan(5); // traverse son propre début
    // Épingle de 8 m de rayon : les deux branches sont à 16 m, moins que 3 largeurs.
    const epingle = creerRoute([
      { longueur_m: 300, courbure_rad_m: 0 }, { longueur_m: 8 * Math.PI, courbure_rad_m: 1 / 8 }, { longueur_m: 300, courbure_rad_m: 0 },
    ]);
    expect(ecartMinimal(epingle)).toBeLessThan(ECART_MIN_M);
    expect(ecartMinimal(epingle)).toBeGreaterThan(15);
  });

  it('le vérificateur rapide et la force brute concluent pareil (écarts < 3 largeurs identiques, sinon tous deux ≥ 3 largeurs)', () => {
    const cas = [
      genererTrace('montagne', 20_000, creerAlea(3)).route,
      creerRoute([{ longueur_m: 300, courbure_rad_m: 0 }, { longueur_m: 8 * Math.PI, courbure_rad_m: 1 / 8 }, { longueur_m: 300, courbure_rad_m: 0 }]),
      creerRoute([{ longueur_m: 200, courbure_rad_m: 0 }, { longueur_m: 12 * Math.PI, courbure_rad_m: 1 / 12 }, { longueur_m: 200, courbure_rad_m: 0 }, { longueur_m: 12 * Math.PI, courbure_rad_m: -1 / 12 }, { longueur_m: 200, courbure_rad_m: 0 }]),
    ];
    for (const r of cas) expect(Math.min(ecartMinimal(r, 5), ECART_MIN_M)).toBeCloseTo(Math.min(ecartMinimalBrut(r, 5), ECART_MIN_M), 9);
  });

  it('l\'analyse repère une droite trop longue, un rayon trop serré, un manque de droites', () => {
    const l = 30_000;
    const trop = analyserTrace([{ longueur_m: 6000, courbure_rad_m: 0 }, { longueur_m: 24_000, courbure_rad_m: 1 / 1000 }], []);
    expect(ecartsAuxBornes(trop, 'plaine', l)).toContain('plus longue droite');
    const serre = analyserTrace([{ longueur_m: 30_000, courbure_rad_m: 1 / 100 }], []);
    expect(ecartsAuxBornes(serre, 'plaine', l)).toContain('rayon hors lacet');
    expect(ecartsAuxBornes(serre, 'plaine', l)).toContain('droites longues');
    const sansDroite = analyserTrace([{ longueur_m: 30_000, courbure_rad_m: 1 / 500 }], []);
    expect(ecartsAuxBornes(sansDroite, 'plaine', l)).toContain('part de droite');
    const lacetsEnPlaine = analyserTrace([{ longueur_m: 1000, courbure_rad_m: 1 / 25 }], [{ debut_m: 0, fin_m: 1000 }]);
    expect(ecartsAuxBornes(lacetsEnPlaine, 'plaine', 1000)).toContain('lacets interdits');
  });
});
