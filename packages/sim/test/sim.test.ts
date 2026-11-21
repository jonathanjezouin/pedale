import { describe, expect, it } from 'vitest';
import { creerMonde, pas, simuler, expliquer, aspiration, puissanceVers, E_CUIT, INTENTIONS, creerRoute, ROAD_HALF } from '../src/index';

describe('simulation v0.0.1', () => {
  it('est déterministe : même seed, même course', () => {
    const a = simuler(creerMonde({ seed: 42 })), b = simuler(creerMonde({ seed: 42 }));
    expect(a.events.map((e) => `${e.t}|${e.texte}`)).toEqual(b.events.map((e) => `${e.t}|${e.texte}`));
    expect(a.result).toEqual(b.result);
    const c = simuler(creerMonde({ seed: 43 }));
    expect(c.events.map((e) => e.texte)).not.toEqual(a.events.map((e) => e.texte));
  });

  it("l'aspiration réduit la puissance nécessaire", () => {
    const w = creerMonde({ seed: 1 });
    const [a, b] = w.riders;
    a!.x = 10; a!.y = 0; b!.x = 7.6; b!.y = 0;              // b est à 0,6 m derrière la roue de a
    const dr = aspiration(b!, w.riders);
    expect(dr).toBeGreaterThan(0.25);
    b!.draft = dr;
    const abrite = puissanceVers(10, 10, b!, w.cfg.vent);
    b!.draft = 0;
    const expose = puissanceVers(10, 10, b!, w.cfg.vent);
    expect(abrite).toBeLessThan(expose * 0.8);
  });

  it('les veto sont respectés : un coureur sans réserve ne peut ni relayer, ni attaquer, ni suivre', () => {
    const w = creerMonde({ seed: 7 });
    for (let i = 0; i < 40; i++) pas(w);
    const r = w.riders[0]!;
    r.E = E_CUIT - 0.05;
    for (let i = 0; i < 8; i++) pas(w);
    const d = r.last!;
    for (const k of ['relais', 'attaquer', 'suivre'] as const) {
      const ev = d.evaluations.find((e) => e.intention === k)!;
      expect(ev.vetos.length).toBeGreaterThan(0);
    }
    expect(['relais', 'attaquer', 'suivre']).not.toContain(r.intent.kind);
  });

  it('chaque décision est explicable : raisons nommées, perçu/réel, action', () => {
    const w = simuler(creerMonde({ seed: 3, trace: 'changements' }));
    expect(w.trace.length).toBeGreaterThan(50);
    for (const d of w.trace.slice(0, 500)) {
      expect(INTENTIONS).toContain(d.intention);
      expect(d.evaluations).toHaveLength(7);
      expect(d.action.length).toBeGreaterThan(3);
      const ev = d.evaluations.find((e) => e.intention === d.intention)!;
      // l'intention choisie n'est jamais frappée d'un veto (sauf repli explicite)
      expect(ev.vetos.length === 0 || d.intention === 'gerer').toBe(true);
      const txt = expliquer(d);
      expect(txt).toContain('Perçu');
      expect(txt).toContain('Intention');
      expect(txt).toContain('Action');
    }
  });

  it('des rotations de relais apparaissent sans avoir été écrites', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = simuler(creerMonde({ seed }));
      const meneurs = w.riders.filter((r) => r.stats.relaisPris > 0).length;
      expect(meneurs).toBeGreaterThanOrEqual(5);
      expect(w.changementsDeTete).toBeGreaterThan(15);
    }
  });

  it("la course se termine toujours et le résultat est cohérent", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = simuler(creerMonde({ seed }));
      expect(w.result.statut).toBe('termine');
      expect(w.result.ordre).toHaveLength(8);
      expect(new Set(w.result.ordre).size).toBe(8);
      expect(w.result.vainqueur).toBe(w.result.ordre[0]);
    }
  });

  it('la route est lisse (rayon ≥ 450 m) et le repère latéral est perpendiculaire à la route', () => {
    const road = creerRoute(5, -400, 20000, true);
    let kmax = 0;
    for (let s = -400; s < 20000; s += 10) kmax = Math.max(kmax, Math.abs(road.courbure(s)));
    expect(kmax).toBeLessThanOrEqual(1 / 450 + 1e-9);
    expect(kmax).toBeGreaterThan(1 / 3000);          // elle tourne bien
    const a = road.toXY(1000, 0), b = road.toXY(1000, 3), h = road.heading(1000);
    expect((b.x - a.x) * Math.cos(h) + (b.y - a.y) * Math.sin(h)).toBeCloseTo(0, 9);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(3, 9);
    const droite = creerRoute(5, -400, 20000, false);
    expect(Math.abs(droite.courbure(5000))).toBe(0);
    expect(ROAD_HALF).toBe(4);
  });

  it("vent de côté : le sillage dérive, il faut se décaler pour s'abriter (éventail)", () => {
    const w = creerMonde({ seed: 1, ventMode: 'face' });
    const [a, b] = w.riders;
    a!.x = 20; a!.y = 0; b!.x = 17.6; b!.status = 'course'; a!.status = 'course';
    for (const r of [a!, b!]) { r.v = 10; r.hw = 0; r.cw = 3; }       // vent pur de côté, pousse vers la droite (d > 0)
    b!.y = 0;
    const toutDroit = aspiration(b!, w.riders);
    b!.y = 0.6 * (3 / 10);                                              // décalé sous le vent d'environ gap·tanβ
    const decale = aspiration(b!, w.riders);
    expect(decale).toBeGreaterThan(toutDroit + 0.05);
    for (const r of [a!, b!]) { r.cw = 0; r.hw = 3; }
    b!.y = 0;
    expect(aspiration(b!, w.riders)).toBeGreaterThan(0.3);              // de face : derrière la roue, comme avant
  });

  it('vent fixe : l\'angle relatif change quand la route tourne ; vent « de face » : jamais de vent de côté', () => {
    const fixe = creerMonde({ seed: 11, ventMode: 'fixe', route: 'courbes' });
    const cw = new Set<number>();
    for (let s = 0; s < 20000; s += 500) { fixe.riders[0]!.x = s; pas(fixe); cw.add(Math.round(fixe.riders[0]!.cw * 10)); }
    expect(cw.size).toBeGreaterThan(4);
    const face = creerMonde({ seed: 11, ventMode: 'face', route: 'courbes' });
    for (let i = 0; i < 40; i++) pas(face);
    for (const r of face.riders) { expect(r.cw).toBe(0); expect(r.hw).toBeCloseTo(face.cfg.vent, 9); }
  });

  it('les décalages latéraux varient d\'un coureur à l\'autre (pas de constante unique) et on reste sur la route', () => {
    const w = creerMonde({ seed: 9 });
    const ys = new Set<number>();
    for (let t = 0; t < 1200 && w.result.statut !== 'termine'; t += 0.25) {
      pas(w);
      if (Math.round(t * 4) % 160 === 0) for (const r of w.riders) { ys.add(Math.round(r.y * 10)); expect(Math.abs(r.y)).toBeLessThanOrEqual(ROAD_HALF); }
    }
    expect(ys.size).toBeGreaterThan(8);
  });
});
