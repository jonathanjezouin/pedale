import { describe, expect, it } from 'vitest';
import { creerEtape } from '@pedale/sim';
import {
  ACCELERATION_MAX_ROUTE_EN_HAUT, ANCRAGE_CAP, capLisse, creerCamera, matriceBloc, orientationEffective, rayonVue_m, versEcran,
} from '../src/defilement/camera.ts';
import { ecrireReglagesDefilement, lireReglagesDefilement } from '../src/defilement/vue.ts';
import {
  CacheRecent, DECOR_PORTEE_M, IndexSpatial, PAS_M, TAILLE_BLOC_M, construireBloc, nombreBlocs, type GeometrieBloc,
} from '../src/defilement/blocs.ts';

describe('caméra du défilement (UF 2.6)', () => {
  it('route vers le haut : un point devant le coureur apparaît juste au-dessus de lui, quel que soit le cap', () => {
    for (const cap of [0, 0.7, Math.PI / 2, 2.5, -1.3, Math.PI, -Math.PI + 0.01]) {
      const c = creerCamera(1000, -500, cap, 'cap', 6, 800, 600);
      const devant = versEcran(c, 1000 + 20 * Math.cos(cap), -500 + 20 * Math.sin(cap));
      expect(devant.x_px).toBeCloseTo(400, 9);
      expect(devant.y_px).toBeCloseTo(600 * ANCRAGE_CAP - 20 * 6, 9); // 20 m plus haut, à 6 px/m
      const aGauche = versEcran(c, 1000 - 5 * Math.sin(cap), -500 + 5 * Math.cos(cap));
      expect(aGauche.x_px).toBeCloseTo(400 - 5 * 6, 9); // la gauche de la route est à gauche de l'écran
    }
  });

  it('nord en haut : le monde ne tourne pas, le point suivi est au centre', () => {
    const c = creerCamera(10, 20, 1.2, 'nord', 5, 800, 600);
    expect(versEcran(c, 10, 20)).toEqual({ x_px: 400, y_px: 300 });
    expect(versEcran(c, 20, 20).x_px).toBeCloseTo(450, 9); // à l'est : à droite
    expect(versEcran(c, 10, 30).y_px).toBeCloseTo(250, 9); // au nord : en haut
  });

  it('la matrice d\'un bloc donne exactement la même position écran que le calcul direct, même à 250 km du départ', () => {
    for (const orientation of ['cap', 'nord'] as const) {
      for (const [x, y] of [[0, 0], [31_700, -2900], [250_000, 12_345.678], [-80_000, 190_000]] as [number, number][]) {
        const c = creerCamera(x + 3.3, y - 1.7, 0.9, orientation, 6, 1000, 700);
        const ox = x + 40, oy = y + 25;
        const m = matriceBloc(c, ox, oy);
        for (const [lx, ly] of [[0, 0], [12.5, -3], [-80, 60], [150, 150]] as [number, number][]) {
          const direct = versEcran(c, ox + lx, oy + ly);
          expect(m.a * lx + m.c * ly + m.e).toBeCloseTo(direct.x_px, 7);
          expect(m.b * lx + m.d * ly + m.f).toBeCloseTo(direct.y_px, 7);
        }
      }
    }
  });

  it('vitesse apparente constante : sur une route droite, un repère du sol défile de zoom × vitesse, sans variation', () => {
    // La caméra est une fonction de la position seule ; la position, une fonction du temps : le défilement ne peut pas varier.
    const zoom = 6, v = 17.3, repere = { x: 5000, y: 0 };
    const intervalles = [16.7, 15.9, 18.4, 16.6, 33.2, 17.0, 16.5]; // des durées d'image irrégulières, en ms
    let t = 0, s = 3000, precedent = versEcran(creerCamera(s, 0, 0, 'cap', zoom, 800, 600), repere.x, repere.y);
    for (const dt of intervalles) {
      t += dt; s += v * (dt / 1000);
      const p = versEcran(creerCamera(s, 0, 0, 'cap', zoom, 800, 600), repere.x, repere.y);
      const vitesseApparente = Math.hypot(p.x_px - precedent.x_px, p.y_px - precedent.y_px) / (dt / 1000);
      expect(Math.abs(vitesseApparente / (zoom * v) - 1)).toBeLessThan(1e-9);
      precedent = p;
    }
    expect(t).toBeGreaterThan(100);
  });

  it('cap lissé : moyenne circulaire (pas de saut à ±π), identique au cap sur une route droite', () => {
    expect(capLisse(() => 0.4, 100)).toBeCloseTo(0.4, 12);
    const autour = (s: number) => (s < 110 ? Math.PI - 0.01 : -Math.PI + 0.01);
    const m = capLisse(autour, 100);
    expect(Math.abs(Math.abs(m) - Math.PI)).toBeLessThan(0.02); // proche de π, pas de 0
    // anticipe un virage : à 5 m d'un virage à gauche, le cap lissé est déjà plus à gauche que le cap actuel
    const virage = (s: number) => (s < 105 ? 0 : (s - 105) * 0.05);
    expect(capLisse(virage, 100)).toBeGreaterThan(0);
  });

  it('rayon de vue : contient tout l\'écran', () => {
    const c = creerCamera(0, 0, 0, 'cap', 5, 800, 600);
    const r = rayonVue_m(c, 800, 600);
    for (const [px, py] of [[0, 0], [800, 0], [0, 600], [800, 600]] as [number, number][]) {
      const dx = (px - c.ancrageX_px) / 5, dy = (py - c.ancrageY_px) / 5;
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(r + 1e-9);
    }
  });
});

describe('blocs de route et décor (UF 2.6)', () => {
  const etape = creerEtape(3, 'montagne', 60_000);
  const monde = (b: GeometrieBloc, i: number, tab: Float32Array) => ({ x: b.origineX_m + (tab[2 * i] as number), y: b.origineY_m + (tab[2 * i + 1] as number) });

  it('les bords des blocs sont ceux de la route : chaussée et accotements aux bonnes distances, à 0,1 mm près', () => {
    for (const indice of [0, 17, 99, 150, 299]) {
      const b = construireBloc(etape, indice);
      for (const i of [0, 1, 37, 50, b.n - 1]) {
        const s = Math.min(indice * TAILLE_BLOC_M + i * PAS_M, etape.longueur_m);
        const bd = etape.bords(s);
        for (const [tab, ref] of [[b.chausseeG, bd.gaucheChaussee], [b.chausseeD, bd.droiteChaussee], [b.accotementG, bd.gaucheAccotement], [b.accotementD, bd.droiteAccotement]] as const) {
          const p = monde(b, i, tab);
          expect(Math.hypot(p.x - ref.x_m, p.y - ref.y_m)).toBeLessThan(1e-4);
        }
      }
    }
  });

  it('aucune couture : le dernier échantillon d\'un bloc recouvre le deuxième du suivant, au même point', () => {
    for (const indice of [0, 40, 120, 250]) {
      const a = construireBloc(etape, indice), b = construireBloc(etape, indice + 1);
      for (const [ta, tb] of [[a.chausseeG, b.chausseeG], [a.chausseeD, b.chausseeD], [a.accotementG, b.accotementG], [a.accotementD, b.accotementD]] as const) {
        const pa = monde(a, a.n - 1, ta), pb = monde(b, 1, tb);
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeLessThan(1e-4);
      }
    }
  });

  it('coordonnées locales petites (quelle que soit la distance au départ) ; blocs identiques à graine identique', () => {
    for (const indice of [0, 150, 299]) {
      const a = construireBloc(etape, indice), b = construireBloc(etape, indice);
      const max = Math.max(...a.accotementG.map(Math.abs), ...a.accotementD.map(Math.abs));
      expect(max).toBeLessThan(TAILLE_BLOC_M + 30);
      expect(b.decor).toEqual(a.decor);
      expect(Array.from(b.chausseeG)).toEqual(Array.from(a.chausseeG));
    }
    expect(construireBloc(creerEtape(4, 'montagne', 60_000), 20).decor).not.toEqual(construireBloc(etape, 20).decor);
  });

  it('décor : jamais sur la chaussée ni sur les accotements, ni sur une branche voisine de la route (lacets compris)', () => {
    let nb = 0, pire = Infinity;
    for (const indice of [3, 12, 15, 16, 30, 77, 120, 201]) { // plusieurs blocs, dont des blocs en lacets
      const b = construireBloc(etape, indice);
      expect(b.decor.length).toBeGreaterThan(20);
      const s0 = indice * TAILLE_BLOC_M;
      for (const e of b.decor) {
        const x = b.origineX_m + e.x_m, y = b.origineY_m + e.y_m;
        // contrôle indépendant : au mètre, sur ±1 000 m (plus large que la fenêtre de rejet du générateur)
        for (let s = Math.max(0, s0 - 1000); s <= Math.min(etape.longueur_m, s0 + 1200); s += 1) {
          const q = etape.versMonde(s, 0);
          pire = Math.min(pire, Math.hypot(x - q.x_m, y - q.y_m) - etape.demiTotale(s) - e.rayon_m);
        }
        nb++;
      }
    }
    expect(nb).toBeGreaterThan(500);
    expect(pire).toBeGreaterThan(0); // l'élément le plus proche ne touche pas la route (accotements compris)
  });

  it('décor : porté à 55 m de l\'axe au plus', () => {
    const b = construireBloc(etape, 30);
    for (const e of b.decor) {
      let min = Infinity;
      for (let s = 6000 - 100; s <= 6000 + 300; s += 1) {
        const q = etape.versMonde(s, 0);
        min = Math.min(min, Math.hypot(b.origineX_m + e.x_m - q.x_m, b.origineY_m + e.y_m - q.y_m));
      }
      expect(min).toBeLessThanOrEqual(DECOR_PORTEE_M + 12);
    }
  });

  it('index spatial : aucun bloc dont la route passe dans le disque n\'est oublié', () => {
    const index = new IndexSpatial(etape);
    const nb = nombreBlocs(etape.longueur_m);
    let verifies = 0;
    for (const s0 of [1500, 6100, 9900, 23_456, 41_000, 55_555]) {
      const c = etape.versMonde(s0, 0);
      const trouves = new Set(index.blocsProches(c.x_m, c.y_m, 110));
      for (let b = 0; b < nb; b++) {
        for (let s = b * TAILLE_BLOC_M; s <= Math.min((b + 1) * TAILLE_BLOC_M, etape.longueur_m); s += 4) {
          const q = etape.versMonde(s, 0);
          if (Math.hypot(q.x_m - c.x_m, q.y_m - c.y_m) <= 110 + etape.demiTotale(s)) { expect(trouves.has(b)).toBe(true); verifies++; break; }
        }
      }
    }
    expect(verifies).toBeGreaterThan(12);
  });

  it('cache : taille bornée, éviction du moins récent, libération signalée', () => {
    const liberes: number[] = [];
    const c = new CacheRecent<number>(3, (v) => liberes.push(v));
    for (const k of [1, 2, 3]) c.prendre(k, () => k * 10);
    c.prendre(1, () => -1); // 1 redevient récent
    c.prendre(4, () => 40); // évince 2
    expect(c.taille).toBe(3);
    expect(c.cles()).toEqual([3, 1, 4]);
    expect(liberes).toEqual([20]);
    expect(c.prendre(1, () => -1)).toBe(10); // toujours là, pas reconstruit
  });

  it('défilement de toute l\'étape : le cache ne dépasse jamais sa capacité et chaque bloc n\'est construit qu\'une fois', () => {
    const index = new IndexSpatial(etape);
    let construits = 0;
    const cache = new CacheRecent<GeometrieBloc>(64);
    const rayon = 120;
    let maxTaille = 0;
    for (let s = 0; s <= etape.longueur_m; s += 25) {
      const p = etape.versMonde(s, 0);
      for (const b of index.blocsProches(p.x_m, p.y_m, rayon)) cache.prendre(b, () => { construits++; return construireBloc(etape, b); });
      maxTaille = Math.max(maxTaille, cache.taille);
    }
    expect(maxTaille).toBeLessThanOrEqual(64);
    expect(construits).toBeLessThan(nombreBlocs(etape.longueur_m) * 1.15); // pas de reconstructions en boucle
  }, 60_000);
});

describe('choix de la caméra et adresse (UF 2.6)', () => {
  it('mode auto : route vers le haut jusqu\'à ×4, nord en haut au-delà ; un choix explicite est respecté', () => {
    expect(ACCELERATION_MAX_ROUTE_EN_HAUT).toBe(4);
    for (const k of [1, 4]) expect(orientationEffective('auto', k)).toBe('cap');
    for (const k of [16, 64]) expect(orientationEffective('auto', k)).toBe('nord');
    expect(orientationEffective('cap', 64)).toBe('cap');
    expect(orientationEffective('nord', 1)).toBe('nord');
  });

  it('adresse : lecture et écriture des réglages, valeurs hors bornes ou inconnues ignorées', () => {
    const r = lireReglagesDefilement('#defilement?type=plaine&km=120&graine=77&v=20&k=16&o=nord&z=4');
    expect(r).toEqual({ type: 'plaine', km: 120, graine: 77, vitesse_m_s: 20, acceleration: 16, orientation: 'nord', zoom: 4 });
    expect(lireReglagesDefilement(ecrireReglagesDefilement(r))).toEqual(r);
    const d = lireReglagesDefilement('#defilement?type=marais&km=5000&graine=-3&v=99&k=7&o=haut&z=3');
    expect(d).toEqual(lireReglagesDefilement('#defilement')); // tout est retombé sur les valeurs par défaut
    expect(d.orientation).toBe('auto');
    expect(d.km).toBe(200);
  });
});
