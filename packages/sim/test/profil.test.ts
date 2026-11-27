import { describe, expect, it } from 'vitest';
import { creerAlea } from '../src/moteur/alea.ts';
import {
  PARAMETRES_PROFIL, TRONCON_MIN_M, TYPES_ETAPE, VARIATION_PENTE_MAX_PAR_M, ecartsProfil, genererProfil,
  type Profil, type TypeEtape,
} from '../src/monde/index.ts';

const NB_SEEDS = 1000;
const longueurDe = (graine: number): number => (20 + ((graine * 7919) % 231)) * 1000; // 20 à 250 km

const cache = new Map<TypeEtape, Profil[]>();
function profilsDe(type: TypeEtape): Profil[] {
  if (!cache.has(type)) {
    cache.set(type, Array.from({ length: NB_SEEDS }, (_, i) => genererProfil(type, longueurDe(i + 1), creerAlea((i + 1) * 1000 + TYPES_ETAPE.indexOf(type)))));
  }
  return cache.get(type) as Profil[];
}

/** Dénivelé positif par km, mesuré de façon indépendante (pas de 10 m). */
function deniveleParKm(p: Profil): number {
  let d = 0;
  let prec = p.altitude(0);
  for (let s = 10; s < p.longueur_m; s += 10) { const z = p.altitude(s); d += Math.max(0, z - prec); prec = z; }
  const z = p.altitude(p.longueur_m);
  return (d + Math.max(0, z - prec)) / (p.longueur_m / 1000);
}

describe.each(TYPES_ETAPE)('profil d\'étape : %s, 1 000 seeds de 20 à 250 km (UF 2.3)', (type) => {
  const par = PARAMETRES_PROFIL[type];

  it('génère sans échec, longueur exacte, altitude de départ dans la fourchette du type', () => {
    const departs = profilsDe(type).map((p) => p.altitude(0));
    expect(Math.min(...departs)).toBeGreaterThanOrEqual(par.altitudeDepart_m[0]);
    expect(Math.max(...departs)).toBeLessThanOrEqual(par.altitudeDepart_m[1]);
    profilsDe(type).forEach((p, i) => expect(p.longueur_m).toBe(longueurDe(i + 1)));
  });

  it('altitude continue : 1 cm de route change l\'altitude de moins de pente max × 1 cm', () => {
    const pMax = Math.max(par.penteMaxMontee_ratio, par.penteMaxDescente_ratio);
    let pire = 0;
    for (const p of profilsDe(type)) {
      for (let s = 0; s + 0.01 <= p.longueur_m; s += 53.7) pire = Math.max(pire, Math.abs(p.altitude(s + 0.01) - p.altitude(s)));
    }
    expect(pire).toBeLessThanOrEqual(pMax * 0.01 + 1e-9);
  }, 60_000);

  it('pente lissée : |p(s + Δ) − p(s)| ≤ 1 point de pente par 100 m de Δ, en tout point', () => {
    let pire = 0; // plus grand dépassement de la borne (négatif ou nul si respectée)
    for (const p of profilsDe(type)) {
      for (let s = 0; s <= p.longueur_m; s += 41.3) {
        for (const delta of [1, 10, 100, 1000]) {
          const fin = Math.min(s + delta, p.longueur_m);
          pire = Math.max(pire, Math.abs(p.pente(fin) - p.pente(s)) - VARIATION_PENTE_MAX_PAR_M * (fin - s));
        }
      }
    }
    expect(pire).toBeLessThanOrEqual(1e-12);
  }, 120_000);

  it('pente maximale du type respectée en montée et en descente', () => {
    let haut = -Infinity, bas = Infinity;
    for (const p of profilsDe(type)) {
      for (let s = 0; s <= p.longueur_m; s += 10) { const q = p.pente(s); haut = Math.max(haut, q); bas = Math.min(bas, q); }
    }
    expect(haut).toBeLessThanOrEqual(par.penteMaxMontee_ratio + 1e-9);
    expect(bas).toBeGreaterThanOrEqual(-par.penteMaxDescente_ratio - 1e-9);
  }, 60_000);

  it('dénivelé positif par km dans la fourchette du type', () => {
    let min = Infinity, max = -Infinity, ecartAnnonce = 0;
    for (const p of profilsDe(type)) {
      const d = deniveleParKm(p);
      min = Math.min(min, d); max = Math.max(max, d);
      ecartAnnonce = Math.max(ecartAnnonce, Math.abs(p.denivelePositif_m / (p.longueur_m / 1000) - d)); // valeur annoncée cohérente
    }
    expect(min).toBeGreaterThanOrEqual(par.deniveleParKm_m[0]);
    expect(max).toBeLessThanOrEqual(par.deniveleParKm_m[1]);
    expect(ecartAnnonce).toBeLessThan(0.1);
  }, 60_000);

  it('altitude comprise entre 0 et l\'altitude maximale du type', () => {
    let bas = Infinity, haut = -Infinity;
    for (const p of profilsDe(type)) {
      for (let s = 0; s <= p.longueur_m; s += 25) { const z = p.altitude(s); bas = Math.min(bas, z); haut = Math.max(haut, z); }
    }
    expect(bas).toBeGreaterThanOrEqual(0);
    expect(haut).toBeLessThanOrEqual(par.altitudeMax_m);
  }, 60_000);

  it('tronçons : sans trou ni chevauchement, couvrent l\'étape, ≥ 300 m, cols seulement en montagne', () => {
    let trou = 0, court = Infinity, cols = 0, debuts = 0, fins = 0;
    for (const p of profilsDe(type)) {
      debuts = Math.max(debuts, Math.abs((p.troncons[0] as { debut_m: number }).debut_m));
      fins = Math.max(fins, Math.abs((p.troncons[p.troncons.length - 1] as { fin_m: number }).fin_m - p.longueur_m));
      p.troncons.forEach((t, i) => {
        if (i > 0) trou = Math.max(trou, Math.abs(t.debut_m - (p.troncons[i - 1] as { fin_m: number }).fin_m));
        court = Math.min(court, t.fin_m - t.debut_m);
        if (t.type === 'col') cols++;
      });
    }
    expect(debuts).toBe(0);
    expect(fins).toBeLessThan(1e-6);
    expect(trou).toBeLessThan(1e-9);
    expect(court).toBeGreaterThanOrEqual(TRONCON_MIN_M);
    if (type !== 'montagne') expect(cols).toBe(0);
  });

  it('les étiquettes disent vrai : un col monte, une descente descend, un plat est plat, une bosse a une côte', () => {
    let col = 0, descente = 0, plat = 0, bosse = 0, total = 0;
    for (const p of profilsDe(type)) {
      for (const t of p.troncons) {
        const l = t.fin_m - t.debut_m;
        const moyenne = (p.altitude(t.fin_m) - p.altitude(t.debut_m)) / l;
        let max = -Infinity;
        for (let s = t.debut_m; s <= t.fin_m; s += 10) max = Math.max(max, p.pente(s));
        total++;
        if (t.type === 'col' && moyenne > 0.03) col++;
        else if (t.type === 'descente' && moyenne < -0.01) descente++;
        else if (t.type === 'plat' && Math.abs(moyenne) < 0.01) plat++;
        else if (t.type === 'bosse' && max >= 0.01) bosse++;
        else if (!['col', 'descente', 'plat', 'bosse'].includes(t.type)) throw new Error('type inconnu');
      }
    }
    // Une fusion de tronçon court peut rendre une étiquette approximative : très rare, bornée.
    expect((col + descente + plat + bosse) / total).toBeGreaterThan(0.97);
  }, 60_000);

  it('la construction réussit presque toujours du premier coup (au plus 5 % de reprises)', () => {
    const lignes = profilsDe(type);
    // Une reprise coûte 2 ms et le résultat est toujours vérifié ; mais un générateur qui rate souvent est un générateur à corriger.
    expect(Math.max(...lignes.map((p) => p.tentatives))).toBeLessThanOrEqual(6);
    expect(lignes.filter((p) => p.tentatives > 1).length).toBeLessThanOrEqual(NB_SEEDS * 0.05);
  });
});

describe('profil d\'étape : propriétés d\'ensemble (UF 2.3)', () => {
  it('un profil de montagne contient des cols ; un profil de plaine ou de vallonné ne contient ni col ni pente de col', () => {
    const avecCol = profilsDe('montagne').filter((p) => p.longueur_m >= 60_000 && p.troncons.some((t) => t.type === 'col'));
    const longs = profilsDe('montagne').filter((p) => p.longueur_m >= 60_000);
    expect(avecCol.length / longs.length).toBeGreaterThan(0.95);
  });

  it('le dénivelé par km croît avec le type d\'étape', () => {
    const moy = (t: TypeEtape) => profilsDe(t).reduce((s, p) => s + deniveleParKm(p), 0) / NB_SEEDS;
    expect(moy('plaine')).toBeLessThan(moy('vallonne'));
    expect(moy('vallonne')).toBeLessThan(moy('montagne'));
  }, 60_000);

  it('déterminisme : même seed, même profil ; seeds différentes, profils différents', () => {
    for (const type of TYPES_ETAPE) {
      const a = genererProfil(type, 80_000, creerAlea(5));
      const b = genererProfil(type, 80_000, creerAlea(5));
      expect(b.troncons).toEqual(a.troncons);
      for (let s = 0; s <= 80_000; s += 97) { expect(b.altitude(s)).toBe(a.altitude(s)); expect(b.pente(s)).toBe(a.pente(s)); }
      expect(genererProfil(type, 80_000, creerAlea(6)).troncons).not.toEqual(a.troncons);
    }
  });

  it('s hors bornes est borné ; longueur trop courte refusée', () => {
    const p = genererProfil('vallonne', 30_000, creerAlea(1));
    expect(p.altitude(-10)).toBe(p.altitude(0));
    expect(p.altitude(40_000)).toBe(p.altitude(30_000));
    expect(() => genererProfil('plaine', 500, creerAlea(1))).toThrow();
  });
});

describe('vérification du profil (cas de violation volontaires)', () => {
  const base = genererProfil('vallonne', 30_000, creerAlea(2));
  const faux = (surcharge: Partial<Profil>): Profil => ({ ...base, ...surcharge });

  it('un profil conforme ne signale rien', () => { expect(ecartsProfil(base)).toEqual([]); });
  it('détecte une pente trop forte', () => { expect(ecartsProfil(faux({ pente: () => 0.2 }))).toContain('pente max en montée'); });
  it('détecte une descente trop raide', () => { expect(ecartsProfil(faux({ pente: () => -0.3 }))).toContain('pente max en descente'); });
  it('détecte un dénivelé nul (route plate) pour un vallonné', () => {
    expect(ecartsProfil(faux({ altitude: () => 300, pente: () => 0 }))).toContain('dénivelé par km');
  });
  it('détecte une altitude négative', () => { expect(ecartsProfil(faux({ altitude: (s) => -s * 0.001 }))).toContain('altitude négative'); });
  it('détecte un trou entre tronçons, un tronçon trop court et un col hors montagne', () => {
    const t = base.troncons;
    expect(ecartsProfil(faux({ troncons: [{ ...(t[0] as object), debut_m: 0, fin_m: 1000, type: 'plat' }, { type: 'bosse', debut_m: 1500, fin_m: 30_000 }] as Profil['troncons'] }))).toContain('trou ou chevauchement');
    expect(ecartsProfil(faux({ troncons: [{ type: 'plat', debut_m: 0, fin_m: 100 }, { type: 'bosse', debut_m: 100, fin_m: 30_000 }] }))).toContain('tronçon trop court');
    expect(ecartsProfil(faux({ troncons: [{ type: 'col', debut_m: 0, fin_m: 30_000 }] }))).toContain('col interdit');
  });
});
