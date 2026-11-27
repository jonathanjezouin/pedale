import { describe, expect, it } from 'vitest';
import type { Croyances, MemoireVouloir, Volonte, Volontes } from '../src/contrats/index.ts';
import { dansLeCadre, vouloir } from '../src/esprit/index.ts';
import { creerAlea, creerPartieTemoin, DEPENDANCES_TEMOIN, memoireInitiale, pas } from '../src/moteur/index.ts';

// ---------- Aides ----------
interface Cas { t: number; v?: number; reserve?: number; reste?: number }
const croyances = ({ t, v = 10, reserve = 1, reste = 9_000 }: Cas): Croyances => ({
  etage: 'croyances',
  instant_s: t,
  soi: {
    vitesse_m_s: v,
    reserveLongueEstimee_ratio: reserve,
    reserveCourteEstimee_ratio: 1,
    puissanceSoutenable_w: 250 * (0.6 + 0.4 * reserve),
    abriEstime_ratio: 0,
  },
  resteAParcourir: { distance_m: reste, tempsEstime_s: reste / Math.max(v, 0.1) },
  routeDevant: [],
  autres: [],
});

/** Enchaîne des pas de Vouloir en repassant la mémoire, et rend chaque résultat. */
function derouler(cas: Cas[]): Volontes[] {
  let memoire: MemoireVouloir = memoireInitiale().vouloir;
  return cas.map((c) => {
    const r = vouloir(croyances(c), memoire);
    memoire = r.memoire;
    return r.sortie;
  });
}
const causes = (v: Volonte): string[] => v.raisons.filter((r) => r.code.startsWith('reevaluation:')).map((r) => r.code);
const niveaux = (v: Volontes): Volonte[] => [v.objectif, v.intention, v.manoeuvre];

// ---------- 1. Le cadre est toujours respecté ----------
describe('cadre descendant', () => {
  it('le niveau inférieur ne sort jamais du cadre reçu (1 000 tirages)', () => {
    const alea = creerAlea(2024);
    let memoire: MemoireVouloir = memoireInitiale().vouloir;
    let t = 0;
    for (let i = 0; i < 1000; i++) {
      t += alea.suivant() * 6; // des sauts de temps variés : échéances franchies ou non
      const c = croyances({
        t,
        v: alea.suivant() * 16,
        reserve: alea.suivant(),
        reste: alea.suivant() < 0.2 ? alea.suivant() * 500 : 500 + alea.suivant() * 9_000,
      });
      const r = vouloir(c, memoire);
      memoire = r.memoire;
      const { objectif, intention, manoeuvre } = r.sortie;
      expect(dansLeCadre(intention, objectif.cadre), `intention hors cadre au tirage ${i}`).toBe(true);
      expect(dansLeCadre(manoeuvre, intention.cadre), `manœuvre hors cadre au tirage ${i}`).toBe(true);
    }
  });

  it('témoin positif : dansLeCadre détecte bien une sortie de cadre', () => {
    const [v] = derouler([{ t: 0 }]);
    if (!v) throw new Error('pas de sortie');
    const hors: Volonte = { ...v.manoeuvre, visees: [{ grandeur: 'puissanceVisee_w', valeur: 10_000 }] };
    expect(dansLeCadre(hors, v.intention.cadre)).toBe(false);
    const horsCadre: Volonte = { ...v.intention, cadre: [{ grandeur: 'puissanceVisee_w', min: 0, max: 10_000 }] };
    expect(dansLeCadre(horsCadre, v.objectif.cadre)).toBe(false);
  });
});

// ---------- 2. Remontée d'impossibilité : un niveau, pas plus haut ----------
describe('remontée d’impossibilité', () => {
  it('provoque la réévaluation du niveau juste au-dessus, et pas de l’objectif', () => {
    const [a, b] = derouler([{ t: 0, reserve: 0.4 }, { t: 0.25, v: 0, reserve: 0.4 }]);
    if (!a || !b) throw new Error('pas de sortie');
    // à t = 0 tout a été évalué
    expect(niveaux(a).map((n) => n.evalueeA_s)).toEqual([0, 0, 0]);
    // à t = 0,25 (réserve 40 % : cadre ≈ 218 W) ne tient même pas la vitesse visée (225 W) : l'intention se réévalue, pas l'objectif
    expect(b.objectif.evalueeA_s).toBe(0);
    expect(b.intention.evalueeA_s).toBe(0.25);
    expect(causes(b.intention)).toContain('reevaluation:impossibilite_remontee');
    expect(b.intention.raisons.map((r) => r.code)).toContain('impossibilite_remontee');
    expect(b.intention.but).toBe('tenir_la_vitesse_acceptee');
    expect(b.manoeuvre.evalueeA_s).toBe(0.25);
  });

  it('sans impossibilité, l’intention n’est pas réévaluée', () => {
    const [, b] = derouler([{ t: 0 }, { t: 0.25, v: 9.9 }]);
    expect(b?.intention.evalueeA_s).toBe(0);
  });

  it('l’impossibilité de l’intention remonte à l’objectif, qui passe en prudence', () => {
    const [, b] = derouler([{ t: 0, reserve: 0.02 }, { t: 0.25, v: 5, reserve: 0.02 }]);
    if (!b) throw new Error('pas de sortie');
    expect(b.objectif.evalueeA_s).toBe(0.25);
    expect(causes(b.objectif)).toContain('reevaluation:impossibilite_remontee');
    expect(b.objectif.but).toBe('finir_sans_forcer');
    // et le cadre reçu par les niveaux inférieurs a bien été resserré
    expect(dansLeCadre(b.intention, b.objectif.cadre)).toBe(true);
    expect(dansLeCadre(b.manoeuvre, b.intention.cadre)).toBe(true);
  });
});

describe('remontée : seulement ce qui est nouveau', () => {
  it('une impossibilité qui dure ne re-sollicite pas l’objectif à chaque pas', () => {
    const suite = derouler([{ t: 0, reserve: 0.02 }, { t: 0.25, reserve: 0.02 }, { t: 0.5, reserve: 0.02 }]);
    // l'objectif a réagi une fois (au premier pas), puis il est laissé tranquille
    expect(suite.map((s) => s.objectif.evalueeA_s)).toEqual([0, 0, 0]);
    expect(suite[0]?.objectif.but).toBe('finir_sans_forcer');
  });
});

// ---------- 3. Chaque niveau a sa cadence ----------
describe('cadence de réévaluation', () => {
  it('la manœuvre se réévalue à chaque pas', () => {
    const suite = derouler([{ t: 0 }, { t: 0.25 }, { t: 0.5 }]);
    expect(suite.map((s) => s.manoeuvre.evalueeA_s)).toEqual([0, 0.25, 0.5]);
    expect(suite.map((s) => s.intention.evalueeA_s)).toEqual([0, 0, 0]);
  });

  it('l’intention se réévalue à son échéance (10 s)', () => {
    const [, avant, apres] = derouler([{ t: 0 }, { t: 9.75 }, { t: 10 }]);
    expect(avant?.intention.evalueeA_s).toBe(0);
    expect(apres?.intention.evalueeA_s).toBe(10);
    expect(causes(apres?.intention as Volonte)).toEqual(['reevaluation:echeance']);
  });

  it('l’intention se réévalue quand la réserve devient basse (déclencheur), une seule fois', () => {
    const [, a, b] = derouler([{ t: 0 }, { t: 1, reserve: 0.2 }, { t: 2, reserve: 0.2 }]);
    expect(a?.intention.evalueeA_s).toBe(1);
    expect(causes(a?.intention as Volonte)).toEqual(['reevaluation:declencheur:reserve_basse']);
    expect(a?.objectif.evalueeA_s).toBe(0); // l'objectif ne bouge pas
    expect(b?.intention.evalueeA_s).toBe(1); // l'événement persiste : pas de nouveau déclenchement
  });

  it('l’objectif se réévalue quand l’arrivée devient proche (déclencheur), puis le cadre redescend en cascade', () => {
    const [, a] = derouler([{ t: 0 }, { t: 1, reste: 400 }]);
    if (!a) throw new Error('pas de sortie');
    expect(causes(a.objectif)).toEqual(['reevaluation:declencheur:fin_de_piste_proche']);
    expect(a.objectif.but).toBe('finir_en_force');
    // son cadre a changé : l'intention se réévalue pour cette seule raison
    expect(causes(a.intention)).toEqual(['reevaluation:cadre_modifie']);
    expect(a.manoeuvre.evalueeA_s).toBe(1);
  });

  it('l’objectif n’a pas d’échéance : même après très longtemps il ne se réévalue pas seul', () => {
    const [, a] = derouler([{ t: 0 }, { t: 100_000 }]);
    expect(a?.objectif.evalueeA_s).toBe(0);
    expect(a?.intention.evalueeA_s).toBe(100_000); // elle, oui (échéance)
  });
});

// ---------- 4. Les raisons de chaque niveau sont dans la trace ----------
describe('trace du Vouloir', () => {
  it('chaque niveau écrit ses raisons, y compris pourquoi il s’est réévalué', () => {
    const { traces } = pas(creerPartieTemoin(1), DEPENDANCES_TEMOIN);
    const t = traces[0];
    if (!t) throw new Error('pas de trace');
    const produit = t.vouloir.produit as Volontes;
    for (const n of niveaux(produit)) {
      expect(n.raisons.length).toBeGreaterThan(1);
      expect(causes(n).length).toBe(1);
      // et la trace plate de l'étage reprend ces raisons, étiquetées par niveau
      for (const r of n.raisons) expect(t.vouloir.raisons.map((x) => x.code)).toContain(`${n.niveau}:${r.code}`);
    }
  });

  it('sur 1 000 pas du moteur, chaque décision porte les raisons des trois niveaux', () => {
    let partie = creerPartieTemoin(3);
    for (let i = 0; i < 1000; i++) {
      const r = pas(partie, DEPENDANCES_TEMOIN);
      partie = r.partie;
      const flat = r.traces[0]?.vouloir.raisons.map((x) => x.code.split(':')[0]) ?? [];
      expect(new Set(flat)).toEqual(new Set(['objectif', 'intention', 'manoeuvre']));
    }
  });
});
