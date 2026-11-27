import { describe, expect, it } from 'vitest';
import type { Percevoir, TraceDecision } from '../src/contrats/index.ts';
import { creerJournal } from '../src/trace/index.ts';
import { creerSimulation, DEPENDANCES_TEMOIN } from '../src/moteur/index.ts';
import type { Dependances } from '../src/moteur/index.ts';

const trace = (instant_s: number, coureurId = 'a'): TraceDecision => ({ coureurId, instant_s } as unknown as TraceDecision);

describe('journal de traces (mémoire bornée)', () => {
  it('garde les plus récentes, dans l’ordre, et oublie les plus anciennes', () => {
    const j = creerJournal(3);
    for (let i = 0; i < 5; i++) j.enregistrer(trace(i));
    expect(j.taille_n('a')).toBe(3);
    expect([0, 1, 2].map((r) => j.lire('a', r)?.instant_s)).toEqual([2, 3, 4]);
    expect(j.derniere('a')?.instant_s).toBe(4);
    expect(j.lire('a', 3)).toBeUndefined();
    expect(j.lire('a', -1)).toBeUndefined();
    expect(j.totalEnregistre_n()).toBe(5);
  });
  it('borne chaque coureur séparément', () => {
    const j = creerJournal(2);
    for (let i = 0; i < 4; i++) { j.enregistrer(trace(i, 'a')); j.enregistrer(trace(i, 'b')); }
    expect([j.taille_n('a'), j.taille_n('b'), j.taille_n('inconnu')]).toEqual([2, 2, 0]);
    expect(j.derniere('inconnu')).toBeUndefined();
  });
  it('refuse une capacité invalide', () => {
    expect(() => creerJournal(0)).toThrow();
    expect(() => creerJournal(1.5)).toThrow();
  });
});

describe('aucune décision sans trace', () => {
  it('chaque appel d’Agir (= une décision) laisse exactement une trace', () => {
    let decisions = 0;
    const dep: Dependances = { ...DEPENDANCES_TEMOIN, agir: (...a) => { decisions++; return DEPENDANCES_TEMOIN.agir(...a); } };
    const sim = creerSimulation(1, { dependances: dep, capaciteJournal_n: 50 });
    for (const n of [1, 7, 64, 3]) {
      sim.avancer(n);
      expect(sim.journal.totalEnregistre_n()).toBe(decisions);
    }
    expect(decisions).toBe(75);
  });

  it('la trace garde le perçu et le réel côte à côte, même quand ils diffèrent', () => {
    // Un percevoir biaisé : le coureur se croit 1 m/s plus rapide qu'il n'est.
    const biaise: Percevoir = (o, m, a) => {
      const r = DEPENDANCES_TEMOIN.percevoir(o, m, a);
      return { ...r, sortie: { ...r.sortie, corps: { ...r.sortie.corps, vitesse_m_s: r.sortie.corps.vitesse_m_s + 1 } } };
    };
    const sim = creerSimulation(1, { dependances: { ...DEPENDANCES_TEMOIN, percevoir: biaise } });
    sim.avancer(40);
    const t = sim.journal.derniere('temoin');
    const ecart = t?.ecartsPercuReel.find((e) => e.grandeur === 'vitesse');
    expect(ecart).toBeDefined();
    expect(ecart!.percu - ecart!.reel).toBeCloseTo(1);
    // le réel de la trace est bien celui du monde au moment de la décision (avant le pas)
    const apres = sim.instantane().coureurs[0]!.vitesse_m_s;
    expect(ecart!.reel).toBeLessThanOrEqual(apres);
    expect(ecart!.reel).toBeGreaterThan(5);
  });
});

describe('mémoire de la trace bornée', () => {
  it('sur 100 000 pas, le journal ne dépasse jamais sa capacité et garde les plus récents', () => {
    const sim = creerSimulation(1, { capaciteJournal_n: 500 });
    let maxTaille = 0;
    for (let i = 0; i < 1000; i++) {
      sim.avancer(100);
      maxTaille = Math.max(maxTaille, sim.journal.taille_n('temoin'));
    }
    expect(maxTaille).toBe(500);
    expect(sim.journal.totalEnregistre_n()).toBe(100_000);
    expect(sim.journal.lire('temoin', 0)?.instant_s).toBeCloseTo((100_000 - 500) * 0.25);
    expect(sim.journal.derniere('temoin')?.instant_s).toBeCloseTo(99_999 * 0.25);
  });
});

describe('déterminisme', () => {
  it('même seed => mêmes traces, quel que soit le nombre de pas par appel (×1, ×7, ×64)', () => {
    const jouer = (parAppel: number): string => {
      const sim = creerSimulation(42, { capaciteJournal_n: 1000 });
      for (let fait = 0; fait < 640; fait += parAppel) sim.avancer(parAppel);
      const n = sim.journal.taille_n('temoin');
      return JSON.stringify(Array.from({ length: n }, (_, r) => sim.journal.lire('temoin', r)));
    };
    const ref = jouer(1);
    expect(jouer(64)).toBe(ref);
    expect(jouer(10)).toBe(ref);
    expect(ref.length).toBeGreaterThan(1000);
  });
});
