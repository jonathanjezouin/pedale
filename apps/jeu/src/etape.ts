// Vue « Étape » (UF 2.5) : carte de toute l'étape, profil d'altitude, loupe sur la route, curseur synchronisé.
// Canvas 2D : le choix du moteur graphique (PixiJS ou non) se tranche à l'UF 2.6, pour le défilement.
import { TYPES_ETAPE, creerEtape, type EchantillonsEtape, type Etape, type TypeEtape } from '@pedale/sim';
import {
  altitude, capDegres, courbureLisible, distance, largeurRoute, NOMS_CLASSE_PENTE, NOMS_TRONCON, NOMS_TYPE_ETAPE, penteSignee, pourcent,
  positionKm,
} from './format.ts';

interface Reglages { graine: number; type: TypeEtape; km: number }
const DEFAUT: Reglages = { graine: 1, type: 'montagne', km: 100 };
const KM_MIN = 20, KM_MAX = 250;
const DEMI_LOUPE_M = 130;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texte?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
};

/** Lit les réglages dans le fragment d'adresse : #etape?type=montagne&km=100&graine=7. */
export function lireReglages(hash: string): Reglages {
  const r = { ...DEFAUT };
  const requete = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const p = new URLSearchParams(requete);
  const type = p.get('type');
  if (type && (TYPES_ETAPE as readonly string[]).includes(type)) r.type = type as TypeEtape;
  const km = Number(p.get('km'));
  if (Number.isFinite(km) && km >= KM_MIN && km <= KM_MAX) r.km = Math.round(km);
  const graine = Number(p.get('graine'));
  if (Number.isInteger(graine) && graine >= 0) r.graine = graine;
  return r;
}

export function ecrireReglages(r: Reglages): string {
  return `#etape?type=${r.type}&km=${r.km}&graine=${r.graine}`;
}

type CleCouleur = 'carte' | 'fond' | 'texte' | 'discret' | 'trait' | 'accent' | 'faible' | 'moyenne' | 'forte'
  | 'plat' | 'bosse' | 'col' | 'descente' | 'chaussee' | 'accotement' | 'marquage';
type Couleurs = Record<CleCouleur, string>;

function couleurs(): Couleurs {
  const s = getComputedStyle(document.documentElement);
  const v = (nom: string): string => s.getPropertyValue(nom).trim();
  return {
    carte: v('--carte'), fond: v('--fond'), texte: v('--texte'), discret: v('--discret'), trait: v('--trait'), accent: v('--accent'),
    faible: v('--pente-faible'), moyenne: v('--pente-moyenne'), forte: v('--pente-forte'),
    plat: v('--troncon-plat'), bosse: v('--troncon-bosse'), col: v('--troncon-col'), descente: v('--troncon-descente'),
    chaussee: v('--chaussee'), accotement: v('--accotement'), marquage: v('--marquage'),
  };
}

/** Prépare un canvas à sa taille d'affichage, nette sur écran dense ; rend le contexte en pixels CSS. */
function preparer(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(10, canvas.clientWidth), h = Math.max(10, canvas.clientHeight);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/** Pas de graduation « rond » tel qu'il y ait environ `n` graduations sur `etendue`. */
function pasGraduation(etendue: number, n: number): number {
  const brut = etendue / n;
  for (const p of [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000]) if (p >= brut) return p;
  return 100_000;
}

function pasLisible(max_m: number): number {
  for (const p of [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000]) if (p >= max_m) return p;
  return 50_000;
}

export interface VueEtape {
  readonly racine: HTMLElement;
  /** À appeler quand la vue devient visible (redessine, lit l'adresse). */
  ouvrir(): void;
}

export function monterVueEtape(parent: HTMLElement): VueEtape {
  const racine = el('section', 'etape');
  racine.hidden = true;

  // — commandes —
  const form = el('form', 'etape-commandes');
  const selType = el('select');
  for (const t of TYPES_ETAPE) selType.append(new Option(NOMS_TYPE_ETAPE[t] ?? t, t));
  const inKm = el('input'); inKm.type = 'number'; inKm.min = String(KM_MIN); inKm.max = String(KM_MAX); inKm.step = '5'; inKm.size = 4;
  const inGraine = el('input'); inGraine.type = 'number'; inGraine.min = '0'; inGraine.step = '1';
  const champ = (texte: string, c: HTMLElement) => { const l = el('label', 'champ'); l.append(texte, c); return l; };
  const bGenerer = el('button', undefined, 'Générer'); bGenerer.type = 'submit'; bGenerer.title = 'Génère l\'étape avec ces réglages (Entrée)';
  const bAutre = el('button', undefined, 'Autre route'); bAutre.type = 'button'; bAutre.title = 'Nouvelle graine au hasard (touche N)';
  form.append(champ('Type', selType), champ('Longueur (km)', inKm), champ('Graine', inGraine), bGenerer, bAutre);
  const resume = el('p', 'etape-resume');

  // — dessins —
  const carte = el('canvas', 'cv-carte'); carte.setAttribute('role', 'img'); carte.setAttribute('aria-label', 'Carte de l\'étape entière');
  const profil = el('canvas', 'cv-profil'); profil.setAttribute('role', 'img'); profil.setAttribute('aria-label', 'Profil d\'altitude de l\'étape');
  const curseur = el('input', 'curseur'); curseur.type = 'range'; curseur.min = '0'; curseur.step = '10'; curseur.setAttribute('aria-label', 'Position le long de la route');
  const legende = el('p', 'legende');
  const loupe = el('canvas', 'cv-loupe'); loupe.setAttribute('role', 'img'); loupe.setAttribute('aria-label', 'Route autour du curseur');
  const lecture = el('dl', 'lecture');
  const colG = el('div', 'etape-col'); colG.append(carte, profil, curseur, legende);
  const colD = el('aside', 'etape-col'); colD.append(el('h3', undefined, 'Au curseur'), loupe, lecture);
  const grille = el('div', 'etape-grille'); grille.append(colG, colD);
  racine.append(form, resume, grille);
  parent.append(racine);

  // — état —
  let etape: Etape | null = null;
  let ech: EchantillonsEtape | null = null;
  let boite = { xmin: 0, xmax: 1, ymin: 0, ymax: 1 };
  let s_m = 0;
  let sale = true;
  let reglages: Reglages = { ...DEFAUT };
  let transformCarte = { ox: 0, oy: 0, k: 1 };

  const champsLecture = ['Position', 'Altitude', 'Pente', 'Classe de pente', 'Tronçon', 'Courbure', 'Cap', 'Largeur de chaussée', 'Lacets', 'Coordonnées'];
  const valeurs = new Map<string, HTMLElement>();
  for (const nom of champsLecture) { const dt = el('dt', undefined, nom); const dd = el('dd'); valeurs.set(nom, dd); lecture.append(dt, dd); }

  function generer(r: Reglages): void {
    reglages = { ...r };
    selType.value = r.type; inKm.value = String(r.km); inGraine.value = String(r.graine);
    const t0 = performance.now();
    etape = creerEtape(r.graine, r.type, r.km * 1000);
    const ms = performance.now() - t0;
    ech = etape.echantillonner(Math.max(10, etape.longueur_m / 15_000));
    boite = { xmin: Math.min(...ech.x_m), xmax: Math.max(...ech.x_m), ymin: Math.min(...ech.y_m), ymax: Math.max(...ech.y_m) };
    curseur.max = String(Math.floor(etape.longueur_m));
    ajusterHauteurCarte();
    s_m = 0;
    const b = etape.bilan;
    resume.textContent = `${NOMS_TYPE_ETAPE[r.type] ?? r.type} · ${r.km} km · graine ${r.graine} · générée en ${Math.max(1, Math.round(ms))} ms — `
      + `dénivelé positif ${altitude(b.denivelePositif_m)} (${Math.round(b.denivelePositif_m / r.km)} m/km), altitude ${altitude(b.altitudeMin_m)} à ${altitude(b.altitudeMax_m)}, `
      + `droites ${pourcent(b.partDroite_ratio)} (la plus longue ${distance(b.plusLongueDroite_m)}), ${b.viragesParKm.toFixed(1).replace('.', ',')} virages/km, `
      + `${b.nbLacets > 0 ? `${b.nbLacets} séries de lacets, ` : ''}largeur ${largeurRoute(b.largeurMin_m)} à ${largeurRoute(b.largeurMax_m)}`;
    history.replaceState(null, '', ecrireReglages(r));
    sale = true;
  }

  /** La carte épouse la forme de l'étape (une bande allongée n'a pas besoin d'un grand cadre vide). */
  function ajusterHauteurCarte(): void {
    if (!ech) return;
    const w = Math.max(carte.clientWidth, 300);
    const bw = Math.max(boite.xmax - boite.xmin, 1), bh = Math.max(boite.ymax - boite.ymin, 1);
    const hauteur = Math.round(Math.min(420, Math.max(150, (w - 36) * (bh / bw) + 64)));
    if (carte.style.height !== `${hauteur}px`) carte.style.height = `${hauteur}px`;
  }

  function placer(s: number): void {
    if (!etape) return;
    s_m = Math.min(Math.max(s, 0), etape.longueur_m);
    sale = true;
  }

  function majLecture(): void {
    if (!etape) return;
    const l = etape.lire(s_m);
    const set = (nom: string, v: string) => { const d = valeurs.get(nom); if (d && d.textContent !== v) d.textContent = v; };
    curseur.value = String(Math.round(l.s_m));
    set('Position', `${positionKm(l.s_m)} sur ${positionKm(etape.longueur_m)}`);
    set('Altitude', altitude(l.altitude_m));
    set('Pente', penteSignee(l.pente_ratio));
    set('Classe de pente', NOMS_CLASSE_PENTE[l.classePente] ?? l.classePente);
    set('Tronçon', NOMS_TRONCON[l.troncon] ?? l.troncon);
    set('Courbure', courbureLisible(l.rayon_m, l.courbure_rad_m));
    set('Cap', capDegres(l.cap_rad));
    set('Largeur de chaussée', `${largeurRoute(l.largeurChaussee_m)} + accotements de ${largeurRoute(l.accotement_m)}`);
    set('Lacets', l.enLacets ? 'oui' : 'non');
    set('Coordonnées', `x ${distance(l.x_m)}, y ${distance(l.y_m)}`);
  }

  function dessinerCarte(c: Couleurs): void {
    const { ctx, w, h } = preparer(carte);
    if (!etape || !ech) return;
    const m = 18;
    const bw = Math.max(boite.xmax - boite.xmin, 1), bh = Math.max(boite.ymax - boite.ymin, 1);
    const k = Math.min((w - 2 * m) / bw, (h - 2 * m - 10) / bh);
    const ox = m + (w - 2 * m - bw * k) / 2, oy = m + (h - 2 * m - 10 - bh * k) / 2;
    transformCarte = { ox, oy, k };
    const X = (x: number) => ox + (x - boite.xmin) * k, Y = (y: number) => oy + (boite.ymax - y) * k;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const couleurClasse = [c.faible, c.moyenne, c.forte] as const;
    let debut = 0;
    ctx.lineWidth = 2;
    for (let i = 1; i <= ech.s_m.length; i++) {
      if (i === ech.s_m.length || ech.classe[i] !== ech.classe[debut]) {
        ctx.beginPath(); ctx.strokeStyle = couleurClasse[ech.classe[debut] as 0 | 1 | 2];
        ctx.moveTo(X(ech.x_m[debut] as number), Y(ech.y_m[debut] as number));
        for (let j = debut + 1; j <= Math.min(i, ech.s_m.length - 1); j++) ctx.lineTo(X(ech.x_m[j] as number), Y(ech.y_m[j] as number));
        ctx.stroke(); debut = i;
      }
    }
    // lacets : surépaisseur sombre
    ctx.strokeStyle = c.texte; ctx.globalAlpha = 0.55; ctx.lineWidth = 4;
    for (const z of etape.lacets) {
      ctx.beginPath();
      let premier = true;
      for (let j = 0; j < ech.s_m.length; j++) {
        const s = ech.s_m[j] as number;
        if (s < z.debut_m || s > z.fin_m) continue;
        if (premier) { ctx.moveTo(X(ech.x_m[j] as number), Y(ech.y_m[j] as number)); premier = false; } else ctx.lineTo(X(ech.x_m[j] as number), Y(ech.y_m[j] as number));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // départ, arrivée
    const dep = etape.lire(0), arr = etape.lire(etape.longueur_m);
    ctx.fillStyle = '#2a9d4a'; ctx.beginPath(); ctx.arc(X(dep.x_m), Y(dep.y_m), 5, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = c.texte; ctx.fillRect(X(arr.x_m) - 4, Y(arr.y_m) - 4, 8, 8);
    // curseur : point et flèche de cap
    const l = etape.lire(s_m);
    const cx = X(l.x_m), cy = Y(l.y_m);
    ctx.strokeStyle = c.carte; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = c.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 2 * Math.PI); ctx.stroke();
    // échelle
    const pas = pasLisible(Math.min(bw * 0.25, 20_000));
    const reel = pas <= bw ? pas : pasLisible(bw / 3);
    ctx.strokeStyle = c.texte; ctx.fillStyle = c.discret; ctx.lineWidth = 2; ctx.font = '11px system-ui, sans-serif';
    const yb = h - 10;
    ctx.beginPath(); ctx.moveTo(m, yb); ctx.lineTo(m + reel * k, yb); ctx.stroke();
    ctx.fillText(distance(reel), m + reel * k + 6, yb + 4);
  }

  function dessinerProfil(c: Couleurs): void {
    const { ctx, w, h } = preparer(profil);
    if (!etape) return;
    const g = 52, d = 22, t = 10, b = 22;
    const L = etape.longueur_m;
    const zmin = etape.bilan.altitudeMin_m, zmax = etape.bilan.altitudeMax_m;
    const marge = Math.max((zmax - zmin) * 0.08, 10);
    const z0 = zmin - marge, z1 = zmax + marge;
    const X = (s: number) => g + (s / L) * (w - g - d), Y = (z: number) => t + (1 - (z - z0) / (z1 - z0)) * (h - t - b);
    // graduations
    ctx.font = '11px system-ui, sans-serif'; ctx.lineWidth = 1;
    const pasZ = pasGraduation(z1 - z0, 4);
    ctx.fillStyle = c.discret; ctx.strokeStyle = c.trait; ctx.textAlign = 'right';
    for (let z = Math.ceil(z0 / pasZ) * pasZ; z <= z1; z += pasZ) {
      ctx.beginPath(); ctx.moveTo(g, Y(z)); ctx.lineTo(w - d, Y(z)); ctx.stroke(); ctx.fillText(altitude(z), g - 6, Y(z) + 4);
    }
    ctx.textAlign = 'center';
    const pasKm = pasGraduation(L, 6);
    for (let s = 0; s <= L; s += pasKm) {
      ctx.textAlign = s === 0 ? 'left' : 'center';
      ctx.fillText(`${Math.round(s / 1000)} km`, X(s), h - 6);
    }
    ctx.textAlign = 'right';
    // aire par tronçon
    const pasEch = Math.max(L / 1200, 10);
    for (const tr of etape.troncons) {
      ctx.beginPath(); ctx.moveTo(X(tr.debut_m), Y(z0));
      for (let s = tr.debut_m; s < tr.fin_m; s += pasEch) ctx.lineTo(X(s), Y(etape.lire(s).altitude_m));
      ctx.lineTo(X(tr.fin_m), Y(etape.lire(tr.fin_m).altitude_m)); ctx.lineTo(X(tr.fin_m), Y(z0)); ctx.closePath();
      ctx.fillStyle = c[tr.type]; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.strokeStyle = c.texte; ctx.lineWidth = 1.5;
    for (let s = 0; s <= L; s += pasEch) { const y = Y(etape.lire(s).altitude_m); if (s === 0) ctx.moveTo(X(s), y); else ctx.lineTo(X(s), y); }
    ctx.stroke();
    // zones de lacets : repères sous la courbe
    ctx.fillStyle = c.texte; ctx.globalAlpha = 0.35;
    for (const z of etape.lacets) ctx.fillRect(X(z.debut_m), h - b - 5, Math.max(2, X(z.fin_m) - X(z.debut_m)), 5);
    ctx.globalAlpha = 1;
    // curseur
    const l = etape.lire(s_m);
    ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(l.s_m), t); ctx.lineTo(X(l.s_m), h - b); ctx.stroke();
    ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(X(l.s_m), Y(l.altitude_m), 5, 0, 2 * Math.PI); ctx.fill();
  }

  function dessinerLoupe(c: Couleurs): void {
    const { ctx, w, h } = preparer(loupe);
    if (!etape) return;
    const l = etape.lire(s_m);
    const k = w / (2 * DEMI_LOUPE_M); // pixels par mètre
    const X = (x: number) => w / 2 + (x - l.x_m) * k, Y = (y: number) => h / 2 - (y - l.y_m) * k;
    ctx.fillStyle = c.fond; ctx.fillRect(0, 0, w, h);
    const s0 = Math.max(0, l.s_m - 2 * DEMI_LOUPE_M), s1 = Math.min(etape.longueur_m, l.s_m + 2 * DEMI_LOUPE_M);
    const gauches: [number, number][] = [], droites: [number, number][] = [], accG: [number, number][] = [], accD: [number, number][] = [], axe: [number, number][] = [];
    for (let s = s0; s <= s1 + 1e-9; s += 2) {
      const sc = Math.min(s, etape.longueur_m);
      const bd = etape.bords(sc), p = etape.lire(sc);
      gauches.push([X(bd.gaucheChaussee.x_m), Y(bd.gaucheChaussee.y_m)]); droites.push([X(bd.droiteChaussee.x_m), Y(bd.droiteChaussee.y_m)]);
      accG.push([X(bd.gaucheAccotement.x_m), Y(bd.gaucheAccotement.y_m)]); accD.push([X(bd.droiteAccotement.x_m), Y(bd.droiteAccotement.y_m)]);
      axe.push([X(p.x_m), Y(p.y_m)]);
    }
    const polygone = (a: [number, number][], bb: [number, number][], couleur: string) => {
      ctx.beginPath(); a.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      [...bb].reverse().forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath(); ctx.fillStyle = couleur; ctx.fill();
    };
    polygone(accG, accD, c.accotement);
    polygone(gauches, droites, c.chaussee);
    const trait = (pts: [number, number][], couleur: string, ep: number, tirets?: number[]) => {
      ctx.beginPath(); pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.setLineDash(tirets ?? []); ctx.strokeStyle = couleur; ctx.lineWidth = ep; ctx.stroke(); ctx.setLineDash([]);
    };
    trait(gauches, c.marquage, 1.2); trait(droites, c.marquage, 1.2);
    trait(axe, c.marquage, 1, [8, 10]);
    // curseur au centre, avec le sens de la marche
    const cx = w / 2, cy = h / 2, a = -l.cap_rad;
    ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 18 * Math.cos(a), cy + 18 * Math.sin(a)); ctx.stroke();
    // échelle de la loupe : 50 m
    ctx.strokeStyle = c.texte; ctx.fillStyle = c.texte; ctx.lineWidth = 2; ctx.font = '11px system-ui, sans-serif';
    ctx.beginPath(); ctx.moveTo(10, h - 12); ctx.lineTo(10 + 50 * k, h - 12); ctx.stroke(); ctx.fillText('50 m', 10 + 50 * k + 6, h - 8);
    ctx.fillStyle = c.discret; ctx.fillText('nord ↑', w - 48, 16);
  }

  function dessiner(): void {
    if (!sale || racine.hidden) return;
    sale = false;
    const c = couleurs();
    majLecture();
    dessinerCarte(c); dessinerProfil(c); dessinerLoupe(c);
    legende.textContent = 'Carte : pente faible (bleu), moyenne (gris), forte (rouge) ; trait épais sombre = lacets. Profil : plat, bosse, col, descente. Cliquer ou faire glisser sur la carte ou le profil ; ← → déplacent le curseur (Maj : 1 km, Alt : 10 m).';
  }
  const boucle = () => { dessiner(); requestAnimationFrame(boucle); };
  requestAnimationFrame(boucle);
  new ResizeObserver(() => { ajusterHauteurCarte(); sale = true; }).observe(racine);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { sale = true; });

  // — interactions —
  const glisser = (cv: HTMLCanvasElement, f: (x: number, y: number) => void) => {
    const lire = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); f(e.clientX - r.left, e.clientY - r.top); };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); lire(e); });
    cv.addEventListener('pointermove', (e) => { if (cv.hasPointerCapture(e.pointerId)) lire(e); });
  };
  glisser(profil, (x) => { if (etape) placer(((x - 52) / (profil.clientWidth - 52 - 22)) * etape.longueur_m); });
  glisser(carte, (x, y) => {
    if (!ech) return;
    let meilleur = 0, d2 = Infinity;
    for (let i = 0; i < ech.s_m.length; i++) {
      const px = transformCarte.ox + ((ech.x_m[i] as number) - boite.xmin) * transformCarte.k;
      const py = transformCarte.oy + (boite.ymax - (ech.y_m[i] as number)) * transformCarte.k;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < d2) { d2 = d; meilleur = i; }
    }
    placer(ech.s_m[meilleur] as number);
  });
  curseur.addEventListener('input', () => placer(Number(curseur.value)));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const km = Math.min(KM_MAX, Math.max(KM_MIN, Math.round(Number(inKm.value) || DEFAUT.km)));
    const graine = Math.max(0, Math.floor(Number(inGraine.value) || 0));
    generer({ graine, type: selType.value as TypeEtape, km });
  });
  const autre = () => generer({ ...reglages, type: selType.value as TypeEtape, graine: Math.floor(Math.random() * 1_000_000) });
  bAutre.addEventListener('click', autre);
  addEventListener('keydown', (e) => {
    if (racine.hidden || !etape) return;
    const cible = e.target as HTMLElement;
    if (cible.tagName === 'INPUT' || cible.tagName === 'SELECT') return;
    const pas = e.shiftKey ? 1000 : e.altKey ? 10 : 100;
    if (e.key === 'ArrowRight') { placer(s_m + pas); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { placer(s_m - pas); e.preventDefault(); }
    else if (e.key === 'Home') placer(0);
    else if (e.key === 'End') placer(etape.longueur_m);
    else if (e.key === 'n' || e.key === 'N') autre();
  });

  return {
    racine,
    ouvrir() {
      racine.hidden = false;
      if (!etape) generer(lireReglages(location.hash));
      sale = true;
    },
  };
}
