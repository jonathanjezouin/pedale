import { describe, expect, it } from 'vitest';
import {
  DISTANCE_MAX, DISTANCE_MIN, aUnColDecisif, FOURCHETTES, LECTURE, PAS, RAYON_MIN_LACET, TYPES, denivelePositif, evaluer, genererParcours, penteMax, violations,
} from '../src/index';
import type { TypeEtape } from '../src/index';

/** Construit un profil à partir de segments : plat (longueur), montée / descente (longueur, pente en %). Distances en mètres. */
type Seg = ['plat', number] | ['mont', number, number] | ['desc', number, number];
function profil(segs: Seg[], alt0 = 100) {
  const alt: number[] = [alt0];
  for (const s of segs) {
    const n = Math.round(s[1] / PAS), g = s[0] === 'plat' ? 0 : s[0] === 'mont' ? s[2]! : -s[2]!;
    for (let i = 0; i < n; i++) alt.push(alt[alt.length - 1]! + (g * PAS) / 100);
  }
  return { pas: PAS, alt };
}
const km = (v: number) => v * 1000;
const echantillon = (type: TypeEtape, n: number, f: (i: number) => number = (i) => 20 + ((i * 37) % 230)) =>
  Array.from({ length: n }, (_, i) => genererParcours({ seed: 100 + i, distance: km(f(i)), type }));

describe('génération : déterminisme et bornes', () => {
  it('est déterministe : même (seed, distance, type), même parcours', () => {
    const a = genererParcours({ seed: 7, distance: km(120), type: 'vallonnee' }), b = genererParcours({ seed: 7, distance: km(120), type: 'vallonnee' });
    expect(Array.from(a.alt)).toEqual(Array.from(b.alt));
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    expect(a.finale).toBe(b.finale);
    const c = genererParcours({ seed: 8, distance: km(120), type: 'vallonnee' });
    expect(Array.from(c.alt)).not.toEqual(Array.from(a.alt));
  });
  it('borne la distance à 20-250 km et échantillonne tous les 20 m', () => {
    expect(genererParcours({ seed: 1, distance: km(5), type: 'plate' }).distance).toBe(DISTANCE_MIN);
    expect(genererParcours({ seed: 1, distance: km(900), type: 'plate' }).distance).toBe(DISTANCE_MAX);
    const p = genererParcours({ seed: 1, distance: km(60), type: 'montagne' });
    expect(p.n).toBe(p.distance / PAS + 1);
    expect(p.alt.length).toBe(p.n); expect(p.x.length).toBe(p.n); expect(p.cap.length).toBe(p.n);
  });
  it("l'altitude et le tracé sont finis, l'altitude reste positive, le tracé démarre en (0, 0)", () => {
    for (const type of TYPES) {
      const p = genererParcours({ seed: 3, distance: km(90), type });
      expect(Array.from(p.alt).every((v) => Number.isFinite(v) && v > 0)).toBe(true);
      expect(Array.from(p.x).concat(Array.from(p.y)).every(Number.isFinite)).toBe(true);
      expect([p.x[0], p.y[0]]).toEqual([0, 0]);
    }
  });
});

describe('génération : fourchettes par type (docs/v0.0.3-parcours.md §3)', () => {
  for (const type of TYPES) {
    it(`${type} : D+/km dans la fourchette, pentes bornées, aucun recoupement (40 étapes)`, () => {
      const F = FOURCHETTES[type];
      for (const p of echantillon(type, 40)) {
        const dens = p.denivele / (p.distance / 1000);
        expect(dens).toBeGreaterThanOrEqual(F.dens[0] * 0.9); expect(dens).toBeLessThanOrEqual(F.dens[1] * 1.1);
        const pm = penteMax(p.alt);
        expect(pm.montee).toBeLessThanOrEqual(F.penteMax + 0.6); expect(pm.descente).toBeLessThanOrEqual(F.penteMax + 0.6);
        expect(p.sansRecoupement).toBe(true);
        expect(p.conforme).toBe(true);
      }
    });
  }
  it('les montées lues ont les pentes moyennes du type : vallonnée 4-9 % (médiane ~6-7 %), montagne 5-9 %', () => {
    const pentes = (type: TypeEtape, Lmin: number) => echantillon(type, 40).flatMap((p) => evaluer(p).montees.filter((m) => m.longueur >= Lmin).map((m) => m.pente)).sort((a, b) => a - b);
    const v = pentes('vallonnee', 1000), m = pentes('montagne', 5000);
    expect(v.length).toBeGreaterThan(100); expect(m.length).toBeGreaterThan(30);
    expect(v[Math.floor(v.length / 2)]!).toBeGreaterThan(5); expect(v[Math.floor(v.length / 2)]!).toBeLessThan(8);
    expect(v[Math.floor(v.length * 0.9)]!).toBeLessThan(10.5);
    expect(m[Math.floor(m.length / 2)]!).toBeGreaterThan(5); expect(m[Math.floor(m.length / 2)]!).toBeLessThan(9);
  });
  it('plate : sans bosse, le fond reste sous 2 %', () => {
    let vus = 0;
    for (const p of echantillon('plate', 40)) if (p.elements.length === 0) { vus++; expect(penteMax(p.alt).montee).toBeLessThanOrEqual(2.2); expect(penteMax(p.alt).descente).toBeLessThanOrEqual(2.2); }
    expect(vus).toBeGreaterThan(5);
  });
  it("le nombre d'éléments se déduit du D+ visé, donc de la distance : un seul col sur 20 km, plusieurs sur 250 km", () => {
    const courts = echantillon('montagne', 20, () => 20), longs = echantillon('montagne', 20, () => 250);
    for (const p of courts) { const cols = p.elements.filter((e) => e.sorte === 'col').length; expect(cols).toBeGreaterThanOrEqual(1); expect(cols).toBeLessThanOrEqual(2); }
    for (const p of longs) expect(p.elements.filter((e) => e.sorte === 'col').length).toBeGreaterThanOrEqual(3);
    // aucun col ne dépasse la moitié de la distance
    for (const p of courts.concat(longs)) for (const e of p.elements) expect(e.sommet - e.debut).toBeLessThanOrEqual(0.5 * p.distance + PAS);
    // vallonnée : 3 à 8 bosses pour 100 km, ordre de grandeur
    const val = echantillon('vallonnee', 20, () => 100);
    const moy = val.reduce((s, p) => s + p.elements.length, 0) / val.length;
    expect(moy).toBeGreaterThan(3); expect(moy).toBeLessThan(10);
  });
  it('montagne : au moins un col décisif (2e catégorie ou mieux) dans les 40 derniers km ou le dernier tiers', () => {
    for (const p of echantillon('montagne', 40)) {
      const ev = evaluer(p);
      expect(aUnColDecisif(ev, p.distance)).toBe(true);
    }
  });
  it('la finale est tirée selon le type et se lit : « sommet » donne une arrivée au sommet, plate ne donne ni sommet ni descente', () => {
    const vues = new Set<string>();
    for (const type of TYPES) for (const p of echantillon(type, 50)) {
      vues.add(`${type}/${p.finale}`);
      if (type === 'plate') expect(['plat', 'bosse']).toContain(p.finale);
      if (p.finale === 'sommet') expect(evaluer(p).finale.arriveeEnCote).toBe(true);
    }
    for (const t of ['plate/plat', 'vallonnee/plat', 'vallonnee/bosse', 'vallonnee/descente', 'vallonnee/sommet', 'montagne/sommet', 'montagne/descente', 'montagne/plat', 'montagne/bosse']) expect(vues.has(t)).toBe(true);
    // on peut imposer la finale
    expect(genererParcours({ seed: 5, distance: km(100), type: 'montagne', finale: 'sommet' }).finale).toBe('sommet');
  });
  it('conforme au premier tirage dans au moins 90 % des cas (qualité du générateur, avant retirage)', () => {
    for (const type of TYPES) { const e = echantillon(type, 60); expect(e.filter((p) => p.essais === 1).length / e.length).toBeGreaterThanOrEqual(0.9); }
  });
});

describe('tracé en plan (docs/v0.0.3-parcours.md §5)', () => {
  it('la sinuosité suit le terrain : plat 500 m+, vallonné 100 m+, lacets doux en montagne (80 m+)', () => {
    for (const p of echantillon('plate', 20)) expect(p.rayonMin).toBeGreaterThanOrEqual(500);
    for (const p of echantillon('vallonnee', 20)) expect(p.rayonMin).toBeGreaterThanOrEqual(100);
    for (const p of echantillon('montagne', 20)) expect(p.rayonMin).toBeGreaterThanOrEqual(RAYON_MIN_LACET * 0.95);
  });
  it('plus de virages serrés en montagne qu\'à plat', () => {
    const med = (t: TypeEtape) => { const r = echantillon(t, 15).map((p) => p.rayonMin).sort((a, b) => a - b); return r[Math.floor(r.length / 2)]!; };
    expect(med('montagne')).toBeLessThan(med('vallonnee') + 1); expect(med('vallonnee')).toBeLessThan(med('plate'));
  });
  it("la longueur du tracé est la distance de l'étape et le cap est continu", () => {
    const p = genererParcours({ seed: 11, distance: km(80), type: 'montagne' });
    let l = 0, saut = 0;
    for (let i = 1; i < p.n; i++) { l += Math.hypot(p.x[i]! - p.x[i - 1]!, p.y[i]! - p.y[i - 1]!); saut = Math.max(saut, Math.abs(p.cap[i]! - p.cap[i - 1]!)); }
    expect(l).toBeGreaterThan(p.distance * 0.99); expect(l).toBeLessThan(p.distance * 1.01);
    expect(saut).toBeLessThan(PAS / RAYON_MIN_LACET + 0.05);
  });
  it("l'étape va de A à B : le tracé ne s'enroule pas (écart A-B d'au moins 15 % de la distance)", () => {
    for (const type of TYPES) for (const p of echantillon(type, 15)) expect(Math.hypot(p.x[p.n - 1]!, p.y[p.n - 1]!)).toBeGreaterThan(0.15 * p.distance);
  });
});

describe("évaluer : une fonction pure sur les altitudes (docs/v0.0.3-parcours.md §6)", () => {
  it('ne modifie pas son entrée et donne le même résultat deux fois', () => {
    const p = profil([['plat', km(5)], ['mont', km(8), 7], ['desc', km(5), 6], ['plat', km(3)]]);
    const avant = JSON.stringify(p.alt);
    const a = evaluer(p), b = evaluer(p);
    expect(JSON.stringify(p.alt)).toBe(avant);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('un profil plat : pas de montée, finale pour sprinteurs, se lit « plate »', () => {
    const ev = evaluer(profil([['plat', km(100)]]));
    expect(ev.montees).toHaveLength(0);
    expect(ev.finale.sprint).toBeGreaterThan(0.95);
    expect(ev.typeLu).toBe('plate');
    expect(ev.phrase).toMatch(/plate.*sprinteurs/);
    expect(ev.finale.arriveeEnCote).toBe(false);
  });
  it('un col de 12 km à 7 % avec arrivée au sommet : 1re catégorie, arrivée en côte, finale pour grimpeurs', () => {
    const ev = evaluer(profil([['plat', km(40)], ['mont', km(12), 7]]));
    expect(ev.montees).toHaveLength(1);
    const m = ev.montees[0]!;
    expect(m.categorie).toBe('1'); expect(m.arriveeAuSommet).toBe(true); expect(m.poids).toBe(1);
    expect(m.longueur).toBeCloseTo(12000, -2); expect(m.pente).toBeCloseTo(7, 0);
    expect(ev.finale.arriveeEnCote).toBe(true);
    expect(ev.finale.grimpeur).toBeGreaterThan(0.6);
    expect(ev.phrase).toMatch(/arrivée au sommet.*grimpeurs/);
  });
  it('le même col suivi de 100 km de plat ne pèse presque plus : étape plate, finale pour sprinteurs', () => {
    const ev = evaluer(profil([['plat', km(10)], ['mont', km(12), 7], ['desc', km(12), 7], ['plat', km(100)]]));
    expect(ev.montees[0]!.poids).toBeLessThan(0.05);
    expect(ev.finale.sprint).toBeGreaterThan(0.9);
    expect(ev.phrase).toMatch(/sprinteurs/);
  });
  it('un col à 35 km de l\'arrivée, puis descente et plat : le groupe peut se reformer', () => {
    const ev = evaluer(profil([['plat', km(30)], ['mont', km(12), 7], ['desc', km(15), 5.6], ['plat', km(20)]]));
    const m = ev.montees[0]!;
    expect(m.distanceArrivee).toBeCloseTo(35000, -2);
    expect(m.apres.nature).toBe('descente');
    expect(ev.finale.sprint).toBeGreaterThan(0.3);
    expect(ev.phrase).toMatch(/1re catégorie/); expect(ev.phrase).toMatch(/à 35 km de l'arrivée/); expect(ev.phrase).toMatch(/le groupe peut se reformer/);
  });
  it('le poids d\'une montée décroît avec sa distance à l\'arrivée : 1 dans les 10 derniers km, de moins en moins ensuite', () => {
    const poids = (apres: number) => evaluer(profil([['plat', km(20)], ['mont', km(10), 6], ['desc', km(Math.min(apres, 10)), 6], ['plat', km(Math.max(0, apres - 10))]])).montees[0]!.poids;
    expect(poids(8)).toBeGreaterThan(0.95);
    expect(poids(40)).toBeLessThan(poids(20)); expect(poids(100)).toBeLessThan(poids(40));
    expect(poids(100)).toBeLessThan(0.1);
  });
  it('fusion des montées : un replat court ne coupe pas, un long oui', () => {
    const court = evaluer(profil([['plat', km(2)], ['mont', km(3), 7], ['plat', 300], ['mont', km(3), 7], ['plat', km(1)]]));
    expect(court.montees).toHaveLength(1);
    const long = evaluer(profil([['plat', km(2)], ['mont', km(3), 7], ['plat', km(2)], ['mont', km(3), 7], ['plat', km(1)]]));
    expect(long.montees).toHaveLength(2);
  });
  it('catégories : HC, 1re, 2e, 3e, 4e et bosse non classée', () => {
    const cat = (L: number, g: number) => evaluer(profil([['plat', km(1)], ['mont', L, g], ['plat', km(1)]])).montees[0]?.categorie;
    expect(cat(km(14), 8)).toBe('HC'); expect(cat(km(10), 7.2)).toBe('1'); expect(cat(km(6.5), 6)).toBe('2'); expect(cat(km(3), 6)).toBe('3');
    expect(cat(km(1.5), 5)).toBe('4'); expect(cat(km(1), 4)).toBe('bosse');
  });
  it('pente max sur 500 m : elle voit la rampe que la pente moyenne cache', () => {
    const ev = evaluer(profil([['plat', km(1)], ['mont', km(2), 5], ['mont', 600, 11], ['mont', km(2), 5], ['plat', km(1)]]));
    const m = ev.montees[0]!;
    expect(m.penteMax500).toBeGreaterThan(m.pente + 1.5);
  });
  it('le D+ ignore les ondulations de moins de 3 m (compteur à hystérésis)', () => {
    const dents = Array.from({ length: 1000 }, (_, i) => 100 + (i % 2 ? 2 : 0));
    expect(denivelePositif(dents)).toBeLessThan(3.1);
    const marches = Array.from({ length: 1000 }, (_, i) => 100 + 10 * Math.floor(i / 100));
    expect(denivelePositif(marches)).toBeCloseTo(90, 0);
  });
  it('évaluer un morceau : seules les montées du morceau comptent, l\'arrivée peut être ailleurs que la fin du morceau', () => {
    const p = profil([['plat', km(20)], ['mont', km(10), 6], ['desc', km(10), 6], ['plat', km(10)], ['mont', km(6), 7], ['plat', km(4)]]);
    const tout = evaluer(p);
    expect(tout.montees).toHaveLength(2);
    // depuis le sommet du premier col jusqu'à la ligne : une seule montée, et son poids dépend de la distance à l'arrivée
    const reste = evaluer(p, km(30), p.alt.length * PAS - PAS);
    expect(reste.montees).toHaveLength(1);
    // le même morceau mais l'arrivée plus loin (un coureur à qui l'on dit « la ligne est à 200 km ») : le col pèse moins
    const loin = evaluer(p, km(30), km(60), km(260));
    expect(loin.montees[0]!.poids).toBeLessThan(reste.montees[0]!.poids);
  });
  it('lit le type : D+/km et présence d\'un col (plate < 9, vallonnée 9-19, montagne ≥ 19 avec un col)', () => {
    expect(evaluer(profil([['plat', km(50)]])).typeLu).toBe('plate');
    const rolling: Seg[] = []; for (let i = 0; i < 10; i++) rolling.push(['mont', km(1.5), 5], ['desc', km(3.5), 2.1], ['plat', km(1)]);
    expect(evaluer(profil(rolling)).typeLu).toBe('vallonnee');
    expect(evaluer(profil([['plat', km(10)], ['mont', km(14), 7.5], ['desc', km(12), 8], ['plat', km(4)]])).typeLu).toBe('montagne');
  });
  it('durée : monter est plus long que descendre, et la durée croît avec la distance', () => {
    const d = (segs: Seg[]) => evaluer(profil(segs)).duree;
    expect(d([['mont', km(10), 6]])).toBeGreaterThan(d([['plat', km(10)]]));
    expect(d([['plat', km(10)]])).toBeGreaterThan(d([['desc', km(10), 4]]));
    expect(d([['plat', km(20)]])).toBeGreaterThan(1.9 * d([['plat', km(10)]]));
  });
  it('D+ pondéré : à D+ égal, des montées plus raides usent davantage', () => {
    const doux = evaluer(profil([['mont', km(10), 4], ['desc', km(10), 4]]));
    const raide = evaluer(profil([['mont', km(4), 10], ['desc', km(4), 10], ['plat', km(12)]]));
    expect(doux.denivele).toBeCloseTo(raide.denivele, -1);
    expect(raide.denivelePondere).toBeGreaterThan(doux.denivelePondere);
  });
  it('la lecture est réglée par des seuils nommés', () => {
    expect(LECTURE.penteMontee).toBe(3);
    expect(LECTURE.seuilsCategorie.map(([c]) => c)).toEqual(['HC', '1', '2', '3', '4']);
  });
});

describe('violations : ce que le contrôle reproche à une étape', () => {
  it('une étape conforme n\'a aucune violation', () => {
    const p = genererParcours({ seed: 4, distance: km(100), type: 'vallonnee' });
    expect(violations(p)).toEqual([]);
  });
  it('une étape qui ne se lit pas comme demandée est signalée', () => {
    const p = genererParcours({ seed: 4, distance: km(100), type: 'vallonnee' });
    const faux = { ...p, type: 'montagne' as const };
    expect(violations(faux).some((v) => /montagne/.test(v))).toBe(true);
  });
});
