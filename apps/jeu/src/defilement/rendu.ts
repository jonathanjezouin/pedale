// Dessin du défilement (UF 2.6) : Canvas 2D, un chemin par bloc de route construit une fois en coordonnées locales,
// et à chaque image seulement la matrice de la caméra (calculée en double précision). Pas de texture : rien ne peut « gratter ».
import type { Etape } from '@pedale/sim';
import {
  CacheRecent, IndexSpatial, PAS_M, TAILLE_BLOC_M, construireBloc, nombreBlocs, type GeometrieBloc,
} from './blocs.ts';
import { capLisse, creerCamera, matriceBloc, rayonVue_m, versEcran, type Camera, type Orientation } from './camera.ts';

export interface OptionsRendu {
  orientation: Orientation;
  /** Pixels par mètre ; 6 par défaut (la chaussée de 6 m fait 36 px). */
  zoom_px_m: number;
  /** Couleurs de contrôle : sol magenta, pas de décor ni de marquage, pour détecter trous et coutures. */
  controle: boolean;
}

export interface InfoImage {
  readonly camera: Camera;
  readonly blocsVisibles: number;
  readonly blocsCharges: number;
  readonly construitsCetteImage: number;
  readonly cache: number;
  readonly dessin_ms: number;
}

interface Chemins {
  readonly geo: GeometrieBloc;
  readonly accotement: Path2D;
  readonly chaussee: Path2D;
  readonly bords: Path2D;
  readonly tirets: Path2D;
  readonly herbes: Path2D;
  readonly buissons: Path2D;
  readonly arbres: Path2D;
  readonly poteaux: Path2D;
  readonly kmPoteaux: Path2D;
}

interface Palette {
  sol: string; herbe: string; buisson: string; arbre: string; accotement: string; chaussee: string; marquage: string; poteau: string; km: string; coureur: string; contour: string;
}

export const COULEURS_CONTROLE: Palette = {
  sol: '#ff00ff', herbe: '#ff00ff', buisson: '#ff00ff', arbre: '#ff00ff', accotement: '#00ff00', chaussee: '#202020', marquage: '#202020', poteau: '#ff00ff', km: '#ff00ff', coureur: '#ffff00', contour: '#ffff00',
};

function lirePalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string): string => s.getPropertyValue(n).trim();
  return {
    sol: v('--sol'), herbe: v('--herbe'), buisson: v('--buisson'), arbre: v('--arbre'), accotement: v('--bas-cote'), chaussee: v('--chaussee-sol'),
    marquage: v('--marquage'), poteau: v('--poteau'), km: v('--poteau-km'), coureur: v('--accent'), contour: v('--carte'),
  };
}

function construireChemins(geo: GeometrieBloc): Chemins {
  const { n } = geo;
  const polygone = (g: Float32Array, d: Float32Array): Path2D => {
    const p = new Path2D();
    p.moveTo(g[0] as number, g[1] as number);
    for (let i = 1; i < n; i++) p.lineTo(g[2 * i] as number, g[2 * i + 1] as number);
    for (let i = n - 1; i >= 0; i--) p.lineTo(d[2 * i] as number, d[2 * i + 1] as number);
    p.closePath();
    return p;
  };
  // lignes de rive, légèrement à l'intérieur de la chaussée
  const bords = new Path2D();
  for (const cote of [geo.chausseeG, geo.chausseeD]) {
    for (let i = 0; i < n; i++) {
      const gx = cote[2 * i] as number, gy = cote[2 * i + 1] as number, ax = geo.axe[2 * i] as number, ay = geo.axe[2 * i + 1] as number;
      const dx = ax - gx, dy = ay - gy, l = Math.hypot(dx, dy) || 1;
      const x = gx + (dx / l) * 0.3, y = gy + (dy / l) * 0.3;
      if (i === 0) bords.moveTo(x, y); else bords.lineTo(x, y);
    }
  }
  const tirets = new Path2D();
  let debut = true;
  for (let i = 0; i < geo.tirets.length; i += 2) {
    const x = geo.tirets[i] as number, y = geo.tirets[i + 1] as number;
    if (Number.isNaN(x)) { tirets.closePath(); debut = true; continue; }
    if (debut) { tirets.moveTo(x, y); debut = false; } else tirets.lineTo(x, y);
  }
  const herbes = new Path2D(), buissons = new Path2D(), arbres = new Path2D();
  for (const e of geo.decor) {
    const p = e.genre === 0 ? herbes : e.genre === 1 ? buissons : arbres;
    p.moveTo(e.x_m + e.rayon_m, e.y_m);
    p.arc(e.x_m, e.y_m, e.rayon_m, 0, 2 * Math.PI);
  }
  const poteaux = new Path2D(), kmPoteaux = new Path2D();
  for (const q of geo.poteaux) {
    const r = q.km ? 0.7 : 0.35;
    (q.km ? kmPoteaux : poteaux).rect(q.x_m - r, q.y_m - r, 2 * r, 2 * r);
  }
  return { geo, accotement: polygone(geo.accotementG, geo.accotementD), chaussee: polygone(geo.chausseeG, geo.chausseeD), bords, tirets, herbes, buissons, arbres, poteaux, kmPoteaux };
}

export class Rendu {
  readonly index: IndexSpatial;
  readonly cache = new CacheRecent<Chemins>(96);
  private palette: Palette;
  private readonly ctx: CanvasRenderingContext2D;
  private proches: number[] = [];
  private derniereS = Number.NaN;
  /** Nombre de blocs construits au total (information de mesure). */
  construitsTotal = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly etape: Etape, public options: OptionsRendu) {
    this.index = new IndexSpatial(etape);
    this.palette = options.controle ? COULEURS_CONTROLE : lirePalette();
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  }

  rafraichirPalette(): void { this.palette = this.options.controle ? COULEURS_CONTROLE : lirePalette(); }

  /** Caméra pour la position `s` et la taille d'affichage courante. */
  camera(s_m: number, largeur_px: number, hauteur_px: number): Camera {
    const p = this.etape.lire(s_m);
    const cap = capLisse((s) => this.etape.lire(s).cap_rad, s_m, undefined, this.etape.longueur_m);
    return creerCamera(p.x_m, p.y_m, cap, this.options.orientation, this.options.zoom_px_m, largeur_px, hauteur_px);
  }

  private chemins(b: number, compteur: { n: number }): Chemins {
    return this.cache.prendre(b, () => { compteur.n++; this.construitsTotal++; return construireChemins(construireBloc(this.etape, b)); });
  }

  /** Dessine l'image pour la position `s`. Les blocs à l'écran sont toujours dessinés (construits au besoin) ; ceux d'en avant, dans la limite du budget. */
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
    // un bloc visible doit être là : il est construit tout de suite (c'est le coût du premier affichage ou d'un saut)
    const liste = visibles.map((b) => this.chemins(b, compteur));
    // avance : les blocs de la route devant, construits à raison de `budgetAvance` par image pour lisser le coût
    let restant = budgetAvance;
    const b0 = Math.floor(s_m / TAILLE_BLOC_M), nb = nombreBlocs(this.etape.longueur_m);
    for (let b = b0; b < Math.min(nb, b0 + 4) && restant > 0; b++) {
      if (!this.cache.a(b)) { this.chemins(b, compteur); restant--; } else this.cache.prendre(b, () => { throw new Error('inattendu'); });
    }

    const P = this.palette;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = P.sol;
    ctx.fillRect(0, 0, w, h);
    const poser = (c: Chemins) => {
      const m = matriceBloc(cam, c.geo.origineX_m, c.geo.origineY_m);
      ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);
    };
    // calques, du bas vers le haut : décor, accotements, chaussée, marquages, poteaux
    if (!this.options.controle) {
      for (const c of liste) { poser(c); ctx.fillStyle = P.herbe; ctx.fill(c.herbes); ctx.fillStyle = P.buisson; ctx.fill(c.buissons); ctx.fillStyle = P.arbre; ctx.fill(c.arbres); }
    }
    for (const c of liste) { poser(c); ctx.fillStyle = P.accotement; ctx.fill(c.accotement); }
    for (const c of liste) { poser(c); ctx.fillStyle = P.chaussee; ctx.fill(c.chaussee); }
    if (!this.options.controle) {
      ctx.lineJoin = 'round'; ctx.lineWidth = 0.18; ctx.strokeStyle = P.marquage; ctx.fillStyle = P.marquage;
      for (const c of liste) { poser(c); ctx.stroke(c.bords); ctx.fill(c.tirets); }
      for (const c of liste) { poser(c); ctx.fillStyle = P.poteau; ctx.fill(c.poteaux); ctx.fillStyle = P.km; ctx.fill(c.kmPoteaux); }
    }
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
    ctx.fillStyle = P.coureur; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = P.contour; ctx.stroke();
    this.derniereS = s_m;
    return { camera: cam, blocsVisibles: visibles.length, blocsCharges: liste.length, construitsCetteImage: compteur.n, cache: this.cache.taille, dessin_ms: performance.now() - t0 };
  }

  /** Position écran d'un point du monde pour la dernière image dessinée à `s` (pour les mesures). */
  versEcran(s_m: number, x_m: number, y_m: number): { x_px: number; y_px: number } {
    const w = Math.max(10, this.canvas.clientWidth), h = Math.max(10, this.canvas.clientHeight);
    return versEcran(this.camera(s_m, w, h), x_m, y_m);
  }
}

export { PAS_M };
