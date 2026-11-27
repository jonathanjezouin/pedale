import { describe, expect, it } from 'vitest';
import type { Commandes, EntreePilote, Pilote, Volontes } from '../src/contrats/index.ts';
import { creerPartieTemoin, creerSimulation, DEPENDANCES_TEMOIN, pas } from '../src/moteur/index.ts';
import type { Dependances, Simulation } from '../src/moteur/index.ts';

const N = 400; // 100 s de course

/** Joue N pas en relevant l'instantané après chaque pas : c'est la « trajectoire ». */
function trajectoire(sim: Simulation): string[] {
  const out: string[] = [];
  for (let i = 0; i < N; i++) { sim.avancer(1); out.push(JSON.stringify(sim.instantane())); }
  return out;
}
const decisions = (sim: Simulation) =>
  Array.from({ length: sim.journal.taille_n('temoin') }, (_, r) => sim.journal.lire('temoin', r)!);

/** Référence : l'IA seule. */
function reference() {
  const sim = creerSimulation(7, { capaciteJournal_n: 1000 });
  const traj = trajectoire(sim);
  return { traj, traces: decisions(sim) };
}

/** Pilote qui rejoue une liste de réponses, retrouvées par instant. */
function rejoue<R extends Commandes | Volontes>(parInstant: ReadonlyMap<number, R>): Pilote {
  return ({ percu }) => {
    const r = parInstant.get(percu.instant_s);
    if (!r) throw new Error(`pas de réponse écrite pour t = ${percu.instant_s}`);
    return r;
  };
}

describe('critère 1 : un pilote qui produit les mêmes Commandes que l’IA donne la même trajectoire', () => {
  it('pilote rejouant des Commandes', () => {
    const ref = reference();
    const script = new Map(ref.traces.map((t) => [t.instant_s, t.agir.produit as Commandes]));
    const sim = creerSimulation(7, { capaciteJournal_n: 1000, pilotes: new Map([['temoin', rejoue(script)]]) });
    expect(trajectoire(sim)).toEqual(ref.traj);
    const traces = decisions(sim);
    expect(traces.every((t) => t.source === 'pilote_commandes')).toBe(true);
    expect(traces.map((t) => t.agir.produit)).toEqual(ref.traces.map((t) => t.agir.produit));
  });

  it('pilote rejouant des Volontés (Agir de l’IA les traduit)', () => {
    const ref = reference();
    const script = new Map(ref.traces.map((t) => [t.instant_s, t.vouloir.produit as Volontes]));
    const sim = creerSimulation(7, { capaciteJournal_n: 1000, pilotes: new Map([['temoin', rejoue(script)]]) });
    expect(trajectoire(sim)).toEqual(ref.traj);
    expect(decisions(sim).every((t) => t.source === 'pilote_volontes')).toBe(true);
  });

  it('témoin positif : un pilote qui pédale autrement change bien la trajectoire', () => {
    const ref = reference();
    const lent: Pilote = ({ percu }) => ({ etage: 'commandes', instant_s: percu.instant_s, puissanceVisee_w: 100, positionLateraleVisee_m: 0, freinage_ratio: 0 });
    const sim = creerSimulation(7, { capaciteJournal_n: 1000, pilotes: new Map([['temoin', lent]]) });
    expect(trajectoire(sim)).not.toEqual(ref.traj);
  });

  it('chaque décision pilotée garde ses quatre entrées de trace, avec la raison « pilote externe »', () => {
    const lent: Pilote = ({ percu }) => ({ etage: 'commandes', instant_s: percu.instant_s, puissanceVisee_w: 100, positionLateraleVisee_m: 0, freinage_ratio: 0 });
    const sim = creerSimulation(1, { pilotes: new Map([['temoin', lent]]) });
    sim.avancer(3);
    const t = sim.journal.derniere('temoin')!;
    for (const e of [t.percevoir, t.interpreter, t.vouloir, t.agir]) expect(e.resume.length).toBeGreaterThan(0);
    expect(t.vouloir.raisons.map((r) => r.code)).toEqual(['pilote_externe']);
    expect(t.agir.raisons.map((r) => r.code)).toEqual(['pilote_externe']);
    expect(sim.journal.totalEnregistre_n()).toBe(3);
  });
});

describe('critère 2 : la source externe ne reçoit que Perçu et Croyances, jamais l’état réel', () => {
  const geler = <T>(x: T): T => {
    if (typeof x === 'object' && x !== null && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(geler); }
    return x;
  };
  const constant: Commandes = { etage: 'commandes', instant_s: 0, puissanceVisee_w: 200, positionLateraleVisee_m: 0, freinage_ratio: 0 };

  /** Lance un pas avec un pilote espion et rend ce qu'il a reçu, sous forme de texte. */
  function entreeVuePar(partieDeDepart = creerPartieTemoin(1)): { vues: string[]; brutes: EntreePilote[] } {
    const vues: string[] = [];
    const brutes: EntreePilote[] = [];
    const espion: Pilote = (entree) => {
      brutes.push(entree);
      vues.push(JSON.stringify(entree));
      geler(entree); // si le pilote essayait d'écrire dans ce qu'il reçoit, cela lèverait une erreur
      return constant;
    };
    const dep: Dependances = { ...DEPENDANCES_TEMOIN, pilotes: new Map([['temoin', espion]]) };
    pas(partieDeDepart, dep);
    return { vues, brutes };
  }

  it('l’entrée ne contient que « percu » et « croyances », et ce sont bien les sorties des étages', () => {
    const { brutes } = entreeVuePar();
    expect(brutes).toHaveLength(1);
    const e = brutes[0]!;
    expect(Object.keys(e).sort()).toEqual(['croyances', 'percu']);
    expect(e.percu.etage).toBe('percu');
    expect(e.croyances.etage).toBe('croyances');
  });

  it('aucun champ caché du monde n’apparaît dans ce que reçoit le pilote', () => {
    const [vue] = entreeVuePar().vues;
    for (const cache of ['masse_kg', 'puissanceMax_w', 'energieLongue_j', 'energieLongueMax_j', 'energieCourte_j']) {
      expect(vue).not.toContain(cache);
    }
  });

  it('changer un état caché du monde ne change rien à ce que reçoit le pilote', () => {
    const a = creerPartieTemoin(1);
    const coureur = a.monde.coureurs[0]!;
    const b = { ...a, monde: { ...a.monde, coureurs: [{ ...coureur, masse_kg: 120, puissanceMax_w: 900 }] } };
    expect(entreeVuePar(b).vues).toEqual(entreeVuePar(a).vues);
  });

  it('témoin positif : changer un état exposé (la vitesse) change bien ce que reçoit le pilote', () => {
    const a = creerPartieTemoin(1);
    const coureur = a.monde.coureurs[0]!;
    const b = { ...a, monde: { ...a.monde, coureurs: [{ ...coureur, vitesse_m_s: 6 }] } };
    expect(entreeVuePar(b).vues).not.toEqual(entreeVuePar(a).vues);
  });
});

describe('robustesse du point d’injection', () => {
  it('refuse une réponse qui n’est ni des Volontés ni des Commandes', () => {
    const faux = (() => ({ etage: 'percu' })) as unknown as Pilote;
    const sim = creerSimulation(1, { pilotes: new Map([['temoin', faux]]) });
    expect(() => sim.avancer(1)).toThrow(/Réponse de pilote invalide/);
  });

  it('on peut confier le coureur à une source externe puis le reprendre à l’IA', () => {
    const sim = creerSimulation(1);
    sim.avancer(10);
    const frein: Pilote = ({ percu }) => ({ etage: 'commandes', instant_s: percu.instant_s, puissanceVisee_w: 0, positionLateraleVisee_m: 0, freinage_ratio: 1 });
    sim.definirPilote('temoin', frein);
    sim.avancer(10);
    sim.definirPilote('temoin', null);
    sim.avancer(10);
    const sources = decisions(sim).map((t) => t.source);
    expect(sources.slice(0, 10).every((s) => s === 'ia')).toBe(true);
    expect(sources.slice(10, 20).every((s) => s === 'pilote_commandes')).toBe(true);
    expect(sources.slice(20).every((s) => s === 'ia')).toBe(true);
    // le coureur freiné a bien ralenti, puis l'IA a repris
    const v = (r: number) => decisions(sim)[r]!.percevoir.produit.etage === 'percu' ? (decisions(sim)[r]!.ecartsPercuReel[0]!.reel) : NaN;
    expect(v(19)).toBeLessThan(v(9));
  });
});
