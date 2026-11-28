// Vue « Défilement » (UF 2.6) : une caméra suit un point qui avance sur la route, en vue de dessus, sur toute l'étape.
import { TYPES_ETAPE, creerEtape, type Etape, type TypeEtape } from '@pedale/sim';
import { altitude, NOMS_TYPE_ETAPE, penteSignee, positionKm } from '../format.ts';
import { biomeEffectif, BIOMES, CLES_BIOME, type ChoixBiome } from './biomes.ts';
import { orientationEffective, type ChoixOrientation, type Orientation } from './camera.ts';
import { Rendu, type InfoImage } from './rendu.ts';

interface Reglages { graine: number; type: TypeEtape; km: number; vitesse_m_s: number; acceleration: number; orientation: ChoixOrientation; zoom: number; biome: ChoixBiome }

const DEFAUT: Reglages = { graine: 1, type: 'montagne', km: 200, vitesse_m_s: 12, acceleration: 1, orientation: 'auto', zoom: 1, biome: 'auto' };
const ZOOM_DE_BASE_PX_M = 6;
const ACCELERATIONS = [1, 4, 16, 64];

export type { Reglages as ReglagesDefilement };
export function lireReglagesDefilement(hash: string): Reglages {
  const r = { ...DEFAUT };
  const p = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
  const type = p.get('type');
  if (type && (TYPES_ETAPE as readonly string[]).includes(type)) r.type = type as TypeEtape;
  const nombre = (cle: string): number | null => { const v = p.get(cle); return v !== null && Number.isFinite(Number(v)) ? Number(v) : null; };
  const km = nombre('km'); if (km !== null && km >= 20 && km <= 250) r.km = Math.round(km);
  const g = nombre('graine'); if (g !== null && Number.isInteger(g) && g >= 0) r.graine = g;
  const v = nombre('v'); if (v !== null && v >= 5 && v <= 25) r.vitesse_m_s = v;
  const k = nombre('k'); if (k !== null && ACCELERATIONS.includes(k)) r.acceleration = k;
  const z = nombre('z'); if (z !== null && [1, 2, 4].includes(z)) r.zoom = z;
  const o = p.get('o'); if (o === 'cap' || o === 'nord' || o === 'auto') r.orientation = o;
  const b = p.get('b'); if (b === 'auto' || (CLES_BIOME as readonly string[]).includes(b ?? '')) r.biome = b as ChoixBiome;
  return r;
}

export function ecrireReglagesDefilement(r: Reglages): string {
  return `#defilement?type=${r.type}&km=${r.km}&graine=${r.graine}&v=${r.vitesse_m_s}&k=${r.acceleration}&o=${r.orientation}&z=${r.zoom}&b=${r.biome}`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texte?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
};

/** Résultat d'une mesure image par image (voir `window.__defilement.mesurer`). */
export interface Mesure {
  intervalles_ms: number[];
  dessin_ms: number[];
  /** Vitesse apparente d'un repère du sol (px/s) sur les images en ligne droite, avec la valeur attendue (zoom × vitesse × accélération). */
  vitesseApparente_px_s: number[];
  vitesseAttendue_px_s: number;
  /** Blocs en cache à chaque image, et nombre de blocs construits au total. */
  blocsEnCache: number[];
  /** Cellules de décor en cache à chaque image. */
  cellulesEnCache: number[];
  construits: number;
  imagesSansTroue?: number;
  s_debut_m: number;
  s_fin_m: number;
}

export interface VueDefilement { readonly racine: HTMLElement; ouvrir(): void; fermer(): void }

export function monterVueDefilement(parent: HTMLElement): VueDefilement {
  const racine = el('section', 'defilement');
  racine.hidden = true;
  const form = el('form', 'etape-commandes');
  const champ = (texte: string, c: HTMLElement) => { const l = el('label', 'champ'); l.append(texte, c); return l; };
  const selType = el('select'); for (const t of TYPES_ETAPE) selType.append(new Option(NOMS_TYPE_ETAPE[t] ?? t, t));
  const inKm = el('input'); inKm.type = 'number'; inKm.min = '20'; inKm.max = '250'; inKm.step = '10';
  const inGraine = el('input'); inGraine.type = 'number'; inGraine.min = '0'; inGraine.step = '1';
  const inVitesse = el('input'); inVitesse.type = 'number'; inVitesse.min = '5'; inVitesse.max = '25'; inVitesse.step = '1';
  const selAccel = el('select'); for (const a of ACCELERATIONS) selAccel.append(new Option(`×${a}`, String(a)));
  const selOrientation = el('select'); selOrientation.append(new Option('Auto (route en haut jusqu\'à ×4)', 'auto'), new Option('Route vers le haut', 'cap'), new Option('Nord en haut', 'nord'));
  const selBiome = el('select'); selBiome.append(new Option('Décor : auto (selon le type)', 'auto')); for (const k of CLES_BIOME) selBiome.append(new Option(BIOMES[k].nom, k));
  const selZoom = el('select'); selZoom.append(new Option('Zoom normal', '1'), new Option('Zoom ×2', '2'), new Option('Fort zoom ×4', '4'));
  const bGenerer = el('button', undefined, 'Générer'); bGenerer.type = 'submit';
  const bAutre = el('button', undefined, 'Autre route'); bAutre.type = 'button';
  const bPause = el('button', undefined, 'Pause'); bPause.type = 'button'; bPause.title = 'Espace';
  form.append(champ('Type', selType), champ('Longueur (km)', inKm), champ('Graine', inGraine), champ('Vitesse (m/s)', inVitesse), champ('Temps', selAccel),
    champ('Caméra', selOrientation), champ('Zoom', selZoom), champ('Décor', selBiome), bGenerer, bAutre, bPause);
  const canvas = el('canvas', 'cv-defilement'); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Vue de dessus de la route qui défile');
  const hud = el('pre', 'hud');
  const curseur = el('input', 'curseur'); curseur.type = 'range'; curseur.min = '0'; curseur.step = '10'; curseur.setAttribute('aria-label', 'Position le long de la route');
  const aide = el('p', 'legende', 'Espace : pause. Le point suit la route à vitesse constante (de 5 à 25 m/s), le temps peut être accéléré ×4, ×16, ×64. Le curseur place le coureur n\'importe où.');
  const scene = el('div', 'scene'); scene.append(canvas, hud);
  racine.append(form, scene, curseur, aide);
  parent.append(racine);

  let reglages: Reglages = { ...DEFAUT };
  let etape: Etape | null = null;
  let rendu: Rendu | null = null;
  let s_m = 0;
  let enPause = false;
  let visible = false;
  let dernierT: number | null = null;
  let derniereInfo: InfoImage | null = null;
  const recents: number[] = [];
  let majHud = 0;
  let mesure: { m: Mesure; fin: number; resoudre: (m: Mesure) => void; ancre: { k: number; x: number; y: number } | null; precedent: { x: number; y: number; t: number; k: number } | null } | null = null;

  function generer(r: Reglages): void {
    reglages = { ...r };
    selType.value = r.type; inKm.value = String(r.km); inGraine.value = String(r.graine); inVitesse.value = String(r.vitesse_m_s);
    selAccel.value = String(r.acceleration); selOrientation.value = r.orientation; selZoom.value = String(r.zoom); selBiome.value = r.biome;
    etape = creerEtape(r.graine, r.type, r.km * 1000);
    rendu = new Rendu(canvas, etape, { orientation: orientationEffective(r.orientation, r.acceleration), zoom_px_m: ZOOM_DE_BASE_PX_M * r.zoom, controle: false, biome: biomeEffectif(r.biome, r.type) });
    curseur.max = String(Math.floor(etape.longueur_m));
    s_m = 0; dernierT = null;
    history.replaceState(null, '', ecrireReglagesDefilement(r));
  }
  function appliquerOptions(): void {
    if (!rendu) return;
    reglages = { ...reglages, vitesse_m_s: Math.min(25, Math.max(5, Number(inVitesse.value) || DEFAUT.vitesse_m_s)), acceleration: Number(selAccel.value), orientation: selOrientation.value as ChoixOrientation, zoom: Number(selZoom.value), biome: selBiome.value as ChoixBiome };
    const biomeAvant = rendu.options.biome;
    rendu.options = { ...rendu.options, biome: biomeEffectif(reglages.biome, reglages.type), orientation: orientationEffective(reglages.orientation, reglages.acceleration), zoom_px_m: ZOOM_DE_BASE_PX_M * reglages.zoom };
    if (rendu.options.biome !== biomeAvant) rendu.rafraichirPalette();
    history.replaceState(null, '', ecrireReglagesDefilement(reglages));
  }
  for (const c of [inVitesse, selAccel, selOrientation, selZoom, selBiome]) c.addEventListener('change', appliquerOptions);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    generer({ ...reglages, type: selType.value as TypeEtape, km: Math.min(250, Math.max(20, Math.round(Number(inKm.value) || DEFAUT.km))), graine: Math.max(0, Math.floor(Number(inGraine.value) || 0)),
      vitesse_m_s: Math.min(25, Math.max(5, Number(inVitesse.value) || DEFAUT.vitesse_m_s)), acceleration: Number(selAccel.value), orientation: selOrientation.value as ChoixOrientation, zoom: Number(selZoom.value), biome: selBiome.value as ChoixBiome });
  });
  bAutre.addEventListener('click', () => generer({ ...reglages, type: selType.value as TypeEtape, graine: Math.floor(Math.random() * 1_000_000) }));
  const basculer = () => { enPause = !enPause; bPause.textContent = enPause ? 'Reprendre' : 'Pause'; dernierT = null; };
  bPause.addEventListener('click', basculer);
  curseur.addEventListener('input', () => { s_m = Number(curseur.value); });
  addEventListener('keydown', (e) => {
    if (!visible || e.key !== ' ') return;
    const c = e.target as HTMLElement;
    if (c.tagName === 'INPUT' || c.tagName === 'SELECT' || c.tagName === 'BUTTON') return;
    e.preventDefault(); basculer();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => rendu?.rafraichirPalette());

  function image(t: number): void {
    requestAnimationFrame(image);
    if (!visible || !etape || !rendu) { dernierT = null; return; }
    const dt = dernierT === null ? 0 : Math.min((t - dernierT) / 1000, 0.1);
    if (dernierT !== null && !enPause) recents.push(t - dernierT);
    if (recents.length > 120) recents.shift();
    const intervalle = dernierT === null ? 0 : t - dernierT;
    dernierT = t;
    if (!enPause && s_m < etape.longueur_m) s_m = Math.min(etape.longueur_m, s_m + reglages.vitesse_m_s * reglages.acceleration * dt);
    derniereInfo = rendu.dessiner(s_m);
    curseur.value = String(Math.round(s_m));

    if (mesure && intervalle > 0) {
      const m = mesure.m;
      m.intervalles_ms.push(intervalle); m.dessin_ms.push(derniereInfo.dessin_ms); m.blocsEnCache.push(derniereInfo.cache); m.cellulesEnCache.push(derniereInfo.cacheCellules);
      // repère du sol : poteau d'hectomètre le plus proche à plus de 40 m devant, suivi tant qu'il est le même
      const k = Math.ceil((s_m + 40) / 100);
      const sp = k * 100;
      if (sp <= etape.longueur_m) {
        const q = etape.versMonde(sp, etape.demiTotale(sp) + 0.9);
        const e = rendu.versEcran(s_m, q.x_m, q.y_m);
        // « hors virages » : ligne droite sur toute la zone qui influence l'image (derrière le coureur, jusqu'au repère et au cap lissé)
        let droite = true;
        for (let d = -5; d <= 190 && droite; d += 10) droite = etape.lire(Math.min(Math.max(s_m + d, 0), etape.longueur_m)).rayon_m === null;
        if (mesure.precedent && mesure.precedent.k === k && droite && t - mesure.precedent.t > 0) {
          m.vitesseApparente_px_s.push(Math.hypot(e.x_px - mesure.precedent.x, e.y_px - mesure.precedent.y) / ((t - mesure.precedent.t) / 1000));
        }
        mesure.precedent = { x: e.x_px, y: e.y_px, t, k };
      } else mesure.precedent = null;
      if (t >= mesure.fin || s_m >= etape.longueur_m) {
        m.s_fin_m = s_m; m.construits = rendu.construitsTotal;
        const r = mesure.resoudre; mesure = null; r(m);
      }
    }
    if (t - majHud > 250) {
      majHud = t;
      const l = etape.lire(s_m);
      const moy = recents.length ? recents.reduce((a, b) => a + b, 0) / recents.length : 0;
      hud.textContent = `${positionKm(l.s_m)} / ${positionKm(etape.longueur_m)}   ${altitude(l.altitude_m)}   pente ${penteSignee(l.pente_ratio)}\n`
        + `${(reglages.vitesse_m_s * 3.6).toFixed(0)} km/h × ${reglages.acceleration}   image ${moy ? moy.toFixed(1) : '–'} ms (${moy ? Math.round(1000 / moy) : '–'} i/s)   dessin ${derniereInfo.dessin_ms.toFixed(1)} ms\n`
        + `blocs : ${derniereInfo.blocsCharges} + ${derniereInfo.cellulesVisibles} cellules à l'écran, ${derniereInfo.cache} + ${derniereInfo.cacheCellules} en mémoire`;
    }
  }
  requestAnimationFrame(image);

  // — crochets pour la mesure automatique (navigateur piloté) —
  const hooks = {
    etat: () => ({ s_m, longueur_m: etape?.longueur_m ?? 0, enPause, reglages, info: derniereInfo }),
    placer(s: number, pause = true): void { s_m = s; if (pause && !enPause) basculer(); },
    /** Zoom libre (px par mètre), pour les aperçus larges ; revient au zoom choisi au prochain changement de réglage. */
    reglerZoomPx(px_m: number): void { if (rendu) rendu.options = { ...rendu.options, zoom_px_m: px_m }; },
    reglerCamera(orientation: ChoixOrientation, zoom: number): void { if (!rendu) return; selOrientation.value = orientation; selZoom.value = String(zoom); appliquerOptions(); },
    /** Fait défiler pendant `duree_reelle_s` secondes (ou jusqu'à l'arrivée) et rend les mesures image par image. */
    mesurer(o: { vitesse_m_s: number; acceleration: number; duree_reelle_s: number; debut_m: number }): Promise<Mesure> {
      if (enPause) basculer();
      inVitesse.value = String(o.vitesse_m_s); selAccel.value = String(o.acceleration); appliquerOptions();
      s_m = o.debut_m; dernierT = null;
      const m: Mesure = { intervalles_ms: [], dessin_ms: [], vitesseApparente_px_s: [], vitesseAttendue_px_s: ZOOM_DE_BASE_PX_M * reglages.zoom * o.vitesse_m_s * o.acceleration,
        blocsEnCache: [], cellulesEnCache: [], construits: 0, s_debut_m: o.debut_m, s_fin_m: o.debut_m };
      return new Promise((resoudre) => { mesure = { m, fin: performance.now() + o.duree_reelle_s * 1000, resoudre, ancre: null, precedent: null }; });
    },
    /**
     * Position réelle d'un poteau kilométrique (rouge) dans l'image dessinée, comparée à celle que prédit la caméra : écart en pixels.
     * Prouve que l'image affichée est bien celle du modèle de caméra, donc que la vitesse apparente mesurée sur le modèle est celle que l'on voit.
     */
    ecartPoteauKm(o: { positions: number[]; orientation: Orientation; zoom: number }): { ecarts_px: number[]; manques: number } {
      if (!rendu || !etape) throw new Error('pas d\'étape');
      const avant = { ...rendu.options };
      rendu.options = { ...rendu.options, orientation: o.orientation, zoom_px_m: ZOOM_DE_BASE_PX_M * o.zoom, controle: false };
      rendu.rafraichirPalette();
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const ecarts_px: number[] = []; let manques = 0;
      for (const s of o.positions) {
        rendu.dessiner(s, 100);
        const km = Math.round((s + 25 / o.zoom) / 1000) * 1000;
        if (km <= 0 || km > etape.longueur_m) continue;
        const q = etape.versMonde(km, etape.demiTotale(km) + 0.9);
        const e = rendu.versEcran(s, q.x_m, q.y_m);
        const r = 14;
        const x0 = Math.round((e.x_px - r) * dpr), y0 = Math.round((e.y_px - r) * dpr), n = Math.round(2 * r * dpr);
        if (x0 < 0 || y0 < 0 || x0 + n > canvas.width || y0 + n > canvas.height) continue;
        const d = ctx.getImageData(x0, y0, n, n).data;
        let sx = 0, sy = 0, sw = 0;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const o4 = 4 * (j * n + i), rr = d[o4] as number, gg = d[o4 + 1] as number, bb = d[o4 + 2] as number;
          if (rr >= 205 && rr <= 222 && gg >= 66 && gg <= 82 && bb >= 34 && bb <= 50) { sx += i + 0.5; sy += j + 0.5; sw++; } // #d64a2a, le poteau km
        }
        if (sw === 0) { manques++; continue; }
        ecarts_px.push(Math.hypot((x0 + sx / sw) / dpr - e.x_px, (y0 + sy / sw) / dpr - e.y_px));
      }
      rendu.options = avant; rendu.rafraichirPalette();
      return { ecarts_px, manques };
    },
    /**
     * Contrôle de couverture : sol magenta, accotements verts, chaussée gris foncé, sans décor. Sur chaque position demandée, la chaussée et les accotements
     * doivent couvrir exactement la route (pas de trou, pas de couture), et le magenta ne doit jamais apparaître sur la route.
     */
    couverture(o: { positions: number[]; orientation: Orientation; zoom: number }): { points: number; erreurs: number; exemples: string[] } {
      if (!rendu || !etape) throw new Error('pas d\'étape');
      const avant = { ...rendu.options };
      rendu.options = { ...rendu.options, orientation: o.orientation, zoom_px_m: ZOOM_DE_BASE_PX_M * o.zoom, controle: true };
      rendu.rafraichirPalette();
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      let points = 0, erreurs = 0;
      const exemples: string[] = [];
      for (const s of o.positions) {
        rendu.dessiner(s, 100);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const lecture = (x: number, y: number): [number, number, number] | null => {
          if (x < 2 || y < 2 || x > w - 2 || y > h - 2) return null;
          const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
          return [d[0] as number, d[1] as number, d[2] as number];
        };
        const proche = (c: [number, number, number], r: number, g: number, b: number) => Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b) < 40;
        const centre = etape.lire(s);
        const ancre = rendu.versEcran(s, centre.x_m, centre.y_m); // le triangle du coureur masque la route autour de ce point
        const marge = 0.45; // m : on reste à l'intérieur de chaque bande, loin des bords où l'anti-crénelage mélange les couleurs
        const fenetre = Math.min(70, (Math.max(w, h) / (ZOOM_DE_BASE_PX_M * o.zoom)) / 1.4);
        for (let ds = -fenetre; ds <= fenetre; ds += 0.5) {
          const sc = s + ds;
          if (sc < 0 || sc > etape.longueur_m) continue;
          const l = etape.lire(sc), demi = l.largeurChaussee_m / 2, dem2 = demi + l.accotement_m;
          for (const [d, att] of [[0, 'chaussee'], [demi - marge, 'chaussee'], [-(demi - marge), 'chaussee'], [demi + marge, 'accotement'], [-(demi + marge), 'accotement'], [dem2 - marge, 'accotement'], [-(dem2 - marge), 'accotement']] as [number, string][]) {
            const q = etape.versMonde(sc, d);
            const e = rendu.versEcran(s, q.x_m, q.y_m);
            const c = lecture(e.x_px, e.y_px);
            if (!c || Math.hypot(e.x_px - ancre.x_px, e.y_px - ancre.y_px) < 14) continue;
            points++;
            const bon = att === 'chaussee' ? proche(c, 32, 32, 32) : proche(c, 0, 255, 0);
            if (!bon) { erreurs++; if (exemples.length < 6) exemples.push(`s=${s} +${ds} d=${d.toFixed(2)} attendu ${att} lu ${c.join(',')}`); }
          }
        }
      }
      rendu.options = avant; rendu.rafraichirPalette();
      return { points, erreurs, exemples };
    },
  };
  (window as unknown as { __defilement: typeof hooks }).__defilement = hooks;

  return {
    racine,
    ouvrir() {
      racine.hidden = false; visible = true;
      if (!etape) generer(lireReglagesDefilement(location.hash));
      dernierT = null;
    },
    fermer() { racine.hidden = true; visible = false; },
  };
}
