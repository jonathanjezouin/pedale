import { describe, expect, it } from 'vitest';
import { creerMonde, pas, simuler, expliquer, aspiration, puissanceVers, E_CUIT, INTENTIONS } from '../src/index';

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
      expect(w.result.ordre.length + w.result.repris.length).toBe(8);
      expect(w.result.echappeeSurvit).toBe(w.result.ordre.length > 0);
    }
  });
});
