import { describe, expect, it } from 'vitest';
import { creerEtape, type Etape } from '@pedale/sim';
import { TAILLE_CELLULE_M, cellulesProches, construireCellule, type Cellule } from '../src/defilement/ambiance.ts';
import { BIOMES, CLES_BIOME, biomeAuto, biomeEffectif, type CleBiome } from '../src/defilement/biomes.ts';
import { IndexSpatial, TAILLE_BLOC_M, construireBloc, nombreBlocs } from '../src/defilement/blocs.ts';
import { BARRIERE_M, genererBord } from '../src/defilement/bord.ts';
import { SUR_LA_ROUTE, rayonItem, type Item } from '../src/defilement/items.ts';

const TYPES = ['plaine', 'vallonne', 'montagne'] as const;

/** Contrôle indépendant du générateur : plus petit écart (m) entre un point et le bord extérieur de l'accotement, au mètre près, sur les blocs voisins. */
function ecartAuxBords(etape: Etape, index: IndexSpatial, x: number, y: number): number {
  let pire = Infinity;
  for (const b of index.blocsProches(x, y, 70)) {
    for (let s = b * TAILLE_BLOC_M; s <= Math.min((b + 1) * TAILLE_BLOC_M, etape.longueur_m); s += 1) {
      const q = etape.versMonde(s, 0);
      const dx = x - q.x_m, dy = y - q.y_m;
      if (Math.abs(dx) > 80 || Math.abs(dy) > 80) continue;
      pire = Math.min(pire, Math.hypot(dx, dy) - etape.demiTotale(s));
    }
  }
  return pire;
}

const monde = (c: { origineX_m: number; origineY_m: number }, x: number, y: number) => ({ x: c.origineX_m + x, y: c.origineY_m + y });

describe('décor : aucun élément sur la route (UF 2.7)', () => {
  it('éléments ambiants : ni sur la chaussée ni sur les accotements, pour les 4 biomes et les 3 types d\'étape', () => {
    let items = 0, pire = Infinity;
    for (const type of TYPES) {
      const etape = creerEtape(7, type, 40_000);
      const index = new IndexSpatial(etape);
      for (const cle of CLES_BIOME) {
        for (const s of [800, 5200, 11_000, 19_500, 33_000]) {
          const c0 = etape.versMonde(s, 0);
          const cx0 = Math.floor(c0.x_m / TAILLE_CELLULE_M), cy0 = Math.floor(c0.y_m / TAILLE_CELLULE_M);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const cel = construireCellule(etape, BIOMES[cle], cle, cx0 + dx, cy0 + dy);
            for (const it of cel.items) {
              const p = monde(cel, it.x, it.y);
              pire = Math.min(pire, ecartAuxBords(etape, index, p.x, p.y) - rayonItem(it));
              items++;
            }
          }
        }
      }
    }
    expect(items).toBeGreaterThan(5000);
    expect(pire).toBeGreaterThan(0); // l'élément le plus proche, rayon compris, ne touche pas l'accotement
  }, 120_000);

  it('champs et lacs : leur contour ne touche ni la chaussée ni les accotements', () => {
    let formes = 0, pire = Infinity;
    const etape = creerEtape(9, 'vallonne', 60_000), index = new IndexSpatial(etape);
    for (const cle of ['prairie', 'automne'] as const) {
      for (let s = 500; s < 58_000; s += 1500) {
        const c0 = etape.versMonde(s, 0);
        const cx0 = Math.floor(c0.x_m / TAILLE_CELLULE_M), cy0 = Math.floor(c0.y_m / TAILLE_CELLULE_M);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const cel = construireCellule(etape, BIOMES[cle], cle, cx0 + dx, cy0 + dy);
          for (const f of cel.champs) {
            const c = Math.cos(f.a), si = Math.sin(f.a);
            for (let u = -1; u <= 1; u += 0.25) for (const v of [-1, 1]) for (const [uu, vv] of [[u, v], [v, u]] as [number, number][]) {
              const p = monde(cel, f.x + (uu * f.l / 2) * c - (vv * f.h / 2) * si, f.y + (uu * f.l / 2) * si + (vv * f.h / 2) * c);
              pire = Math.min(pire, ecartAuxBords(etape, index, p.x, p.y)); formes++;
            }
          }
          for (const l of cel.lacs) for (let a = 0; a < 2 * Math.PI; a += Math.PI / 12) {
            const p = monde(cel, l.x + Math.cos(a) * l.r * 1.2, l.y + Math.sin(a) * l.r * 1.2);
            pire = Math.min(pire, ecartAuxBords(etape, index, p.x, p.y)); formes++;
          }
        }
      }
    }
    expect(formes).toBeGreaterThan(300); // il y a bien des champs et des lacs à contrôler
    expect(pire).toBeGreaterThan(0);
  }, 120_000);

  it('bord de route (barrières, public, tentes, allées, poteaux) : hors chaussée et accotements ; seuls la ligne, le damier et les portiques sont sur la route', () => {
    let items = 0, pire = Infinity;
    const surRoute: Item['k'][] = [];
    for (const type of TYPES) {
      const etape = creerEtape(11, type, 30_000), index = new IndexSpatial(etape);
      const bord = genererBord(etape.graine, etape.longueur_m, BIOMES.automne);
      const nb = nombreBlocs(etape.longueur_m);
      for (const b of [0, 1, 2, 9, 25, 60, 99, nb - 2, nb - 1]) {
        const geo = construireBloc(etape, b, bord, BIOMES.automne);
        for (const it of geo.items) {
          if (SUR_LA_ROUTE.has(it.k)) { surRoute.push(it.k); continue; }
          const p = monde(geo, it.x, it.y);
          pire = Math.min(pire, ecartAuxBords(etape, index, p.x, p.y) - rayonItem(it));
          if (it.k === 'barriere') { const q = monde(geo, it.x2, it.y2); pire = Math.min(pire, ecartAuxBords(etape, index, q.x, q.y) - rayonItem(it)); }
          items++;
        }
      }
    }
    expect(items).toBeGreaterThan(2000);
    expect(pire).toBeGreaterThan(-0.15); // un poteau ou une barrière peut frôler le bord de l'accotement (0,7 m de marge de construction)
    expect(new Set(surRoute)).toEqual(new Set(['carre', 'ligne', 'portique'])); // et ils existent
  }, 120_000);

  it('barrières : à BARRIERE_M du bord extérieur de l\'accotement, spectateurs derrière elles', () => {
    const etape = creerEtape(13, 'plaine', 20_000), index = new IndexSpatial(etape);
    const bord = genererBord(etape.graine, etape.longueur_m, BIOMES.prairie);
    const geo = construireBloc(etape, nombreBlocs(etape.longueur_m) - 1, bord, BIOMES.prairie);
    const barrieres = geo.items.filter((i) => i.k === 'barriere'), gens = geo.items.filter((i) => i.k === 'personne');
    expect(barrieres.length).toBeGreaterThan(20);
    expect(gens.length).toBeGreaterThan(300);
    for (const b of barrieres.slice(0, 30)) {
      if (b.k !== 'barriere') continue;
      const p = monde(geo, b.x, b.y);
      expect(ecartAuxBords(etape, index, p.x, p.y)).toBeGreaterThan(BARRIERE_M - 0.25);
      expect(ecartAuxBords(etape, index, p.x, p.y)).toBeLessThan(BARRIERE_M + 0.25);
    }
    for (const g of gens.slice(0, 200)) { const p = monde(geo, g.x, g.y); expect(ecartAuxBords(etape, index, p.x, p.y)).toBeGreaterThan(BARRIERE_M); }
  });
});

describe('décor : biomes, arrivée, déterminisme (UF 2.7)', () => {
  it('quatre biomes complets ; choix automatique selon le type d\'étape', () => {
    expect(CLES_BIOME).toEqual(['prairie', 'desert', 'montagne', 'automne'].sort((a, b) => CLES_BIOME.indexOf(a as CleBiome) - CLES_BIOME.indexOf(b as CleBiome)));
    for (const cle of CLES_BIOME) {
      const b = BIOMES[cle];
      expect(b.arbres.length).toBeGreaterThan(0);
      expect(b.taches.length).toBeGreaterThan(0);
      expect(b.extras.length).toBeGreaterThan(0);
      expect(b.toits.length).toBeGreaterThan(0);
      for (const c of [b.base, b.accotement, b.herbeBord, b.mur, ...b.taches, ...b.toits, ...b.champs]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(biomeAuto('plaine')).toBe('prairie');
    expect(biomeAuto('vallonne')).toBe('automne');
    expect(biomeAuto('montagne')).toBe('montagne');
    expect(biomeEffectif('desert', 'plaine')).toBe('desert');
    expect(biomeEffectif('auto', 'montagne')).toBe('montagne');
    expect(BIOMES.desert.lac).toBe(false);
    expect(BIOMES.desert.toitPlat).toBe(true);
  });

  it('arrivée : damier de 3 rangées sur toute la largeur, portique à l\'arrivée, flamme rouge à 1 km, ligne de départ ; foule des deux côtés', () => {
    const etape = creerEtape(2, 'vallonne', 30_000), L = etape.longueur_m;
    const bord = genererBord(etape.graine, L, BIOMES.automne);
    const dernier = construireBloc(etape, nombreBlocs(L) - 1, bord, BIOMES.automne);
    const carres = dernier.items.filter((i) => i.k === 'carre');
    expect(carres.length).toBeGreaterThanOrEqual(3 * Math.floor(2 * etape.demiChaussee(L) / 0.35) - 3);
    const portiques = dernier.items.filter((i) => i.k === 'portique' && i.fin);
    expect(portiques).toHaveLength(1);
    const p = portiques[0] as Extract<Item, { k: 'portique' }>;
    const fin = etape.versMonde(L, 0);
    expect(Math.hypot(monde(dernier, p.x, p.y).x - fin.x_m, monde(dernier, p.x, p.y).y - fin.y_m)).toBeLessThan(1e-3);
    expect(p.demi).toBeGreaterThan(etape.demiTotale(L)); // les montants sont hors de l'accotement
    // flamme rouge 1 km avant
    const bF = construireBloc(etape, Math.floor((L - 1000) / TAILLE_BLOC_M), bord, BIOMES.automne);
    expect(bF.items.some((i) => i.k === 'portique' && !i.fin)).toBe(true);
    // départ
    expect(construireBloc(etape, 0, bord, BIOMES.automne).items.some((i) => i.k === 'ligne')).toBe(true);
    // foule : de chaque côté de la route
    const zone = bord.zones.find((z) => z.grande);
    expect(zone?.cotes).toEqual([-1, 1]);
    const gauche = dernier.items.filter((i) => i.k === 'personne').filter((g) => { const q = monde(dernier, g.x, g.y); const pr = etape.projeter(q.x, q.y); return pr !== null && pr.d_m > 0; });
    const droite = dernier.items.filter((i) => i.k === 'personne').length - gauche.length;
    expect(gauche.length).toBeGreaterThan(100); expect(droite).toBeGreaterThan(100);
  });

  it('allées d\'arbres : absentes du désert, espacées (pas une haie) ailleurs', () => {
    const etape = creerEtape(4, 'plaine', 60_000);
    expect(genererBord(etape.graine, etape.longueur_m, BIOMES.desert).allees).toHaveLength(0);
    const b = genererBord(etape.graine, etape.longueur_m, BIOMES.prairie);
    expect(b.allees.length).toBeGreaterThan(3);
    const al = b.allees[0];
    expect(al).toBeDefined();
    if (!al) return;
    const geoIdx = Math.floor((al.a_m + 20) / TAILLE_BLOC_M);
    const geo = construireBloc(etape, geoIdx, b, BIOMES.prairie);
    const arbres = geo.items.filter((i) => i.k === 'arbre').map((i) => i as Extract<Item, { k: 'arbre' }>);
    expect(arbres.length).toBeGreaterThan(5);
    const d = arbres.slice(1).map((a, i) => Math.hypot(a.x - (arbres[i] as typeof a).x, a.y - (arbres[i] as typeof a).y));
    expect(Math.min(...d.filter((x) => x < 20))).toBeGreaterThan(3.5);
  });

  it('même graine, même décor ; graine différente, décor différent ; cellules voisines indépendantes', () => {
    const e = creerEtape(21, 'montagne', 30_000), e2 = creerEtape(22, 'montagne', 30_000);
    const c0 = e.versMonde(5000, 0), cx = Math.floor(c0.x_m / TAILLE_CELLULE_M), cy = Math.floor(c0.y_m / TAILLE_CELLULE_M);
    const a = construireCellule(e, BIOMES.montagne, 'montagne', cx, cy), b = construireCellule(e, BIOMES.montagne, 'montagne', cx, cy);
    expect(b).toEqual(a);
    expect(construireCellule(e, BIOMES.montagne, 'montagne', cx + 1, cy).items).not.toEqual(a.items);
    expect(construireCellule(e2, BIOMES.montagne, 'montagne', cx, cy).items).not.toEqual(a.items);
    expect(genererBord(21, 30_000, BIOMES.montagne)).toEqual(genererBord(21, 30_000, BIOMES.montagne));
  });

  it('cellules proches : aucune cellule dont un élément peut tomber dans le disque n\'est oubliée', () => {
    const l: [number, number][] = [];
    for (const [x, y, r] of [[0, 0, 100], [12_345.6, -3210.2, 160], [-5000, 7000, 90]] as [number, number, number][]) {
      const trouvees = new Set(cellulesProches(x, y, r, l).map(([cx, cy]) => `${cx},${cy}`));
      for (let cx = Math.floor((x - 600) / TAILLE_CELLULE_M); cx <= Math.floor((x + 600) / TAILLE_CELLULE_M); cx++) {
        for (let cy = Math.floor((y - 600) / TAILLE_CELLULE_M); cy <= Math.floor((y + 600) / TAILLE_CELLULE_M); cy++) {
          // un élément d'une cellule est à moins de 110 m des bords de sa cellule
          const dx = Math.max(cx * TAILLE_CELLULE_M - 110 - x, 0, x - ((cx + 1) * TAILLE_CELLULE_M + 110)), dy = Math.max(cy * TAILLE_CELLULE_M - 110 - y, 0, y - ((cy + 1) * TAILLE_CELLULE_M + 110));
          if (dx * dx + dy * dy < (r - 1) * (r - 1)) expect(trouvees.has(`${cx},${cy}`)).toBe(true);
        }
      }
    }
  });
});

describe('décor : pas de motif répété (UF 2.7)', () => {
  /** Signature d'un ensemble d'éléments : types et positions locales arrondies à 2 m. */
  const signature = (items: readonly Item[]): Set<string> => new Set(items.filter((i) => i.k !== 'poteau').map((i) => `${i.k}:${Math.round(i.x / 2)}:${Math.round(i.y / 2)}`));
  const jaccard = (a: Set<string>, b: Set<string>): number => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, a.size + b.size - n); };

  it('sur 5 minutes de défilement (3,6 km à 12 m/s), les cellules de décor ne se ressemblent pas : aucune ne reprend la disposition d\'une autre', () => {
    for (const cle of CLES_BIOME) {
      const etape = creerEtape(33, 'plaine', 40_000);
      const cels = new Map<string, Cellule>();
      for (let s = 2000; s <= 2000 + 3600; s += 40) {
        const p = etape.versMonde(s, 0);
        for (const [cx, cy] of cellulesProches(p.x_m, p.y_m, 100)) if (!cels.has(`${cx},${cy}`)) cels.set(`${cx},${cy}`, construireCellule(etape, BIOMES[cle], cle, cx, cy));
      }
      const liste = [...cels.values()].filter((c) => c.items.length >= 6);
      expect(liste.length).toBeGreaterThan(40);
      let pire = 0;
      const sigs = liste.map((c) => signature(c.items));
      for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) pire = Math.max(pire, jaccard(sigs[i] as Set<string>, sigs[j] as Set<string>));
      expect(pire).toBeLessThan(0.15); // du hasard : quelques éléments tombent dans la même case de 2 m, jamais une disposition recopiée
      // et les compositions diffèrent (nombre d'éléments, de taches, de champs) : pas une cellule type répétée
      const n = liste.map((c) => c.items.length), m = n.reduce((a, b) => a + b, 0) / n.length;
      const ecartType = Math.sqrt(n.reduce((a, b) => a + (b - m) ** 2, 0) / n.length);
      expect(ecartType / m).toBeGreaterThan(0.15);
      expect(new Set(n).size).toBeGreaterThan(12);
    }
  }, 60_000);

  it('les zones de public d\'une même étape sont toutes différentes (taille, côté, densité) ; leurs spectateurs aussi', () => {
    const etape = creerEtape(5, 'plaine', 120_000);
    const bord = genererBord(5, etape.longueur_m, BIOMES.prairie);
    const zones = bord.zones.filter((z) => !z.grande && z.id > 1);
    expect(zones.length).toBeGreaterThan(30);
    expect(new Set(zones.map((z) => Math.round((z.b_m - z.a_m) * 10))).size).toBeGreaterThan(zones.length * 0.9);
    const sig = zones.slice(0, 12).map((z) => {
      const b = Math.floor(z.a_m / TAILLE_BLOC_M), geo = construireBloc(etape, b, bord, BIOMES.prairie);
      return signature(geo.items.filter((i) => i.k === 'personne'));
    });
    let pire = 0;
    for (let i = 0; i < sig.length; i++) for (let j = i + 1; j < sig.length; j++) pire = Math.max(pire, jaccard(sig[i] as Set<string>, sig[j] as Set<string>));
    expect(pire).toBeLessThan(0.1);
  });
});

describe('décor : recherche locale de la route (UF 2.7)', () => {
  it('la proximité limitée aux blocs voisins donne exactement les mêmes cellules que la recherche complète, en moins de temps', async () => {
    const { proximiteLocale } = await import('../src/defilement/ambiance.ts');
    const etape = creerEtape(8, 'montagne', 60_000), index = new IndexSpatial(etape);
    let identiques = 0, avecRoute = 0, tComplet = 0, tLocal = 0;
    for (const cle of ['prairie', 'montagne'] as const) {
      for (let s = 600; s < 58_000; s += 2300) {
        const c0 = etape.versMonde(s, 0);
        const cx0 = Math.floor(c0.x_m / TAILLE_CELLULE_M), cy0 = Math.floor(c0.y_m / TAILLE_CELLULE_M);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, -1]] as const) {
          const cx = cx0 + dx, cy = cy0 + dy;
          const blocs = index.blocsProches((cx + 0.5) * TAILLE_CELLULE_M, (cy + 0.5) * TAILLE_CELLULE_M, TAILLE_CELLULE_M * 0.71 + 75 + 30);
          let t = performance.now();
          const a = construireCellule(etape, BIOMES[cle], cle, cx, cy);
          tComplet += performance.now() - t; t = performance.now();
          const b = construireCellule(etape, BIOMES[cle], cle, cx, cy, proximiteLocale(etape, blocs.map((k) => Math.min(k * TAILLE_BLOC_M + TAILLE_BLOC_M / 2, etape.longueur_m))));
          tLocal += performance.now() - t;
          expect(b).toEqual(a);
          identiques++; if (blocs.length > 0) avecRoute++;
        }
      }
    }
    expect(identiques).toBeGreaterThan(40);
    expect(avecRoute).toBeGreaterThan(10); // des cellules traversées par la route, pas seulement des cellules vides
    expect(tLocal).toBeLessThan(tComplet);
  }, 60_000);
});
