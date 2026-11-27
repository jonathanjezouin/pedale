import { describe, expect, it } from 'vitest';
import { creerAlea } from '../src/moteur/alea.ts';
import {
  ACCOTEMENT_M, ECART_MIN_M, PARAMETRES_LARGEUR, TYPES_ETAPE, VARIATION_LARGEUR_MAX_M_PAR_M, creerLargeur, creerRoute,
  creerRoute2D, genererLargeur, genererProfil, genererTrace, type TypeEtape,
} from '../src/monde/index.ts';

const CM = 0.01;

function routeComplete(type: TypeEtape, graine: number, longueur_m: number) {
  const profil = genererProfil(type, longueur_m, creerAlea(graine + 500_000));
  const trace = genererTrace(type, longueur_m, creerAlea(graine), profil);
  const largeur = genererLargeur(type, longueur_m, creerAlea(graine + 900_000), trace.lacets);
  return { trace, largeur, route2d: creerRoute2D(trace.route, largeur) };
}

/** Zones de lacets fabriquées : séparées d'au moins 800 m, de 600 à 1 500 m, comme celles du générateur de tracé. */
function zonesFictives(graine: number, longueur_m: number) {
  const a = creerAlea(graine);
  const zones = [];
  let s = a.suivant() < 0.2 ? 20 : 900 + a.suivant() * 3000;
  while (s + 1500 < longueur_m) {
    const l = 600 + a.suivant() * 900;
    zones.push({ debut_m: s, fin_m: s + l });
    s += l + 800 + a.suivant() * 6000;
  }
  return zones;
}

describe('route à deux dimensions : conversion (s, d) ↔ plan (UF 2.4)', () => {
  it('aller-retour (s, d) → plan → (s, d) : erreur < 1 cm sur 10 000 points tirés, lacets compris', () => {
    let pireS = 0, pireD = 0, pirePlan = 0, nb = 0, nbLacets = 0;
    for (const type of TYPES_ETAPE) {
      for (let g = 1; g <= 12; g++) {
        const longueur = (20 + ((g * 7919) % 41)) * 1000;
        const { trace, route2d } = routeComplete(type, g, longueur);
        const a = creerAlea(g * 31 + TYPES_ETAPE.indexOf(type));
        for (let i = 0; i < 280; i++) {
          // un point sur trois est tiré dans une zone de lacets quand il y en a
          let s = a.suivant() * longueur;
          if (i % 3 === 0 && trace.lacets.length > 0) {
            const z = trace.lacets[Math.floor(a.suivant() * trace.lacets.length)] as { debut_m: number; fin_m: number };
            s = z.debut_m + a.suivant() * (z.fin_m - z.debut_m);
            nbLacets++;
          }
          const d = (a.suivant() * 2 - 1) * route2d.demiTotale_m(s);
          const q = route2d.versMonde(s, d);
          const r = route2d.versRoute(q.x_m, q.y_m);
          expect(r).not.toBeNull();
          if (!r) continue;
          const q2 = route2d.versMonde(r.s_m, r.d_m);
          pireS = Math.max(pireS, Math.abs(r.s_m - s));
          pireD = Math.max(pireD, Math.abs(r.d_m - d));
          pirePlan = Math.max(pirePlan, Math.hypot(q2.x_m - q.x_m, q2.y_m - q.y_m));
          nb++;
        }
      }
    }
    expect(nb).toBeGreaterThanOrEqual(10_000);
    expect(nbLacets).toBeGreaterThan(300);
    expect(pireS).toBeLessThan(CM);
    expect(pireD).toBeLessThan(CM);
    expect(pirePlan).toBeLessThan(CM);
  }, 120_000);

  it('virage serré : côté extérieur et côté intérieur restent valides, sans retournement, sur toute la largeur de route', () => {
    // Épingle de 20 m de rayon (le minimum du tableau) : demi-largeur totale max 5 m, donc 1 − κd ≥ 0,75 > 0.
    const R = 20;
    const route = creerRoute([{ longueur_m: 200, courbure_rad_m: 0 }, { longueur_m: R * Math.PI, courbure_rad_m: 1 / R }, { longueur_m: 200, courbure_rad_m: 0 }]);
    const largeur = creerLargeur([{ debut_m: 0, fin_m: route.longueur_m, largeurDebut_m: 6.5, largeurFin_m: 6.5 }]);
    const r2 = creerRoute2D(route, largeur);
    const dMax = r2.demiTotale_m(300);
    expect(dMax).toBeLessThanOrEqual(5);
    for (const d of [-dMax, dMax, -dMax / 2, dMax / 2, 0]) {
      let prec = r2.versMonde(150, d);
      for (let s = 150.5; s < 450; s += 0.5) {
        const q = r2.versMonde(s, d);
        const p = route.point(s - 0.25);
        // avance dans le sens de la route (pas de retournement) : le produit scalaire avec le devant reste positif
        expect((q.x_m - prec.x_m) * p.devant.x_ratio + (q.y_m - prec.y_m) * p.devant.y_ratio).toBeGreaterThan(0);
        // jacobien 1 − κd > 0 : l'application (s, d) → plan reste inversible
        expect(1 - p.courbure_rad_m * d).toBeGreaterThan(0.7);
        const r = r2.versRoute(q.x_m, q.y_m);
        expect(r?.s_m).toBeCloseTo(s, 6);
        expect(r?.d_m).toBeCloseTo(d, 6);
        prec = q;
      }
    }
  });

  it('un point au-delà du rayon de courbure côté intérieur n\'est pas une position de route valide (le cas existe, mais hors largeur)', () => {
    const R = 20;
    const route = creerRoute([{ longueur_m: R * Math.PI, courbure_rad_m: 1 / R }]);
    const largeur = creerLargeur([{ debut_m: 0, fin_m: route.longueur_m, largeurDebut_m: 6, largeurFin_m: 6 }]);
    const r2 = creerRoute2D(route, largeur);
    // le centre de l'arc est à d = +20 : bien au-delà de la demi-largeur totale (4,5 m)
    const centre = r2.versMonde(R * Math.PI / 2, R);
    const r = r2.versRoute(centre.x_m, centre.y_m);
    expect(r === null || r.surface === 'hors').toBe(true);
  });

  it('classement des points : chaussée, accotement, hors route', () => {
    const route = creerRoute([{ longueur_m: 1000, courbure_rad_m: 0 }]);
    const r2 = creerRoute2D(route, creerLargeur([{ debut_m: 0, fin_m: 1000, largeurDebut_m: 6, largeurFin_m: 6 }]));
    const surface = (d: number) => { const q = r2.versMonde(500, d); return r2.versRoute(q.x_m, q.y_m)?.surface; };
    expect(surface(0)).toBe('chaussee');
    expect(surface(2.9)).toBe('chaussee'); expect(surface(-2.9)).toBe('chaussee');
    expect(surface(3.5)).toBe('accotement'); expect(surface(-4.4)).toBe('accotement');
    expect(surface(4.6)).toBe('hors'); expect(surface(-8)).toBe('hors');
    expect(r2.versRoute(500, 100)).toBeNull(); // trop loin de la route
  });

  it('bords : largeur de chaussée et accotements aux bonnes distances, de part et d\'autre', () => {
    const { route2d, trace } = routeComplete('vallonne', 3, 30_000);
    for (const s of [0, 1234, 15_000, 29_999]) {
      const b = route2d.bords(s);
      const w = route2d.largeur.chaussee_m(s);
      const dist = (p: { x_m: number; y_m: number }, q: { x_m: number; y_m: number }) => Math.hypot(p.x_m - q.x_m, p.y_m - q.y_m);
      expect(dist(b.gaucheChaussee, b.droiteChaussee)).toBeCloseTo(w, 9);
      expect(dist(b.gaucheAccotement, b.gaucheChaussee)).toBeCloseTo(ACCOTEMENT_M, 9);
      expect(dist(b.droiteAccotement, b.droiteChaussee)).toBeCloseTo(ACCOTEMENT_M, 9);
      // la gauche est bien à gauche de l'axe
      const p = trace.route.point(s);
      expect((b.gaucheChaussee.x_m - p.x_m) * p.gauche.x_ratio + (b.gaucheChaussee.y_m - p.y_m) * p.gauche.y_ratio).toBeGreaterThan(0);
    }
  });

  it('avec un indice de position, la recherche locale donne le même résultat que la recherche globale', () => {
    const { route2d } = routeComplete('montagne', 4, 40_000);
    const a = creerAlea(8);
    for (let i = 0; i < 500; i++) {
      const s = a.suivant() * 40_000;
      const q = route2d.versMonde(s, (a.suivant() * 2 - 1) * route2d.demiTotale_m(s));
      const global = route2d.versRoute(q.x_m, q.y_m);
      const local = route2d.versRoute(q.x_m, q.y_m, s + (a.suivant() - 0.5) * 300);
      expect(local?.s_m).toBeCloseTo(global?.s_m ?? NaN, 9);
      expect(local?.d_m).toBeCloseTo(global?.d_m ?? NaN, 9);
    }
    // un indice trop éloigné ne trouve rien (la recherche locale ne regarde que ±400 m)
    const q = route2d.versMonde(30_000, 0);
    expect(route2d.versRoute(q.x_m, q.y_m, 1000)).toBeNull();
  });

  it('la demi-largeur totale (chaussée + accotement) reste très en dessous du demi-écart de non-recroisement et du rayon de lacet', () => {
    for (const type of TYPES_ETAPE) {
      const p = PARAMETRES_LARGEUR[type];
      const demi = p.chaussee_m[1] / 2 + ACCOTEMENT_M;
      expect(demi).toBeLessThanOrEqual(5);
      expect(2 * demi).toBeLessThan(ECART_MIN_M / 2);
      expect(demi).toBeLessThan(20); // rayon minimal de lacet
    }
  });
});

describe.each(TYPES_ETAPE)('largeur de route : %s, 1 000 seeds de 20 à 100 km (UF 2.4)', (type) => {
  const par = PARAMETRES_LARGEUR[type];
  const cas = Array.from({ length: 1000 }, (_, i) => {
    const g = i + 1;
    const longueur = (20 + ((g * 7919) % 81)) * 1000;
    const lacets = type === 'montagne' ? zonesFictives(g, longueur) : [];
    return { g, longueur, lacets, largeur: genererLargeur(type, longueur, creerAlea(g), lacets) };
  });

  it('largeur bornée par type d\'étape, en tout point', () => {
    let min = Infinity, max = -Infinity;
    for (const { largeur, longueur } of cas) for (let s = 0; s <= longueur; s += 11) { const w = largeur.chaussee_m(s); min = Math.min(min, w); max = Math.max(max, w); }
    expect(min).toBeGreaterThanOrEqual(par.chaussee_m[0] - 1e-9);
    expect(max).toBeLessThanOrEqual(par.chaussee_m[1] + 1e-9);
  }, 60_000);

  it('sans saut brutal : variation ≤ 0,02 m par m, et continue aux jonctions de tronçons', () => {
    let pire = 0, saut = 0;
    for (const { largeur, longueur } of cas) {
      for (let s = 0; s + 5 <= longueur; s += 13) pire = Math.max(pire, Math.abs(largeur.chaussee_m(s + 5) - largeur.chaussee_m(s)) / 5);
      largeur.troncons.forEach((t, i) => { if (i > 0) saut = Math.max(saut, Math.abs(t.largeurDebut_m - (largeur.troncons[i - 1] as { largeurFin_m: number }).largeurFin_m)); });
    }
    expect(pire).toBeLessThanOrEqual(VARIATION_LARGEUR_MAX_M_PAR_M + 1e-9);
    expect(saut).toBeLessThan(1e-9);
  }, 60_000);

  it('définie par tronçons contigus qui couvrent toute l\'étape', () => {
    for (const { largeur, longueur } of cas) {
      expect(largeur.troncons[0]?.debut_m).toBe(0);
      expect(largeur.troncons[largeur.troncons.length - 1]?.fin_m).toBeCloseTo(longueur, 6);
      largeur.troncons.forEach((t, i) => {
        expect(t.fin_m).toBeGreaterThan(t.debut_m);
        if (i > 0) expect(t.debut_m).toBeCloseTo((largeur.troncons[i - 1] as { fin_m: number }).fin_m, 9);
      });
    }
  }, 60_000);

  it('en lacets : largeur de la fourchette des lacets sur toute la zone (montagne), jamais de lacets ailleurs', () => {
    if (!par.lacets_m) return;
    let min = Infinity, max = -Infinity;
    for (const { largeur, lacets } of cas) {
      for (const z of lacets) for (let s = z.debut_m; s <= z.fin_m; s += 7) { const w = largeur.chaussee_m(s); min = Math.min(min, w); max = Math.max(max, w); }
    }
    expect(min).toBeGreaterThanOrEqual(par.lacets_m[0] - 1e-9);
    expect(max).toBeLessThanOrEqual(par.lacets_m[1] + 1e-9);
  }, 60_000);

  it('déterminisme : même seed, même largeur', () => {
    const a = genererLargeur(type, 50_000, creerAlea(3), zonesFictives(3, 50_000));
    const b = genererLargeur(type, 50_000, creerAlea(3), zonesFictives(3, 50_000));
    expect(b.troncons).toEqual(a.troncons);
    expect(genererLargeur(type, 50_000, creerAlea(4), zonesFictives(3, 50_000)).troncons).not.toEqual(a.troncons);
  });
});

describe('largeur et conversion : cas limites', () => {
  it('une largeur sans tronçon est refusée ; s hors bornes est borné', () => {
    expect(() => creerLargeur([])).toThrow();
    const l = creerLargeur([{ debut_m: 0, fin_m: 100, largeurDebut_m: 5, largeurFin_m: 7 }]);
    expect(l.chaussee_m(-10)).toBeCloseTo(5, 12);
    expect(l.chaussee_m(50)).toBeCloseTo(6, 12);
    expect(l.chaussee_m(500)).toBeCloseTo(7, 12);
  });

  it('une zone de lacets collée au départ est traitée sans saut', () => {
    const l = genererLargeur('montagne', 20_000, creerAlea(1), [{ debut_m: 40, fin_m: 900 }]);
    for (let s = 0; s < 20_000; s += 3) expect(Math.abs(l.chaussee_m(s + 3) - l.chaussee_m(s)) / 3).toBeLessThanOrEqual(VARIATION_LARGEUR_MAX_M_PAR_M + 1e-9);
    expect(l.chaussee_m(40)).toBeLessThanOrEqual(5.5 + 1e-9);
  });
});
