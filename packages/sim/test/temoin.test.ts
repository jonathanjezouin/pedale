import { describe, expect, it } from 'vitest';
import type { Commandes, Croyances, Observation, Percu, Volontes } from '../src/contrats/index.ts';
import { agir, interpreter, percevoir, vouloir } from '../src/esprit/index.ts';
import { creerMondeTemoin, observer, appliquerPhysique } from '../src/monde/index.ts';
import { creerAlea, creerPartieTemoin, DEPENDANCES_TEMOIN, memoireInitiale, pas } from '../src/moteur/index.ts';
import type { Dependances, Partie } from '../src/moteur/index.ts';

// ---------- Entrées écrites à la main ----------
const observation = (vitesse_m_s: number, reserve = 1): Observation => ({
  etage: 'observation',
  instant_s: 12,
  corps: { vitesse_m_s, puissanceDelivree_w: 200, reserveLongue_ratio: reserve, reserveCourte_ratio: 1 },
  position: { s_m: 500, d_m: 0, capRelatif_rad: 0 },
  distanceArrivee_m: 9_500,
  routeDevant: [{ devant_m: 10, pente_ratio: 0, courbure_rad_m: 0, demiLargeurGauche_m: 3, demiLargeurDroite_m: 3 }],
  vent: { vitesse_m_s: vitesse_m_s, provenance_rad: 0 },
  coureursVisibles: [{ id: 'autre', ecartDevant_m: 20, ecartLateral_m: -1, vitesse_m_s: 9 }],
});
const percuDe = (o: Observation): Percu => ({ ...o, etage: 'percu' });
const memoire = memoireInitiale();
const puissanceVisee = (v: Volontes): number =>
  v.manoeuvre.visees.find((x) => x.grandeur === 'puissanceVisee_w')?.valeur ?? NaN;

describe('chaque étage seul, avec des entrées écrites à la main', () => {
  it('percevoir : Perçu = Observation (étiquette changée), mémoire mise à jour', () => {
    const o = observation(8);
    const r = percevoir(o, memoire.percevoir, creerAlea(1));
    expect(r.sortie.etage).toBe('percu');
    expect(r.sortie.corps).toEqual(o.corps);
    expect(r.memoire.dernierInstant_s).toBe(12);
    expect(r.raisons.length).toBeGreaterThan(0);
  });

  it('interpréter : croyances sur soi, sur le reste à parcourir et sur les autres', () => {
    const r = interpreter(percuDe(observation(10, 0.5)), memoire.interpreter);
    expect(r.sortie.etage).toBe('croyances');
    expect(r.sortie.soi.vitesse_m_s).toBe(10);
    expect(r.sortie.soi.reserveLongueEstimee_ratio).toBe(0.5);
    expect(r.sortie.resteAParcourir.distance_m).toBe(9_500);
    expect(r.sortie.resteAParcourir.tempsEstime_s).toBeCloseTo(950);
    expect(r.sortie.autres).toHaveLength(1);
    // une réserve plus basse fait croire à une puissance soutenable plus basse
    const pleine = interpreter(percuDe(observation(10, 1)), memoire.interpreter).sortie.soi.puissanceSoutenable_w;
    expect(r.sortie.soi.puissanceSoutenable_w).toBeLessThan(pleine);
  });

  const croyancesA = (v: number, reserve = 1): Croyances =>
    interpreter(percuDe(observation(v, reserve)), memoire.interpreter).sortie;

  it('vouloir : trois niveaux ; trop lent => accélérer, avec la raison nommée', () => {
    const r = vouloir(croyancesA(7), memoire.vouloir);
    expect(r.sortie.objectif.niveau).toBe('objectif');
    expect(r.sortie.intention.niveau).toBe('intention');
    expect(r.sortie.manoeuvre.niveau).toBe('manoeuvre');
    expect(r.sortie.manoeuvre.but).toBe('accelerer');
    expect(r.sortie.manoeuvre.raisons.map((x) => x.code)).toContain('trop_lent');
    expect(puissanceVisee(r.sortie)).toBeGreaterThan(225);
  });

  it('vouloir : à la vitesse cible => entretenir', () => {
    const r = vouloir(croyancesA(10), memoire.vouloir);
    expect(r.sortie.manoeuvre.but).toBe('entretenir');
    expect(r.sortie.manoeuvre.raisons.map((x) => x.code)).toContain('vitesse_ok');
    expect(puissanceVisee(r.sortie)).toBeCloseTo(225);
  });

  it('vouloir : la puissance visée reste dans le cadre de l’intention, sinon impossibilité remontée', () => {
    const c = croyancesA(0, 0); // à l'arrêt, réserve vide : la puissance demandée dépasse le cadre
    const r = vouloir(c, memoire.vouloir);
    const plafond = c.soi.puissanceSoutenable_w * 1.15;
    expect(puissanceVisee(r.sortie)).toBeLessThanOrEqual(plafond + 1e-9);
    expect(r.sortie.manoeuvre.raisons.map((x) => x.code)).toContain('plafond_du_cadre');
    expect(r.sortie.manoeuvre.impossibilite?.code).toBe('cadre_puissance_atteint');
  });

  it('agir : traduit la manœuvre en commandes', () => {
    const v = vouloir(croyancesA(8), memoire.vouloir).sortie;
    const r = agir(v, memoire.agir);
    expect(r.sortie.etage).toBe('commandes');
    expect(r.sortie.puissanceVisee_w).toBe(puissanceVisee(v));
    expect(r.sortie.positionLateraleVisee_m).toBe(0);
    expect(r.sortie.freinage_ratio).toBe(0);
  });
});

describe('le monde cache ce que l’Observation n’expose pas', () => {
  const chaine = (o: Observation) => {
    const p = percevoir(o, memoire.percevoir, creerAlea(1)).sortie;
    const c = interpreter(p, memoire.interpreter).sortie;
    return { p, c };
  };
  const monde = creerMondeTemoin();
  const [moi] = monde.coureurs;
  if (!moi) throw new Error('monde témoin sans coureur');

  it('changer un état caché ne change ni l’Observation, ni le Perçu, ni les Croyances', () => {
    const autre = { ...monde, coureurs: [{ ...moi, masse_kg: 120, puissanceMax_w: 900 }] };
    const a = observer(monde, 'temoin');
    const b = observer(autre, 'temoin');
    expect(b).toEqual(a);
    expect(chaine(b)).toEqual(chaine(a));
  });

  it('témoin positif : changer un état exposé (la vitesse) change bien l’Observation', () => {
    const autre = { ...monde, coureurs: [{ ...moi, vitesse_m_s: 5 }] };
    expect(observer(autre, 'temoin')).not.toEqual(observer(monde, 'temoin'));
  });
});

// ---------- Pureté : rien n’est modifié, sur 1 000 pas ----------
const instantane = (x: unknown): string =>
  JSON.stringify(x, (_k, v: unknown) => (v instanceof Map ? [...v.entries()] : v));

function geler<T>(x: T): T {
  if (typeof x === 'object' && x !== null && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) geler(v);
  }
  return x;
}

/** Enveloppe une fonction : fige ses arguments (toute écriture lève une erreur) et vérifie qu’ils sont identiques après l’appel. */
function surveiller<A extends unknown[], R>(nom: string, f: (...a: A) => R, journal: string[]): (...a: A) => R {
  return (...args: A): R => {
    const avant = instantane(args.filter((a) => typeof a !== 'function' && !(typeof a === 'object' && a !== null && 'suivant' in a)));
    args.forEach((a) => { if (!(typeof a === 'object' && a !== null && 'suivant' in a)) geler(a); });
    journal.push(nom);
    const r = f(...args);
    const apres = instantane(args.filter((a) => typeof a !== 'function' && !(typeof a === 'object' && a !== null && 'suivant' in a)));
    expect(apres, `${nom} a modifié ses entrées`).toBe(avant);
    return r;
  };
}

function depSurveillees(journal: string[]): Dependances {
  const d = DEPENDANCES_TEMOIN;
  return {
    observer: surveiller('observer', d.observer, journal),
    percevoir: surveiller('percevoir', d.percevoir, journal),
    interpreter: surveiller('interpreter', d.interpreter, journal),
    vouloir: surveiller('vouloir', d.vouloir, journal),
    agir: surveiller('agir', d.agir, journal),
    physique: surveiller('physique', d.physique, journal),
  };
}

describe('pureté des étages et de la physique', () => {
  it('aucune fonction ne modifie ses entrées sur 1 000 pas', () => {
    const journal: string[] = [];
    const dep = depSurveillees(journal);
    let partie: Partie = creerPartieTemoin(1);
    for (let i = 0; i < 1000; i++) partie = pas(partie, dep).partie;
    expect(partie.monde.instant_s).toBeCloseTo(250);
    expect(journal.length).toBe(6 * 1000);
  });

  it('la physique ne modifie pas le monde qu’elle reçoit', () => {
    const monde = geler(creerMondeTemoin());
    const cmd: Commandes = { etage: 'commandes', instant_s: 0, puissanceVisee_w: 300, positionLateraleVisee_m: 1, freinage_ratio: 0 };
    const suivant = appliquerPhysique(monde, new Map([['temoin', cmd]]), 0.25);
    expect(suivant).not.toBe(monde);
    expect(suivant.coureurs[0]?.vitesse_m_s).toBeGreaterThan(0);
    expect(monde.coureurs[0]?.vitesse_m_s).toBe(0);
  });
});

describe('le moteur', () => {
  it('un pas appelle les quatre étages dans l’ordre, puis la physique', () => {
    const journal: string[] = [];
    const d = DEPENDANCES_TEMOIN;
    const trace = <A extends unknown[], R>(nom: string, f: (...a: A) => R) => (...a: A): R => { journal.push(nom); return f(...a); };
    const dep: Dependances = {
      observer: trace('observer', d.observer),
      percevoir: trace('percevoir', d.percevoir),
      interpreter: trace('interpreter', d.interpreter),
      vouloir: trace('vouloir', d.vouloir),
      agir: trace('agir', d.agir),
      physique: trace('physique', d.physique),
    };
    pas(creerPartieTemoin(1), dep);
    expect(journal).toEqual(['observer', 'percevoir', 'interpreter', 'vouloir', 'agir', 'physique']);
  });

  it('chaque décision laisse une trace complète, avec perçu et réel côte à côte', () => {
    const { traces } = pas(creerPartieTemoin(1), DEPENDANCES_TEMOIN);
    expect(traces).toHaveLength(1);
    const t = traces[0];
    if (!t) throw new Error('pas de trace');
    for (const e of [t.percevoir, t.interpreter, t.vouloir, t.agir]) {
      expect(e.resume.length).toBeGreaterThan(0);
      expect(e.raisons.length).toBeGreaterThan(0);
    }
    expect(t.percevoir.produit).toBe(t.interpreter.recu);
    expect(t.vouloir.produit).toBe(t.agir.recu);
    expect(t.ecartsPercuReel.map((e) => e.grandeur)).toEqual(['vitesse', 'reserveLongue']);
  });

  it('le témoin avance et se stabilise près de sa vitesse cible', () => {
    let partie = creerPartieTemoin(1);
    for (let i = 0; i < 600; i++) partie = pas(partie, DEPENDANCES_TEMOIN).partie;
    const c = partie.monde.coureurs[0];
    expect(c?.vitesse_m_s).toBeGreaterThan(9.5);
    expect(c?.vitesse_m_s).toBeLessThan(10.5);
    expect(c?.position.s_m).toBeGreaterThan(1000);
  });

  it('même seed => exactement les mêmes traces', () => {
    const jouer = (graine: number) => {
      let partie = creerPartieTemoin(graine);
      const toutes: unknown[] = [];
      for (let i = 0; i < 200; i++) {
        const r = pas(partie, DEPENDANCES_TEMOIN);
        partie = r.partie;
        toutes.push(r.traces);
      }
      return JSON.stringify(toutes);
    };
    expect(jouer(7)).toBe(jouer(7));
  });
});
