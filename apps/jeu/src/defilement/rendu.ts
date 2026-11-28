// Dessin du défilement (UF 2.6, 2.7) : Canvas 2D. La route est découpée en blocs, le décor ambiant en cellules du monde ; chacun est peint une
// fois en chemins `Path2D` (coordonnées locales), et à chaque image seule la matrice de la caméra est calculée (en double précision).
// Pas de texture : rien ne peut « gratter ».
import type { Etape } from '@pedale/sim';
import { TAILLE_CELLULE_M, cellulesProches, construireCellule, proximiteLocale, type Cellule } from './ambiance.ts';
import { BIOMES, type Biome, type CleBiome } from './biomes.ts';
import { genererBord, type BordRoute } from './bord.ts';
import {
  CacheRecent, IndexSpatial, PAS_M, TAILLE_BLOC_M, construireBloc, nombreBlocs, type GeometrieBloc,
} from './blocs.ts';
import { capLisse, creerCamera, matriceBloc, rayonVue_m, versEcran, type Camera, type Orientation } from './camera.ts';
import { COUCHE, NB_COUCHES, dessinerCouche, peindreBloc, peindreCellule, type Conteneur, type Pinceau } from './peinture.ts';

export interface OptionsRendu {
  orientation: Orientation;
  /** Pixels par mètre ; 6 par défaut (la chaussée de 6 m fait 36 px). */
  zoom_px_m: number;
  /** Couleurs de contrôle : sol magenta, accotement vert, chaussée grise, sans décor, pour détecter trous et coutures. */
  controle: boolean;
  biome: CleBiome;
}

export interface InfoImage {
  readonly camera: Camera;
  readonly blocsVisibles: number;
  readonly blocsCharges: number;
  readonly cellulesVisibles: number;
  readonly construitsCetteImage: number;
  /** Blocs de route et cellules de décor en mémoire. */
  readonly cache: number;
  readonly cacheCellules: number;
  readonly dessin_ms: number;
}

interface ConteneurBloc extends Conteneur { readonly geo: GeometrieBloc }
interface ConteneurCellule extends Conteneur { readonly cellule: Cellule }

const COULEUR_CONTROLE = '#ff00ff';
const clefCellule = (cx: number, cy: number): number => (cx + 50_000) * 100_000 + (cy + 50_000);

export class Rendu {
  readonly index: IndexSpatial;
  /** Blocs de route et cellules de décor en mémoire : les moins récemment utilisés sont libérés. */
  readonly cache = new CacheRecent<ConteneurBloc>(96);
  readonly cacheCellules = new CacheRecent<ConteneurCellule>(96);
  private bord: BordRoute;
  private biome: Biome;
  private readonly ctx: CanvasRenderingContext2D;
  private proches: number[] = [];
  private cellules: [number, number][] = [];
  private cellulesAvance: [number, number][] = [];
  /** Nombre de blocs et de cellules construits au total (information de mesure). */
  construitsTotal = 0;
  cellulesConstruites = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly etape: Etape, public options: OptionsRendu) {
    this.index = new IndexSpatial(etape);
    this.biome = BIOMES[options.biome];
    this.bord = genererBord(etape.graine, etape.longueur_m, this.biome);
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  }

  /** À appeler quand le biome ou le mode contrôle change : repart de caches vides. */
  rafraichirPalette(): void {
    this.biome = BIOMES[this.options.biome];
    this.bord = genererBord(this.etape.graine, this.etape.longueur_m, this.biome);
    for (const k of this.cache.cles()) this.cache.retirer(k);
    for (const k of this.cacheCellules.cles()) this.cacheCellules.retirer(k);
  }

  /** Caméra pour la position `s` et la taille d'affichage courante. */
  camera(s_m: number, largeur_px: number, hauteur_px: number): Camera {
    const p = this.etape.lire(s_m);
    const cap = capLisse((s) => this.etape.lire(s).cap_rad, s_m, undefined, this.etape.longueur_m);
    return creerCamera(p.x_m, p.y_m, cap, this.options.orientation, this.options.zoom_px_m, largeur_px, hauteur_px);
  }

  private bloc(b: number, compteur: { n: number }): ConteneurBloc {
    return this.cache.prendre(b, () => {
      compteur.n++; this.construitsTotal++;
      const geo = construireBloc(this.etape, b, this.bord, this.biome);
      return { geo, pinceau: peindreBloc(geo, this.biome, this.options.controle), origineX_m: geo.origineX_m, origineY_m: geo.origineY_m };
    });
  }

  /**
   * Proximité de la route pour les éléments d'une cellule : on ne cherche que parmi les blocs de route voisins de la cellule (aucun, pour
   * la plupart des cellules : leurs éléments sont alors libres sans aucun calcul). Le coût ne dépend plus de la longueur de l'étape.
   */
  private proximite(cx: number, cy: number) {
    const centreX = (cx + 0.5) * TAILLE_CELLULE_M, centreY = (cy + 0.5) * TAILLE_CELLULE_M;
    // étendue d'une cellule et de ses éléments : demi-diagonale + portée du décor + marge de recherche de la route
    const blocs = this.index.blocsProches(centreX, centreY, TAILLE_CELLULE_M * 0.71 + 75 + 30, []);
    return proximiteLocale(this.etape, blocs.map((b) => Math.min(b * TAILLE_BLOC_M + TAILLE_BLOC_M / 2, this.etape.longueur_m)));
  }

  private cellule(cx: number, cy: number, compteur: { n: number }): ConteneurCellule {
    return this.cacheCellules.prendre(clefCellule(cx, cy), () => {
      compteur.n++; this.cellulesConstruites++;
      const cellule = construireCellule(this.etape, this.biome, this.options.biome, cx, cy, this.proximite(cx, cy));
      return { cellule, pinceau: peindreCellule(cellule, this.biome), origineX_m: cellule.origineX_m, origineY_m: cellule.origineY_m };
    });
  }

  /** Dessine l'image pour la position `s`. Les blocs et cellules à l'écran sont toujours dessinés (construits au besoin) ; ceux d'en avant, dans la limite du budget. */
  dessiner(s_m: number, budgetAvance = 2): InfoImage {
    const t0 = performance.now();
    const canvas = this.canvas, ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, canvas.clientWidth), h = Math.max(10, canvas.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const cam = this.camera(s_m, w, h);
    const rayon = rayonVue_m(cam, w, h) + 4;
    const compteur = { n: 0 };
    const visibles = this.index.blocsProches(cam.cx_m, cam.cy_m, rayon, this.proches);
    this.proches = visibles;
    const blocs = visibles.map((b) => this.bloc(b, compteur));
    const cellules: ConteneurCellule[] = [];
    if (!this.options.controle) {
      this.cellules = cellulesProches(cam.cx_m, cam.cy_m, rayon, this.cellules);
      for (const [cx, cy] of this.cellules) cellules.push(this.cellule(cx, cy, compteur));
    }
    // avance : les cellules de décor autour des positions à venir (150, 300, 450 m devant), puis les blocs de la route devant,
    // à raison de `budgetAvance` de chaque par image, pour lisser le coût : ce qui est visible est déjà construit quand il apparaît
    if (!this.options.controle) {
      let reste = budgetAvance;
      for (const d of [150, 300, 450]) {
        if (reste <= 0) break;
        const q = this.etape.versMonde(Math.min(s_m + d, this.etape.longueur_m), 0);
        for (const [cx, cy] of cellulesProches(q.x_m, q.y_m, rayon, this.cellulesAvance)) {
          if (reste <= 0) break;
          if (!this.cacheCellules.a(clefCellule(cx, cy))) { this.cellule(cx, cy, compteur); reste--; }
        }
      }
    }
    let restant = budgetAvance;
    const b0 = Math.floor(s_m / TAILLE_BLOC_M), nb = nombreBlocs(this.etape.longueur_m);
    for (let b = b0; b < Math.min(nb, b0 + 4) && restant > 0; b++) {
      if (!this.cache.a(b)) { this.bloc(b, compteur); restant--; } else this.cache.prendre(b, () => { throw new Error('inattendu'); });
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.options.controle ? COULEUR_CONTROLE : this.biome.base;
    ctx.fillRect(0, 0, w, h);
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    const matrice = (c: Conteneur) => matriceBloc(cam, c.origineX_m, c.origineY_m);
    const tous: Conteneur[] = [...cellules, ...blocs];
    for (let n = 0; n < NB_COUCHES; n++) dessinerCouche(ctx, n, tous, matrice, dpr);

    // coureur : un triangle au point suivi, dans le sens de la marche
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cap = this.etape.lire(s_m).cap_rad;
    const ang = this.options.orientation === 'cap' ? -Math.PI / 2 : -cap;
    const ax = cam.ancrageX_px, ay = cam.ancrageY_px, r = 9;
    ctx.beginPath();
    ctx.moveTo(ax + r * Math.cos(ang), ay + r * Math.sin(ang));
    ctx.lineTo(ax + r * 0.8 * Math.cos(ang + 2.5), ay + r * 0.8 * Math.sin(ang + 2.5));
    ctx.lineTo(ax + r * 0.8 * Math.cos(ang - 2.5), ay + r * 0.8 * Math.sin(ang - 2.5));
    ctx.closePath();
    ctx.fillStyle = this.options.controle ? '#ffff00' : '#2456d6'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = this.options.controle ? '#ffff00' : '#ffffff'; ctx.stroke();
    return {
      camera: cam, blocsVisibles: visibles.length, blocsCharges: blocs.length, cellulesVisibles: cellules.length, construitsCetteImage: compteur.n,
      cache: this.cache.taille, cacheCellules: this.cacheCellules.taille, dessin_ms: performance.now() - t0,
    };
  }

  /** Position écran d'un point du monde pour la caméra à `s` (pour les mesures). */
  versEcran(s_m: number, x_m: number, y_m: number): { x_px: number; y_px: number } {
    const w = Math.max(10, this.canvas.clientWidth), h = Math.max(10, this.canvas.clientHeight);
    return versEcran(this.camera(s_m, w, h), x_m, y_m);
  }
}

export { PAS_M, TAILLE_CELLULE_M };
void COUCHE;
