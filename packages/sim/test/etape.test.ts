import { describe, expect, it } from 'vitest';
import { creerAlea } from '../src/moteur/alea.ts';
import { TYPES_ETAPE, creerEtape } from '../src/moteur/index.ts';
import {
  ACCOTEMENT_M, PARAMETRES_PROFIL, classePente, creerRoute2D, genererLargeur, genererProfil, genererTrace,
} from '../src/monde/index.ts';

/** Reconstruit la même étape en appelant directement les modules du monde (mêmes flux dérivés de la graine). */
function reference(graine: number, type: (typeof TYPES_ETAPE)[number], longueur_m: number) {
  const profil = genererProfil(type, longueur_m, creerAlea(graine ^ 0x9e3779b9));
  const trace = genererTrace(type, longueur_m, creerAlea(graine), profil);
  const largeur = genererLargeur(type, longueur_m, creerAlea(graine ^ 0x85ebca6b), trace.lacets);
  return { profil, trace, largeur, route2d: creerRoute2D(trace.route, largeur) };
}

describe('étape : façade de lecture (UF 2.5)', () => {
  it('les valeurs lues en 5 points correspondent aux modules de géométrie, de profil et de largeur (UF 2.1 à 2.4)', () => {
    for (const type of TYPES_ETAPE) {
      const L = 60_000;
      const etape = creerEtape(17, type, L);
      const ref = reference(17, type, L);
      for (const s of [0, 12_345, 30_000, 47_777, L]) {
        const lu = etape.lire(s);
        const p = ref.trace.route.point(s);
        expect(lu.s_m).toBe(p.s_m);
        expect(lu.x_m).toBe(p.x_m);
        expect(lu.y_m).toBe(p.y_m);
        expect(lu.cap_rad).toBe(p.cap_rad);
        expect(lu.courbure_rad_m).toBe(p.courbure_rad_m);
        expect(lu.altitude_m).toBe(ref.profil.altitude(s));
        expect(lu.pente_ratio).toBe(ref.profil.pente(s));
        expect(lu.classePente).toBe(classePente(ref.profil.pente(s)));
        expect(lu.largeurChaussee_m).toBe(ref.largeur.chaussee_m(s));
        expect(lu.accotement_m).toBe(ACCOTEMENT_M);
        const troncon = ref.profil.troncons.find((t) => s >= t.debut_m && s <= t.fin_m);
        expect(lu.troncon).toBe(troncon?.type);
        expect(lu.enLacets).toBe(ref.trace.lacets.some((z) => s >= z.debut_m && s <= z.fin_m));
        // rayon : l'inverse de la courbure, ou rien pour une ligne droite
        if (Math.abs(p.courbure_rad_m) < 1 / 5000) expect(lu.rayon_m).toBeNull();
        else expect(lu.rayon_m).toBeCloseTo(1 / Math.abs(p.courbure_rad_m), 9);
      }
    }
  });

  it('même graine, même étape ; graines différentes, étapes différentes ; lecture hors bornes bornée', () => {
    const a = creerEtape(5, 'montagne', 50_000);
    const b = creerEtape(5, 'montagne', 50_000);
    expect(b.echantillonner(100)).toEqual(a.echantillonner(100));
    expect(b.troncons).toEqual(a.troncons);
    expect(b.bilan).toEqual(a.bilan);
    expect(creerEtape(6, 'montagne', 50_000).echantillonner(100)).not.toEqual(a.echantillonner(100));
    expect(a.lire(-10).s_m).toBe(0);
    expect(a.lire(1e9).s_m).toBe(50_000);
  });

  it('échantillons : départ à 0, arrivée à la longueur, pas régulier, cohérents avec la lecture ponctuelle', () => {
    const e = creerEtape(9, 'vallonne', 33_333);
    const ech = e.echantillonner(20);
    expect(ech.s_m[0]).toBe(0);
    expect(ech.s_m[ech.s_m.length - 1]).toBe(33_333);
    for (let i = 1; i < ech.s_m.length - 1; i++) expect((ech.s_m[i] as number) - (ech.s_m[i - 1] as number)).toBeCloseTo(20, 9);
    for (const i of [0, 100, 777, ech.s_m.length - 1]) {
      const lu = e.lire(ech.s_m[i] as number);
      expect(ech.x_m[i]).toBe(lu.x_m); expect(ech.y_m[i]).toBe(lu.y_m); expect(ech.altitude_m[i]).toBe(lu.altitude_m);
      expect(['faible', 'moyenne', 'forte'][ech.classe[i] as number]).toBe(lu.classePente);
    }
    const tous = [ech.s_m, ech.x_m, ech.y_m, ech.altitude_m, ech.classe];
    for (const t of tous) expect(t).toHaveLength(ech.s_m.length);
  });

  it('bords : de part et d\'autre de l\'axe, aux largeurs de chaussée et d\'accotement', () => {
    const e = creerEtape(3, 'montagne', 30_000);
    for (const s of [0, 5000, 17_000]) {
      const b = e.bords(s);
      const l = e.lire(s);
      const d = (p: { x_m: number; y_m: number }, q: { x_m: number; y_m: number }) => Math.hypot(p.x_m - q.x_m, p.y_m - q.y_m);
      expect(d(b.gaucheChaussee, b.droiteChaussee)).toBeCloseTo(l.largeurChaussee_m, 9);
      expect(d(b.gaucheAccotement, b.gaucheChaussee)).toBeCloseTo(l.accotement_m, 9);
      // le milieu de la chaussée est sur l'axe
      expect((b.gaucheChaussee.x_m + b.droiteChaussee.x_m) / 2).toBeCloseTo(l.x_m, 9);
      expect((b.gaucheChaussee.y_m + b.droiteChaussee.y_m) / 2).toBeCloseTo(l.y_m, 9);
    }
  });

  it('bilan : cohérent avec le type d\'étape (dénivelé, largeur, lacets) pour 20 km et 250 km', () => {
    for (const type of TYPES_ETAPE) {
      for (const L of [20_000, 250_000]) {
        const e = creerEtape(1, type, L);
        const par = PARAMETRES_PROFIL[type];
        const dkm = e.bilan.denivelePositif_m / (L / 1000);
        expect(dkm).toBeGreaterThanOrEqual(par.deniveleParKm_m[0]);
        expect(dkm).toBeLessThanOrEqual(par.deniveleParKm_m[1]);
        expect(e.bilan.altitudeMax_m).toBeLessThanOrEqual(par.altitudeMax_m);
        expect(e.bilan.largeurMin_m).toBeGreaterThan(4.4);
        expect(e.bilan.largeurMax_m).toBeLessThanOrEqual(7.0001);
        if (type !== 'montagne') expect(e.bilan.nbLacets).toBe(0);
        expect(e.bilan.partDroite_ratio).toBeGreaterThan(0);
        expect(e.troncons[0]?.debut_m).toBe(0);
        expect(e.troncons[e.troncons.length - 1]?.fin_m).toBeCloseTo(L, 6);
      }
    }
  }, 60_000);
});

describe('étape : projection d\'un point du plan sur la route (UF 2.7)', () => {
  it('retrouve l\'abscisse, le décalage et la distance au bord ; renvoie null loin de la route', () => {
    const e = creerEtape(5, 'montagne', 40_000);
    for (const [s, d] of [[1000, 0], [8000, 1.5], [15_000, -2.9], [20_000, 4.5], [30_000, -9]] as [number, number][]) {
      const q = e.versMonde(s, d);
      const p = e.projeter(q.x_m, q.y_m);
      expect(p).not.toBeNull();
      if (!p) continue;
      expect(p.s_m).toBeCloseTo(s, 6);
      expect(p.d_m).toBeCloseTo(d, 6);
      expect(p.bord_m).toBeCloseTo(Math.abs(d) - e.demiTotale(s), 6);
      expect(p.cap_rad).toBeCloseTo(e.lire(s).cap_rad, 9);
    }
    const loin = e.versMonde(5000, 40);
    expect(e.projeter(loin.x_m, loin.y_m)).toBeNull();
    expect(e.projeter(1e7, 1e7)).toBeNull();
  });
});
