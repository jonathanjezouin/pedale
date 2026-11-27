import { describe, expect, it } from 'vitest';
import { creerAlea } from '../src/moteur/alea.ts';
import { creerRoute, type SegmentRoute } from '../src/monde/route.ts';

/** Route de test : alternance de droites, d'arcs larges et de lacets serrés (rayon jusqu'à 20 m). */
function routeAleatoire(graine: number) {
  const a = creerAlea(graine);
  const segs: SegmentRoute[] = [];
  for (let i = 0; i < 60; i++) {
    const genre = a.suivant();
    const longueur_m = 20 + a.suivant() * 800;
    if (genre < 0.35) segs.push({ longueur_m, courbure_rad_m: 0 });
    else {
      const rayon = genre < 0.7 ? 150 + a.suivant() * 800 : 20 + a.suivant() * 60;
      segs.push({ longueur_m: Math.min(longueur_m, rayon * 3), courbure_rad_m: (a.suivant() < 0.5 ? -1 : 1) / rayon });
    }
  }
  return creerRoute(segs, { x_m: 100, y_m: -50, cap_rad: 0.3 });
}

const dist = (a: { x_m: number; y_m: number }, b: { x_m: number; y_m: number }) => Math.hypot(b.x_m - a.x_m, b.y_m - a.y_m);
const DEG = Math.PI / 180;

describe('géométrie de la route (UF 2.1)', () => {
  it('position continue : 1 cm de route = 1 cm dans le plan, à 1 mm près, jonctions comprises', () => {
    for (const graine of [1, 2, 3]) {
      const r = routeAleatoire(graine);
      const pas = 0.01;
      let pire = 0;
      for (let s = 0; s < r.longueur_m - pas; s += 0.37) pire = Math.max(pire, Math.abs(dist(r.point(s), r.point(s + pas)) - pas));
      // et pile autour de chaque jonction
      for (const d of r.debuts_m.slice(1)) pire = Math.max(pire, Math.abs(dist(r.point(d - pas / 2), r.point(d + pas / 2)) - pas));
      expect(pire).toBeLessThan(0.001);
    }
  });

  it('cap continu : aucun saut > 0,01° au-delà de la rotation attendue (courbure × distance)', () => {
    for (const graine of [1, 2, 3]) {
      const r = routeAleatoire(graine);
      const pas = 0.01;
      let pire = 0;
      const points = [...Array.from({ length: 20_000 }, (_, i) => i * 0.53), ...r.debuts_m.slice(1).map((d) => d - pas / 2)];
      for (const s of points) {
        if (s + pas > r.longueur_m) continue;
        const p = r.point(s);
        const q = r.point(s + pas);
        const attendu = Math.max(Math.abs(p.courbure_rad_m), Math.abs(q.courbure_rad_m)) * pas;
        pire = Math.max(pire, Math.abs(q.cap_rad - p.cap_rad) - attendu);
      }
      expect(pire / DEG).toBeLessThan(0.01);
    }
  });

  it('longueur annoncée = somme des segments = longueur mesurée le long du tracé, à 0,1 % près', () => {
    const r = routeAleatoire(5);
    expect(r.longueur_m).toBeCloseTo(r.segments.reduce((t, s) => t + s.longueur_m, 0), 9);
    let mesuree = 0;
    let prec = r.point(0);
    for (let s = 0.5; s <= r.longueur_m; s += 0.5) {
      const p = r.point(s);
      mesuree += dist(prec, p);
      prec = p;
    }
    mesuree += dist(prec, r.point(r.longueur_m));
    expect(Math.abs(mesuree - r.longueur_m) / r.longueur_m).toBeLessThan(0.001);
  });

  it('s croissant avance toujours le long du tracé : jamais de retour ni de sur-place', () => {
    const r = routeAleatoire(6);
    for (let s = 0; s < r.longueur_m - 1; s += 0.9) {
      const p = r.point(s);
      const q = r.point(s + 1);
      const d = dist(p, q);
      expect(d).toBeGreaterThan(0.99); // 1 m d'arc de rayon ≥ 20 m : corde ≥ 0,9997 m
      expect((q.x_m - p.x_m) * p.devant.x_ratio + (q.y_m - p.y_m) * p.devant.y_ratio).toBeGreaterThan(0.99);
    }
  });

  it('repère local : devant unitaire, gauche = devant tourné de +90°, courbure signée cohérente avec le cap', () => {
    const r = creerRoute([{ longueur_m: 100, courbure_rad_m: 0.01 }, { longueur_m: 100, courbure_rad_m: -0.01 }]);
    const p = r.point(50);
    expect(Math.hypot(p.devant.x_ratio, p.devant.y_ratio)).toBeCloseTo(1, 12);
    expect(p.gauche.x_ratio).toBeCloseTo(-p.devant.y_ratio, 12);
    expect(p.gauche.y_ratio).toBeCloseTo(p.devant.x_ratio, 12);
    expect(r.point(100).cap_rad).toBeCloseTo(1, 12); // 100 m × 0,01 rad/m
    expect(r.point(200).cap_rad).toBeCloseTo(0, 12); // retour au cap initial
  });

  it('cercle fermé : 2πR de droite à gauche ramène au départ', () => {
    const R = 50;
    const r = creerRoute([{ longueur_m: 2 * Math.PI * R, courbure_rad_m: 1 / R }]);
    const f = r.point(r.longueur_m);
    expect(Math.hypot(f.x_m, f.y_m)).toBeLessThan(1e-9);
  });

  it('une courbure minuscule se comporte comme une droite (pas de division par ~0)', () => {
    const r = creerRoute([{ longueur_m: 1000, courbure_rad_m: 1e-12 }]);
    expect(r.point(1000).x_m).toBeCloseTo(1000, 6);
    expect(Number.isFinite(r.point(500).y_m)).toBe(true);
  });

  it('s hors bornes est borné ; segments invalides refusés', () => {
    const r = routeAleatoire(7);
    expect(r.point(-5).s_m).toBe(0);
    expect(r.point(r.longueur_m + 5).s_m).toBe(r.longueur_m);
    expect(() => creerRoute([])).toThrow();
    expect(() => creerRoute([{ longueur_m: 0, courbure_rad_m: 0 }])).toThrow();
  });

  it('déterminisme : même seed, même route, résultats identiques à l\'octet près', () => {
    const a = routeAleatoire(11);
    const b = routeAleatoire(11);
    expect(b.segments).toEqual(a.segments);
    for (let s = 0; s <= a.longueur_m; s += 13.7) expect(b.point(s)).toEqual(a.point(s));
    expect(routeAleatoire(12).segments).not.toEqual(a.segments);
  });
});
