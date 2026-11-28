// Peinture du décor (UF 2.7) : transforme les données pures (blocs, cellules, éléments) en chemins `Path2D`, regroupés par couche et par couleur.
// Un chemin par (couche, couleur) et par conteneur : à chaque image, quelques dizaines d'appels de remplissage par conteneur, quel que soit
// le nombre d'éléments. Les coordonnées restent locales au conteneur : seule la matrice de la caméra change d'une image à l'autre.
import { creerAlea } from '@pedale/sim';
import type { Biome } from './biomes.ts';
import { HABITS, OMBRE, PEAUX, PORTIQUE_ARRIVEE, PORTIQUE_FLAMME } from './biomes.ts';
import type { Cellule } from './ambiance.ts';
import type { GeometrieBloc } from './blocs.ts';
import type { Champ, Item, Lac, Tache } from './items.ts';
import type { Matrice } from './camera.ts';

/** Couches, du bas vers le haut. */
export const COUCHE = {
  taches: 0, champs: 1,
  // la route se peint en quatre passes sur TOUS les blocs (herbe, accotement, ombre, chaussée) : peindre accotement puis chaussée bloc par bloc
  // laisserait le vert du bloc suivant se mêler, à l'anti-crénelage, au gris de la chaussée du bloc précédent
  herbe: 2, accotement: 3, ombreRoute: 4, chaussee: 5,
  marquages: 6, ombres: 7, corps: 8, portiques: 9,
} as const;
export const NB_COUCHES = 10;
const TAU = Math.PI * 2;

export interface Couche {
  readonly remplissages: Map<string, Path2D>;
  readonly traits: Map<string, { path: Path2D; largeur: number }>;
}

export class Pinceau {
  readonly couches: Couche[] = Array.from({ length: NB_COUCHES }, () => ({ remplissages: new Map(), traits: new Map() }));
  remp(couche: number, couleur: string): Path2D {
    const m = (this.couches[couche] as Couche).remplissages;
    let p = m.get(couleur);
    if (!p) { p = new Path2D(); m.set(couleur, p); }
    return p;
  }
  trait(couche: number, couleur: string, largeur: number): Path2D {
    const m = (this.couches[couche] as Couche).traits, cle = `${couleur}|${largeur}`;
    let e = m.get(cle);
    if (!e) { e = { path: new Path2D(), largeur }; m.set(cle, e); }
    return e.path;
  }
}

/** Un conteneur à dessiner : sa peinture et la matrice qui l'envoie à l'écran. */
export interface Conteneur { readonly pinceau: Pinceau; readonly origineX_m: number; readonly origineY_m: number }

export function dessinerCouche(ctx: CanvasRenderingContext2D, n: number, liste: readonly Conteneur[], matrice: (c: Conteneur) => Matrice, dpr: number): void {
  for (const c of liste) {
    const couche = c.pinceau.couches[n] as Couche;
    if (couche.remplissages.size === 0 && couche.traits.size === 0) continue;
    const m = matrice(c);
    ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);
    for (const [couleur, path] of couche.remplissages) { ctx.fillStyle = couleur; ctx.fill(path); }
    for (const [cle, e] of couche.traits) { ctx.strokeStyle = cle.slice(0, cle.lastIndexOf('|')); ctx.lineWidth = e.largeur; ctx.stroke(e.path); }
  }
}

const hexA = (hex: string, a: number): string => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const OMBRE_COUL = 'rgba(25,35,15,.26)';

function polygone(p: Path2D, g: Float32Array, d: Float32Array, n: number): void {
  p.moveTo(g[0] as number, g[1] as number);
  for (let i = 1; i < n; i++) p.lineTo(g[2 * i] as number, g[2 * i + 1] as number);
  for (let i = n - 1; i >= 0; i--) p.lineTo(d[2 * i] as number, d[2 * i + 1] as number);
  p.closePath();
}
function polyligne(p: Path2D, t: Float32Array, n: number): void {
  p.moveTo(t[0] as number, t[1] as number);
  for (let i = 1; i < n; i++) p.lineTo(t[2 * i] as number, t[2 * i + 1] as number);
}
/** Rectangle orienté : centre (cx, cy), axes tournés de `a`, bornes locales [x0, x1] × [y0, y1]. */
function rectO(p: Path2D, cx: number, cy: number, a: number, x0: number, y0: number, x1: number, y1: number): void {
  const c = Math.cos(a), s = Math.sin(a);
  const pt = (x: number, y: number): [number, number] => [cx + x * c - y * s, cy + x * s + y * c];
  const [ax, ay] = pt(x0, y0), [bx, by] = pt(x1, y0), [dx, dy] = pt(x1, y1), [ex, ey] = pt(x0, y1);
  p.moveTo(ax, ay); p.lineTo(bx, by); p.lineTo(dx, dy); p.lineTo(ex, ey); p.closePath();
}
const cercle = (p: Path2D, x: number, y: number, r: number): void => { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); };

/** Peinture d'un bloc de route. En mode contrôle : seulement l'accotement et la chaussée, en couleurs de contrôle. */
export function peindreBloc(geo: GeometrieBloc, biome: Biome, controle: boolean): Pinceau {
  const pn = new Pinceau();
  const n = geo.n;
  if (controle) {
    polygone(pn.remp(COUCHE.accotement, '#00ff00'), geo.accotementG, geo.accotementD, n);
    polygone(pn.remp(COUCHE.chaussee, '#202020'), geo.chausseeG, geo.chausseeD, n);
    return pn;
  }
  polygone(pn.remp(COUCHE.herbe, hexA(biome.herbeBord, 0.55)), geo.herbeG, geo.herbeD, n);
  polygone(pn.remp(COUCHE.accotement, biome.accotement), geo.accotementG, geo.accotementD, n);
  polygone(pn.remp(COUCHE.ombreRoute, 'rgba(0,0,0,.20)'), geo.ombreG, geo.ombreD, n);
  polygone(pn.remp(COUCHE.chaussee, '#4b4d55'), geo.chausseeG, geo.chausseeD, n);
  // traces de roues, lignes de rive (0,3 m à l'intérieur de la chaussée), tirets axiaux
  polyligne(pn.trait(COUCHE.marquages, 'rgba(15,15,22,.20)', 0.75), geo.traceG, n);
  polyligne(pn.trait(COUCHE.marquages, 'rgba(15,15,22,.20)', 0.75), geo.traceD, n);
  for (const cote of [geo.chausseeG, geo.chausseeD]) {
    const p = pn.trait(COUCHE.marquages, '#f2f0e6', 0.12);
    for (let i = 0; i < n; i++) {
      const gx = cote[2 * i] as number, gy = cote[2 * i + 1] as number, dx = (geo.axe[2 * i] as number) - gx, dy = (geo.axe[2 * i + 1] as number) - gy, l = Math.hypot(dx, dy) || 1;
      const x = gx + (dx / l) * 0.3, y = gy + (dy / l) * 0.3;
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
  }
  const tirets = pn.remp(COUCHE.marquages, 'rgba(245,235,200,.8)');
  let debut = true;
  for (let i = 0; i < geo.tirets.length; i += 2) {
    const x = geo.tirets[i] as number, y = geo.tirets[i + 1] as number;
    if (Number.isNaN(x)) { tirets.closePath(); debut = true; continue; }
    if (debut) { tirets.moveTo(x, y); debut = false; } else tirets.lineTo(x, y);
  }
  peindreItems(pn, geo.items, biome);
  return pn;
}

/** Peinture d'une cellule du décor ambiant. */
export function peindreCellule(cel: Cellule, biome: Biome): Pinceau {
  const pn = new Pinceau();
  for (const t of cel.taches) peindreTache(pn, t, biome);
  for (const c of cel.champs) peindreChamp(pn, c, biome);
  for (const l of cel.lacs) peindreLac(pn, l, biome);
  peindreItems(pn, cel.items, biome);
  return pn;
}

function peindreTache(pn: Pinceau, t: Tache, biome: Biome): void {
  // tache douce : seize disques concentriques qui s'empilent (opacité cumulée au centre ≈ t.alpha), sans bord franc
  const N = 16, couleur = hexA(biome.taches[t.c] as string, 1 - Math.pow(1 - t.alpha, 1 / N));
  for (let i = 0; i < N; i++) cercle(pn.remp(COUCHE.taches, couleur), t.x, t.y, t.r * (1 - i / N));
}

function peindreChamp(pn: Pinceau, f: Champ, biome: Biome): void {
  rectO(pn.remp(COUCHE.champs, biome.champs[f.c] as string), f.x, f.y, f.a, -f.l / 2, -f.h / 2, f.l / 2, f.h / 2);
  if (!biome.sillons) return;
  const s = pn.trait(COUCHE.champs, 'rgba(40,50,10,.13)', f.ecart * 0.45);
  const c = Math.cos(f.a), si = Math.sin(f.a);
  for (let y = -f.h / 2 + f.ecart * 0.5; y < f.h / 2; y += f.ecart) { s.moveTo(f.x - (f.l / 2) * c - y * si, f.y - (f.l / 2) * si + y * c); s.lineTo(f.x + (f.l / 2) * c - y * si, f.y + (f.l / 2) * si + y * c); }
  const b = pn.trait(COUCHE.champs, 'rgba(40,60,20,.35)', 0.13);
  rectO(b, f.x, f.y, f.a, -f.l / 2, -f.h / 2, f.l / 2, f.h / 2);
}

function peindreLac(pn: Pinceau, l: Lac, biome: Biome): void {
  const blob = (p: Path2D, rad: number, dx: number): void => {
    const rn = creerAlea(l.graine), n = 14, pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rd = rad * (1 + (rn.suivant() - 0.5) * 0.24); pts.push([l.x + dx + Math.cos(a) * rd, l.y + dx + Math.sin(a) * rd]); }
    for (let i = 0; i < n; i++) {
      const p0 = pts[i] as [number, number], p1 = pts[(i + 1) % n] as [number, number], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      if (i === 0) p.moveTo(mx, my); else p.quadraticCurveTo(p0[0], p0[1], mx, my);
    }
    const p0 = pts[0] as [number, number], p1 = pts[1] as [number, number];
    p.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); p.closePath();
  };
  blob(pn.remp(COUCHE.champs, biome.rive), l.r * 1.18, 0);
  blob(pn.remp(COUCHE.champs, biome.eau), l.r, 0);
  blob(pn.remp(COUCHE.champs, 'rgba(20,70,90,.22)'), l.r * 0.72, l.r * 0.05);
}

function etoile(p: Path2D, cx: number, cy: number, r: number, pointes: number, creux: number): void {
  for (let i = 0; i < pointes; i++) {
    const a = (i / pointes) * TAU, rad = r * (i % 2 ? creux : 1.05);
    if (i === 0) p.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); else p.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  p.closePath();
}

function peindreItems(pn: Pinceau, items: readonly Item[], biome: Biome): void {
  const ombre = pn.remp(COUCHE.ombres, OMBRE_COUL);
  const ell = (p: Path2D, x: number, y: number, rx: number, ry: number, a = 0): void => { p.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a)); p.ellipse(x, y, rx, ry, a, 0, TAU); };
  const ox = (k: number) => OMBRE.x * k, oy = (k: number) => OMBRE.y * k;
  for (const it of items) {
    switch (it.k) {
      case 'arbre': {
        const [sombre, clair] = biome.arbres[it.c] as readonly [string, string], r = it.r;
        ell(ombre, it.x + ox(r * 0.9), it.y + oy(r * 0.9), r * 1.02, r * 0.95);
        if (it.conifere) {
          etoile(pn.remp(COUCHE.corps, sombre), it.x, it.y, r, 16, 0.69);
          etoile(pn.remp(COUCHE.corps, clair), it.x - r * 0.1, it.y + r * 0.1, r * 0.6, 16, 0.6);
        } else {
          cercle(pn.remp(COUCHE.corps, sombre), it.x, it.y, r);
          cercle(pn.remp(COUCHE.corps, clair), it.x - r * 0.14, it.y + r * 0.16, r * 0.82);
          const rn = creerAlea(Math.floor(it.v * 1e9) || 1), taches = pn.remp(COUCHE.corps, hexA(sombre, 0.55));
          for (let i = 0; i < 4; i++) { const a = rn.suivant() * TAU, d = r * 0.45 * rn.suivant(); cercle(taches, it.x + Math.cos(a) * d, it.y + Math.sin(a) * d, r * 0.2); }
          cercle(pn.remp(COUCHE.corps, 'rgba(255,255,230,.22)'), it.x - r * 0.38, it.y + r * 0.42, r * 0.27);
        }
        break;
      }
      case 'buisson': {
        const [sombre, clair] = biome.arbres[it.c] as readonly [string, string];
        ell(ombre, it.x + ox(it.r * 0.7), it.y + oy(it.r * 0.7), it.r, it.r * 0.9);
        cercle(pn.remp(COUCHE.corps, sombre), it.x, it.y, it.r);
        cercle(pn.remp(COUCHE.corps, clair), it.x - it.r * 0.2, it.y + it.r * 0.2, it.r * 0.7);
        break;
      }
      case 'rocher': {
        ell(ombre, it.x + ox(it.r * 0.8), it.y + oy(it.r * 0.8), it.r * 1.1, it.r * 0.9);
        const poly = (sc: number, dx: number, dy: number, couleur: string): void => {
          const p = pn.remp(COUCHE.corps, couleur);
          for (let i = 0; i < it.cotes; i++) {
            const a = it.a + (i / it.cotes) * TAU, rad = it.r * sc * (0.85 + ((i * 37) % 7) / 35), x = it.x + dx + Math.cos(a) * rad, y = it.y + dy + Math.sin(a) * rad;
            if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
          }
          p.closePath();
        };
        poly(1, 0, 0, '#a79c88'); poly(0.6, -it.r * 0.12, it.r * 0.12, '#c2b8a2');
        break;
      }
      case 'cactus': {
        ell(ombre, it.x + ox(it.r * 1.3), it.y + oy(it.r * 1.3), it.r * 0.9, it.r * 0.9);
        cercle(pn.remp(COUCHE.corps, '#4f8a45'), it.x, it.y, it.r);
        const t = pn.trait(COUCHE.corps, '#3c7035', 0.08);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; t.moveTo(it.x, it.y); t.lineTo(it.x + Math.cos(a) * it.r, it.y + Math.sin(a) * it.r); }
        cercle(pn.remp(COUCHE.corps, '#e86a8f'), it.x, it.y, it.r * 0.22);
        break;
      }
      case 'foin': {
        ell(ombre, it.x + ox(8 / 40 * 4), it.y + oy(8 / 40 * 4), it.r, it.r);
        cercle(pn.remp(COUCHE.corps, '#d9b457'), it.x, it.y, it.r);
        const t = pn.trait(COUCHE.corps, '#b48d34', 0.08);
        cercle(t, it.x, it.y, it.r * 0.55); cercle(t, it.x, it.y, it.r * 0.2);
        break;
      }
      case 'maison': {
        const { x, y, l, h, a } = it;
        rectO(ombre, x + ox(2), y + oy(2), a, -l / 2, -h / 2, l / 2, h / 2);
        const toit = biome.toits[it.toit] as string;
        if (it.plat) {
          rectO(pn.remp(COUCHE.corps, toit), x, y, a, -l / 2, -h / 2, l / 2, h / 2);
          rectO(pn.trait(COUCHE.corps, 'rgba(120,80,30,.45)', 0.25), x, y, a, -l / 2, -h / 2, l / 2, h / 2);
          rectO(pn.remp(COUCHE.corps, 'rgba(120,80,30,.35)'), x, y, a, l * 0.1, -h * 0.2, l * 0.38, h * 0.2);
        } else {
          rectO(pn.remp(COUCHE.corps, biome.mur), x, y, a, -l / 2 - 0.3, -h / 2 - 0.3, l / 2 + 0.3, h / 2 + 0.3);
          rectO(pn.remp(COUCHE.corps, toit), x, y, a, -l / 2, 0, l / 2, h / 2);            // versant éclairé
          rectO(pn.remp(COUCHE.corps, hexA(toit, 0.55)), x, y, a, -l / 2, -h / 2, l / 2, 0); // versant à l'ombre
          rectO(pn.remp(COUCHE.corps, 'rgba(0,0,0,.28)'), x, y, a, -l / 2, -0.15, l / 2, 0.15); // faîtage
          if (it.cheminee) { rectO(pn.remp(COUCHE.corps, '#6b5a52'), x, y, a, l * 0.22, -h * 0.32, l * 0.22 + 0.9, -h * 0.32 + 0.9); rectO(pn.remp(COUCHE.corps, '#2d2623'), x, y, a, l * 0.22 + 0.2, -h * 0.32 + 0.2, l * 0.22 + 0.7, -h * 0.32 + 0.7); }
        }
        break;
      }
      case 'tente': {
        const { x, y, l, h, a } = it;
        rectO(ombre, x + ox(0.8), y + oy(0.8), a, -l / 2, -h / 2, l / 2, h / 2);
        rectO(pn.remp(COUCHE.corps, HABITS[it.c] as string), x, y, a, -l / 2, -h / 2, l / 2, h / 2);
        const b = pn.remp(COUCHE.corps, 'rgba(255,255,255,.85)');
        for (let u = -l / 2; u < l / 2; u += 0.45) rectO(b, x, y, a, u, -h / 2, Math.min(u + 0.22, l / 2), h / 2);
        rectO(pn.trait(COUCHE.corps, 'rgba(0,0,0,.25)', 0.05), x, y, a, -l / 2, -h / 2, l / 2, h / 2);
        break;
      }
      case 'barriere': {
        const s = pn.trait(COUCHE.ombres, 'rgba(0,0,0,.25)', 0.12);
        s.moveTo(it.x + 0.1, it.y - 0.1); s.lineTo(it.x2 + 0.1, it.y2 - 0.1);
        const b = pn.trait(COUCHE.corps, '#c9ced6', 0.1);
        b.moveTo(it.x, it.y); b.lineTo(it.x2, it.y2);
        cercle(pn.remp(COUCHE.corps, '#7d848f'), it.x, it.y, 0.09);
        break;
      }
      case 'personne': {
        const sc = it.echelle;
        if (it.genre === 2) {
          cercle(pn.remp(COUCHE.corps, HABITS[it.fanion] as string), it.x, it.y, 0.6);
          const w = pn.remp(COUCHE.corps, 'rgba(255,255,255,.82)');
          for (let i = 0; i < 8; i += 2) { w.moveTo(it.x, it.y); w.arc(it.x, it.y, 0.6, (i / 8) * TAU, ((i + 1) / 8) * TAU); w.closePath(); }
          break;
        }
        ell(ombre, it.x + ox(0.12), it.y + oy(0.12), 0.25 * sc, 0.16 * sc, it.a);
        ell(pn.remp(COUCHE.corps, HABITS[it.habit] as string), it.x, it.y, 0.145 * sc, 0.26 * sc, it.a);
        cercle(pn.remp(COUCHE.corps, PEAUX[it.peau] as string), it.x + Math.cos(it.a) * 0.045 * sc, it.y + Math.sin(it.a) * 0.045 * sc, 0.12 * sc);
        if (it.genre === 1) {
          const c = Math.cos(it.a), s = Math.sin(it.a), hampe = pn.trait(COUCHE.corps, '#444444', 0.05);
          hampe.moveTo(it.x - 0.1 * s * 0, it.y); hampe.lineTo(it.x - 0.65 * s, it.y + 0.65 * c);
          rectO(pn.remp(COUCHE.corps, HABITS[it.fanion] as string), it.x - 0.65 * s, it.y + 0.65 * c, it.a, -0.2, -0.14, 0.2, 0.14);
        }
        break;
      }
      case 'poteau': {
        const r = it.km ? 0.7 : 0.35;
        ell(ombre, it.x + ox(r), it.y + oy(r), r, r);
        const p = pn.remp(COUCHE.portiques, it.km ? '#d64a2a' : '#f2f2ee'); // au-dessus du public et des arbres : un poteau ne se cache pas
        p.rect(it.x - r, it.y - r, 2 * r, 2 * r);
        break;
      }
      case 'carre': rectO(pn.remp(COUCHE.marquages, it.sombre ? '#15151a' : '#f4f2ea'), it.x, it.y, it.a, -it.cote / 2 - 0.005, -it.cote / 2 - 0.005, it.cote / 2 + 0.005, it.cote / 2 + 0.005); break;
      case 'ligne': rectO(pn.remp(COUCHE.marquages, '#f4f2ea'), it.x, it.y, it.a, -0.15, -it.demi, 0.15, it.demi); break;
      case 'portique': {
        const bw = it.fin ? 0.22 : 0.17, cols = it.fin ? PORTIQUE_ARRIVEE : PORTIQUE_FLAMME;
        rectO(pn.remp(COUCHE.ombres, 'rgba(15,20,10,.30)'), it.x + ox(1.1), it.y + oy(1.1), it.a, -bw, -it.demi, bw, it.demi);
        for (const s of [-1, 1]) { cercle(pn.remp(COUCHE.portiques, '#7f8794'), it.x - Math.sin(it.a) * s * it.demi * -1, it.y + Math.cos(it.a) * s * it.demi * -1, 0.28); }
        const seg = (2 * it.demi) / cols.length;
        cols.forEach((c, i) => rectO(pn.remp(COUCHE.portiques, c), it.x, it.y, it.a, -bw, -it.demi + i * seg, bw, -it.demi + (i + 1) * seg + 0.01));
        rectO(pn.trait(COUCHE.portiques, 'rgba(0,0,0,.35)', 0.05), it.x, it.y, it.a, -bw, -it.demi, bw, it.demi);
        break;
      }
    }
  }
}
