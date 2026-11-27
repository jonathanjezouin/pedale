import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { LIBELLE_TYPE, TYPES } from '@pedale/parcours';
import type { TypeEtape } from '@pedale/parcours';
import { ASPIRATION, aspirationValeur, creerMonde, pas, RIDER_LEN, tanVent } from '@pedale/sim';
import type { World } from '@pedale/sim';
import { BIOMES, BIOME_KEYS, PX_PER_M, Scenery, TILE } from './scenery';
import type { BiomeKey } from './scenery';
import { FRAMES, clearRiderTextures, riderTexture } from './riders';
import { DECOR_AUTO, FINALES_MENU, fermerMenu, genererChoix, menuOuvert, ouvrirMenu } from './menu';
import type { Choix, ChoixDecor, ChoixFinale } from './menu';
import { classement, buildRiders, hideEnd, pushFeed, showEnd, updateHud, updateMini, updateRiders, updateStrip, updateTrace } from './ui';

const SIM_DT = 0.25;
const TAU = Math.PI * 2;
const qs = new URLSearchParams(location.search);
let seed = Number(qs.get('seed') ?? 20260);
// décor : « auto » suit le type d'étape (docs/v0.1.2-menu.md §2) ; ?biome=desert l'impose
let decor: ChoixDecor = (BIOME_KEYS as string[]).includes(qs.get('biome') ?? '') ? (qs.get('biome') as BiomeKey) : 'auto';
let biome: BiomeKey = decor === 'auto' ? 'prairie' : decor;
let ventMode: 'fixe' | 'face' = qs.get('vent') === 'face' ? 'face' : 'fixe';
let route: 'courbes' | 'droite' = qs.get('route') === 'droite' ? 'droite' : 'courbes';
// étape générée (docs/v0.0.5-pente.md) : ?etape=montagne&km=150 ; sans ce paramètre, la fin d'étape plate du POC
let etape: TypeEtape | null = (TYPES as readonly string[]).includes(qs.get('etape') ?? '') ? (qs.get('etape') as TypeEtape) : null;
let kmEtape = Math.min(250, Math.max(20, Number(qs.get('km') ?? 100)));
let finale: ChoixFinale = (FINALES_MENU as string[]).includes(qs.get('finale') ?? '') ? (qs.get('finale') as ChoixFinale) : 'auto';

const stageEl = document.getElementById('stage')!;
const app = new Application();
await app.init({ resizeTo: stageEl, background: BIOMES[biome].base, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
stageEl.appendChild(app.canvas);

/* ------------------------- scène ------------------------- */
const world = new Container(); app.stage.addChild(world);
const tileLayer = new Container(); const aspiLayer = new Container(); const ridersLayer = new Container(); const overlay = new Container();
world.addChild(tileLayer, aspiLayer, ridersLayer, overlay);
const aspiGfx = new Graphics(); aspiLayer.addChild(aspiGfx);
let aspiOpacity = 0;                                  // curseur « Aspiration » : 0 = masquée
const wind = new Graphics(); app.stage.addChild(wind);
const labelLayer = new Container(); app.stage.addChild(labelLayer);      // libellés en repère écran (toujours droits)
const ring = new Graphics(); overlay.addChild(ring);
const Q = Math.min(window.devicePixelRatio || 1, 1.25);

interface RiderView { sprite: Sprite; label: Text; dot: Graphics; phase: number; vy: number; pose: number; sway: number; qx: number; qy: number }
let W: World; let scenery: Scenery; let views: RiderView[] = [];
let prev: { x: number; y: number }[] = [];
let acc = 0, timeScale = 1, paused = false, selected = 0, eventPtr = 0, ended = false, auto = true;
const cam = { x: 0, y: 0, zoom: 1, user: 1, vx: 0, vy: 0, rot: 0 };
let selBlend = 0;   // selBlend : transition douce quand on change de coureur
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const tiles = new Map<string, Sprite>();
const over = () => (W.result.statut as string) === 'termine';

function clearTiles() { for (const s of tiles.values()) { s.texture.destroy(true); s.destroy(); } tiles.clear(); }
function ensureTile(tx: number, ty: number): boolean {
  const k = `${tx},${ty}`; if (tiles.has(k)) return false;
  const cv = document.createElement('canvas'); cv.width = cv.height = Math.round(TILE * Q);
  scenery.drawTile(cv.getContext('2d')!, tx, ty, Q);
  const s = new Sprite(Texture.from(cv)); s.position.set(tx * TILE, ty * TILE); s.scale.set(1 / Q);
  tileLayer.addChild(s); tiles.set(k, s); return true;
}

/** Textures des coureurs : 8 coureurs × 4 postures × 12 phases, créées d'avance (quelques-unes par image) et envoyées au GPU avant d'en avoir besoin.
 *  Avant (v0.1.2) elles étaient dessinées à la première apparition d'une posture : un à-coup à chaque nouvelle posture. */
const warmLayer = new Container(); app.stage.addChild(warmLayer);
const warmSprites: Sprite[] = [];
let warmQueue: [number, number, number][] = [];
function lancerEchauffement() {
  warmQueue = [];
  for (let f = 0; f < FRAMES; f++) for (let pose = 0; pose < 4; pose++) for (const r of W.riders) warmQueue.push([r.id, pose, f]);
}
function echauffer() {
  if (!warmQueue.length) { if (warmSprites.length) { warmSprites.forEach((s) => s.destroy()); warmSprites.length = 0; } return; }
  for (let i = 0; i < 12 && warmQueue.length; i++) {
    const [id, pose, f] = warmQueue.shift()!;
    const sp = warmSprites[i] ?? (warmSprites[i] = (() => { const s = new Sprite(Texture.EMPTY); s.anchor.set(0.5); s.alpha = 0.02; s.scale.set(0.05); warmLayer.addChild(s); return s; })());
    sp.texture = riderTexture(id, pose, f); sp.position.set(app.screen.width / 2, app.screen.height / 2);
  }
}

function setupRiders() {
  for (const v of views) { v.sprite.destroy(); v.label.destroy(); v.dot.destroy(); }
  clearRiderTextures();
  views = W.riders.map((r) => {
    const sprite = new Sprite(riderTexture(r.id, 0, 0)); sprite.anchor.set(0.5); sprite.scale.set(0.5); ridersLayer.addChild(sprite);
    const dot = new Graphics(); labelLayer.addChild(dot);
    const label = new Text({ text: r.letter, style: { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: 15, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x111111, width: 4 } } });
    label.anchor.set(0.5); labelLayer.addChild(label);
    return { sprite, label, dot, phase: Math.random() * TAU, vy: 0, pose: 0, sway: Math.random() * TAU, qx: 0, qy: 0 };
  });
}

/** Position écran-monde (px) d'un coureur interpolé entre deux pas de simulation. */
function pos(s: number, d: number) { const p = W.road.toXY(s, d); return { x: p.x * PX_PER_M, y: p.y * PX_PER_M, h: p.heading }; }

function newWorld(s: number) {
  seed = s;
  biome = decor === 'auto' ? DECOR_AUTO[etape ?? 'poc'] : decor;
  const parcours = genererChoix({ type: etape ?? 'poc', km: kmEtape, finale, seed, decor });
  W = creerMonde({ seed, trace: 'changements', ventMode, route, ...(parcours ? { parcours } : {}) });
  document.body.classList.toggle('etape', !!etape);
  document.getElementById('hTitre')!.textContent = etape ? `Pédale · v0.1.2 · huit coureurs, étape ${LIBELLE_TYPE[etape].toLowerCase()} de ${kmEtape} km` : 'Pédale · v0.1.2 · huit coureurs sur le plat';
  scenery = new Scenery(W.road, { seed, biome, finishS: W.finishX });
  prev = W.riders.map((r) => ({ x: r.x, y: r.y })); acc = 0; eventPtr = 0; ended = false; hideEnd();
  document.getElementById('feed')!.innerHTML = '';
  clearTiles(); setupRiders(); lancerEchauffement();
  app.renderer.background.color = BIOMES[biome].base; document.body.style.background = BIOMES[biome].base;
  document.getElementById('biomeName')!.textContent = BIOMES[biome].label;
  document.getElementById('ventName')!.textContent = ventMode === 'fixe' ? 'Vent fixe' : 'Vent de face';
  document.getElementById('routeName')!.textContent = route === 'courbes' ? 'Route qui tourne' : 'Route droite';
  buildRiders(W, (id) => { select(id); });
  const c = pos(W.vue.xMoyen || 0, 0); cam.x = c.x; cam.y = c.y; cam.rot = c.h; cam.vx = cam.vy = 0;
  const url = new URL(location.href); url.searchParams.set('seed', String(seed)); if (decor === 'auto') url.searchParams.delete('biome'); else url.searchParams.set('biome', biome); url.searchParams.set('vent', ventMode); url.searchParams.set('route', route); if (etape) { url.searchParams.set('etape', etape); url.searchParams.set('km', String(kmEtape)); if (finale !== 'auto') url.searchParams.set('finale', finale); else url.searchParams.delete('finale'); } else { for (const k of ['etape', 'km', 'finale']) url.searchParams.delete(k); } history.replaceState(null, '', url);
  for (let i = 0; i < 2; i++) pas(W);
  eventPtr = 0;
}

/* ------------------------- boucle ------------------------- */
const streaks = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), l: 24 + Math.random() * 60, s: 0.6 + Math.random() * 0.8 }));
let hudT = 0, frames = 0, lastNow = performance.now();

function effectiveScale(): number {
  if (!auto) return timeScale;
  const g = W.vue; const lead = g.ordre.length ? Math.max(...g.ordre.map((r) => r.x)) : W.finishX; const reste = W.finishX - lead;
  if (reste < 700) return Math.min(timeScale, 1);
  if (reste < 2500) return Math.min(timeScale, 4);
  return timeScale;
}

function handleEvents() {
  while (eventPtr < W.events.length) {
    const e = W.events[eventPtr++]!; pushFeed(e);
    if (auto && e.grave && e.type !== 'arrivee' && timeScale > 1) setSpeed(1);
  }
  if (over() && !ended) {
    ended = true;
    showEnd(W, { replay: () => newWorld(seed), next: () => newWorld(Math.floor(Math.random() * 90000) + 1000), trace: downloadTrace });
  }
}

function downloadTrace() {
  const slim = W.trace.map((d) => ({ t: d.t, coureur: d.letter, profil: d.archetype, distRestante: Math.round(d.distRestante), declencheur: d.declencheur, intention: d.intention, precedente: d.precedente,
    raisons: d.raisons, percu: d.percu.moi && { reserve: d.percu.moi.reserve, explosivite: d.percu.moi.explosivite, ecartDevant: d.percu.moi.ecartDevant, allure: d.percu.rivaux.allure, ventFace: d.percu.course.ventFace, ventCote: d.percu.course.ventCote }, reel: d.reel, action: d.action }));
  const blob = new Blob([JSON.stringify({ seed, config: W.cfg, resultat: W.result, evenements: W.events, trace: slim }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pedale-trace-${seed}.json`; a.click();
}

app.ticker.add(() => {
  const now = performance.now(), dtReal = Math.min(0.1, (now - lastNow) / 1000); lastNow = now; frames++;
  if (!paused && !over()) {
    acc += dtReal * effectiveScale();
    let guard = 0;
    while (acc >= SIM_DT && guard++ < 600 && !over()) { prev = W.riders.map((r) => ({ x: r.x, y: r.y })); pas(W); acc -= SIM_DT; }
    if (guard >= 600) acc = 0;
    handleEvents();
  }
  const alpha = paused || over() ? 1 : Math.min(1, acc / SIM_DT);
  const motion = paused ? 0 : Math.min(effectiveScale(), 3);

  // positions interpolées (route courbe : on passe par le repère (s, d))
  const sc = paused ? 1 : Math.max(1, effectiveScale());
  const live: { x: number; y: number }[] = [];
  W.riders.forEach((r, i) => {
    const p = prev[i]!, v = views[i]!;
    const s = p.x + (r.x - p.x) * alpha, d = p.y + (r.y - p.y) * alpha;
    const q = pos(s, d);
    const lat = (r.y - p.y) / SIM_DT; v.vy += (lat - v.vy) * 0.2;
    v.phase += r.v * dtReal * motion * 0.032 * 2; v.sway += dtReal * motion * 5.5;
    if (v.pose !== r.posture) v.pose = r.posture;
    const sw = Math.sin(v.sway) * (v.pose === 2 ? 1 : 0);                            // danseuse : le coureur balance le vélo
    v.sprite.position.set(q.x - Math.sin(q.h) * sw * 3.5, q.y + Math.cos(q.h) * sw * 3.5);
    v.sprite.rotation = q.h + Math.atan2(v.vy, Math.max(r.v, 2)) * 1.6 + sw * 0.07;
    v.sprite.texture = riderTexture(r.id, v.pose, Math.floor(((v.phase % TAU) / TAU) * FRAMES) % FRAMES);
    v.sprite.visible = r.status === 'course' || r.status === 'arrive';
    (v as unknown as { s: number; d: number }).s = s; (v as unknown as { s: number; d: number }).d = d;
    v.qx = q.x; v.qy = q.y; (v as unknown as { h: number }).h = q.h;
    if (r.status === 'course') live.push({ x: q.x, y: q.y });
  });

  // caméra : fixée au-dessus du coureur sélectionné le coureur sélectionné va toujours vers le haut : c'est le monde qui tourne
  const viewW = app.screen.width, viewH = app.screen.height;
  const ref = views[selected] && W.riders[selected]!.status === 'course' ? views[selected]! : views.find((_, i) => W.riders[i]!.status === 'course') ?? views[0]!;
  const refH = (ref as unknown as { h: number }).h ?? cam.rot;
  selBlend = Math.max(0, selBlend - dtReal);
  const kPos = (selBlend > 0 ? 7 : 50) * sc, kRot = (selBlend > 0 ? 6 : 12) * sc;     // suivi quasi rigide, proportionnel à la vitesse de simulation (ne « décolle » plus à ×4)
  cam.rot += wrapAngle(refH - cam.rot) * Math.min(1, dtReal * kRot);
  let tx = ref.qx, ty = ref.qy;
  const px = cam.x, py = cam.y;
  cam.x += (tx - cam.x) * Math.min(1, dtReal * kPos); cam.y += (ty - cam.y) * Math.min(1, dtReal * kPos);
  if (dtReal > 0) { cam.vx += ((cam.x - px) / dtReal - cam.vx) * 0.15; cam.vy += ((cam.y - py) / dtReal - cam.vy) * 0.15; }
  const rot = -Math.PI / 2 - cam.rot, cr = Math.cos(rot), sr = Math.sin(rot);
  // zoom : celui de l'utilisateur (molette), jamais modifié automatiquement : la caméra ne « monte » plus selon le coureur choisi
  cam.zoom += (cam.user - cam.zoom) * Math.min(1, dtReal * 6);
  const fx = Math.cos(cam.rot), fy = Math.sin(cam.rot); void fx; void fy;
  world.rotation = rot; world.scale.set(cam.zoom); world.pivot.set(cam.x, cam.y); world.position.set(viewW / 2, viewH * 0.6);
  const toScreen = (x: number, y: number) => { const dx = (x - cam.x) * cam.zoom, dy = (y - cam.y) * cam.zoom; return { x: viewW / 2 + dx * cr - dy * sr, y: viewH * 0.6 + dx * sr + dy * cr }; };

  // libellés en repère écran (lettre + pastille d'intention)
  W.riders.forEach((r, i) => {
    const v = views[i]!, sp = toScreen(v.qx, v.qy);
    // ni lettres ni pastilles sur la course : seule la lettre du coureur sélectionné reste affichée
    v.label.position.set(sp.x - 2, sp.y - 40); v.label.visible = v.sprite.visible && i === selected; v.label.alpha = 1;
    v.dot.clear();
  });

  // tuiles visibles : disque couvrant l'écran (le monde est tourné), 2 nouvelles max par image ; tout au démarrage
  const R = Math.hypot(viewW, viewH) / 2 / cam.zoom + TILE * 0.3;
  const tx0 = Math.floor((cam.x - R) / TILE), tx1 = Math.floor((cam.x + R) / TILE), ty0 = Math.floor((cam.y - R) / TILE), ty1 = Math.floor((cam.y + R) / TILE);
  let budget = frames < 4 ? 99 : 2;
  echauffer();
  const wanted: [number, number, number][] = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx2 = tx0; tx2 <= tx1; tx2++) { const d = Math.hypot((tx2 + 0.5) * TILE - cam.x, (ty + 0.5) * TILE - cam.y); if (d < R + TILE * 0.72) wanted.push([tx2, ty, d]); }
  wanted.sort((a, b) => a[2] - b[2]);
  for (const [tx2, ty2] of wanted) { if (budget <= 0) break; if (ensureTile(tx2, ty2)) budget--; }
  // tuiles devant : le long de la route, jusqu'à ±42 m (la caméra tourne : l'écran déborde de la route), sur les ~100 m à venir ; une seule par image, et seulement si aucune tuile visible n'a été dessinée (v0.1.2 :
  // le dessin d'une tuile coûte 8 à 18 ms, plus qu'une image ; il se faisait au dernier moment, en vue)
  const devant = new Set<string>();
  if (frames >= 4) {
    const s0 = (views[selected] as unknown as { s?: number })?.s ?? 0, vs = W.riders[selected]!.v;
    for (let dd = 20; dd <= Math.max(90, Math.min(160, vs * 7)); dd += 12) for (const lat of [0, -14, 14, -28, 28, -42, 42]) {
      const q = W.road.toXY(Math.min(W.road.s1, s0 + dd), lat), px = Math.floor((q.x * PX_PER_M) / TILE), py = Math.floor((q.y * PX_PER_M) / TILE), k = `${px},${py}`;
      devant.add(k);
      if (budget === (frames < 4 ? 99 : 2) && !tiles.has(k)) { if (ensureTile(px, py)) budget--; }
    }
  }
  for (const [k, s] of tiles) { const [a, b] = k.split(',').map(Number) as [number, number]; if ((a < tx0 - 2 || a > tx1 + 2 || b < ty0 - 2 || b > ty1 + 2) && !devant.has(k)) { s.texture.destroy(true); s.destroy(); tiles.delete(k); } }

  // aspiration : le sillage de chaque coureur est un cône (v0.1.2a) : sa largeur suit celle du modèle (σ(x) = σ0 + k·x, tracé à ±1,55 σ, là où l'abri
  // tombe à 30 % de sa valeur sur l'axe) et son intensité suit la réduction de traînée qu'y trouverait un suiveur ; il dérive avec le vent de côté
  aspiGfx.clear();
  if (aspiOpacity > 0.01) {
    const gaps = [0.2, 0.6, 1.2, 2, 3, 4.2, 5.6, 7.2, 9, 11, 13, 15];
    const demi = (g: number) => 1.55 * (ASPIRATION.sigma0 + ASPIRATION.sigmaPente * g);
    W.riders.forEach((r, i) => {
      if (r.status !== 'course') return;
      const v = views[i]! as unknown as { s: number; d: number }, tb = tanVent(r);
      for (let k = 1; k < gaps.length; k++) {
        const g0 = gaps[k - 1]!, g1 = gaps[k]!;
        const a = Math.sqrt(aspirationValeur((g0 + g1) / 2, 0) / ASPIRATION.base);
        if (a < 0.05) continue;
        const pts = [pos(v.s - RIDER_LEN - g0, v.d + g0 * tb - demi(g0)), pos(v.s - RIDER_LEN - g1, v.d + g1 * tb - demi(g1)), pos(v.s - RIDER_LEN - g1, v.d + g1 * tb + demi(g1)), pos(v.s - RIDER_LEN - g0, v.d + g0 * tb + demi(g0))];
        aspiGfx.poly(pts.flatMap((p2) => [p2.x, p2.y])).fill({ color: 0x14c8b4, alpha: aspiOpacity * 0.32 * a });
      }
    });
  }

  // anneau du coureur sélectionné
  const sv = views[selected]!; ring.clear();
  if (sv && sv.sprite.visible) ring.circle(sv.sprite.x, sv.sprite.y, 46).stroke({ color: 0xffffff, width: 3, alpha: 0.9 }).circle(sv.sprite.x, sv.sprite.y, 49).stroke({ color: 0x111111, width: 1.5, alpha: 0.5 });

  // vent : des traînées d'air emportées à la vitesse du vent dans le monde, vues depuis la caméra (repère écran tourné)
  wind.clear();
  const faceMode = W.cfg.ventMode === 'face';
  let ux = 0, uy = 1, k = 0;
  if (faceMode) k = 0.35 * (W.cfg.vent * PX_PER_M + Math.hypot(cam.vx, cam.vy)) * cam.zoom;                // de face : l'air file vers l'arrière (le bas de l'écran)
  else {
    const wx = (W.vent.wx * PX_PER_M - cam.vx) * cam.zoom, wy = (W.vent.wy * PX_PER_M - cam.vy) * cam.zoom;
    const sx2 = wx * cr - wy * sr, sy2 = wx * sr + wy * cr, m = Math.hypot(sx2, sy2) || 1;
    ux = sx2 / m; uy = sy2 / m; k = 0.35 * Math.min(m, 900);
  }
  for (const s of streaks) {
    s.x += (ux * k * s.s * dtReal * Math.min(effectiveScale(), 3)) / viewW; s.y += (uy * k * s.s * dtReal * Math.min(effectiveScale(), 3)) / viewH;
    if (s.x < -0.1 || s.x > 1.1 || s.y < -0.1 || s.y > 1.1) { s.x = Math.random(); s.y = Math.random(); }
    const px0 = s.x * viewW, py0 = s.y * viewH;
    wind.moveTo(px0, py0).lineTo(px0 - ux * s.l, py0 - uy * s.l).stroke({ color: 0xffffff, width: 1.5, alpha: 0.16 });
  }
  hudT += dtReal;
  if (hudT > 0.2) { hudT = 0; updateHud(W, selected); updateRiders(W, selected); updateStrip(W, selected); updateTrace(W, selected); updateMini(W, null); }
});

/* ------------------------- commandes ------------------------- */
function setSpeed(v: number) {
  paused = v === 0; if (v > 0) timeScale = v;
  document.querySelectorAll<HTMLElement>('#controls button[data-sp]').forEach((b) => b.classList.toggle('on', Number(b.dataset.sp) === (paused ? 0 : timeScale)));
}
document.querySelectorAll<HTMLElement>('#controls button[data-sp]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.sp))));
document.getElementById('auto')!.addEventListener('change', (e) => { auto = (e.target as HTMLInputElement).checked; });
function select(i: number) { if (i !== selected) { selected = i; selBlend = 0.9; } }
const nextSeed = () => newWorld(Math.floor(Math.random() * 90000) + 1000);
const nextBiome = () => { decor = BIOME_KEYS[(BIOME_KEYS.indexOf(biome) + 1) % BIOME_KEYS.length]!; newWorld(seed); };
function ouvrir(annulable: boolean) {
  setSpeed(0);
  ouvrirMenu({ type: etape ?? 'poc', km: kmEtape, finale, seed, decor }, (c: Choix) => { etape = c.type === 'poc' ? null : c.type; kmEtape = c.km; finale = c.finale; decor = c.decor; setSpeed(1); newWorld(c.seed); }, annulable ? () => setSpeed(1) : undefined);
}
const toggleVent = () => { ventMode = ventMode === 'fixe' ? 'face' : 'fixe'; newWorld(seed); };
const toggleRoute = () => { route = route === 'courbes' ? 'droite' : 'courbes'; newWorld(seed); };
document.getElementById('aspi')!.addEventListener('input', (e) => { aspiOpacity = Number((e.target as HTMLInputElement).value) / 100; });
const toggleAspi = () => { const el = document.getElementById('aspi') as HTMLInputElement; el.value = aspiOpacity > 0 ? '0' : '80'; aspiOpacity = Number(el.value) / 100; };
document.getElementById('bNew')!.onclick = nextSeed;
document.getElementById('bMenu')!.onclick = () => ouvrir(true);
document.getElementById('bBiome')!.onclick = nextBiome;
document.getElementById('bVent')!.onclick = toggleVent;
document.getElementById('bRoute')!.onclick = toggleRoute;
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (menuOuvert()) { if (e.key === 'Escape') { fermerMenu(); setSpeed(1); } return; }
  if (e.key === 'p' || e.key === 'P') { ouvrir(true); return; }
  if (e.key === ' ') { setSpeed(paused ? timeScale : 0); e.preventDefault(); }
  else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(4); else if (e.key === '3') setSpeed(16); else if (e.key === '4') setSpeed(64); else if (e.key === '5') setSpeed(256);
  else if (e.key === 'e' || e.key === 'E') { const o: (TypeEtape | null)[] = [null, 'plate', 'vallonnee', 'montagne']; etape = o[(o.indexOf(etape) + 1) % o.length]!; newWorld(seed); }
  else if (e.key === 'n' || e.key === 'N') nextSeed(); else if (e.key === 'b' || e.key === 'B') nextBiome();
  else if (e.key === 'a' || e.key === 'A') toggleAspi();
  else if (e.key === 'v' || e.key === 'V') toggleVent(); else if (e.key === 'r' || e.key === 'R') toggleRoute();
  else if (e.key === 'Tab') { select((selected + 1) % W.riders.length); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {            // ← coureur devant au classement, → coureur derrière
    const rk = classement(W), i = rk.indexOf(selected);
    select(i < 0 ? (rk[0] ?? selected) : rk[Math.max(0, Math.min(rk.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)))]!);
    e.preventDefault();
  }
});
stageEl.addEventListener('wheel', (e) => { cam.user = Math.max(0.35, Math.min(2.2, cam.user * (e.deltaY < 0 ? 1.08 : 0.926))); }, { passive: true });
stageEl.addEventListener('pointerdown', (e) => {
  const rect = stageEl.getBoundingClientRect(), viewW = app.screen.width, viewH = app.screen.height;
  const rot = -Math.PI / 2 - cam.rot, cr = Math.cos(rot), sr = Math.sin(rot);
  const dx = (e.clientX - rect.left - viewW / 2) / cam.zoom, dy = (e.clientY - rect.top - viewH * 0.6) / cam.zoom;
  const wx = cam.x + dx * cr + dy * sr, wy = cam.y - dx * sr + dy * cr;           // rotation inverse
  let best = -1, bd = 60 / Math.max(cam.zoom, 0.5);
  views.forEach((v, i) => { const d = Math.hypot(v.sprite.x - wx, v.sprite.y - wy); if (d < bd && v.sprite.visible) { bd = d; best = i; } });
  if (best >= 0) select(best);
});

cam.user = Math.max(0.7, Math.min(1.2, app.screen.width / 1800)); cam.zoom = cam.user;
newWorld(seed); setSpeed(1);
if (!qs.has('seed') && !qs.has('etape')) ouvrir(false);      // pas de lien de course : on commence par choisir
(window as unknown as { __pedale: unknown }).__pedale = {
  get world() { return W; }, setSpeed, select: (i: number) => { select(i); }, newWorld,
  advance: (sec: number) => { for (let i = 0; i < sec / SIM_DT && !over(); i++) { prev = W.riders.map((r) => ({ x: r.x, y: r.y })); pas(W); } handleEvents(); acc = 0; },
  setZoom: (z: number) => { cam.user = z; }, setAuto: (a: boolean) => { auto = a; },
};
// atelier de relecture : ?seed=9&t=1200&pause=1 ouvre la course 9 à 20 min, en pause (puis Espace / 1 pour la regarder au ralenti, Tab / ← → pour choisir un coureur et lire « pourquoi ? »)
{
  const t0 = Number(qs.get('t') ?? 0);
  if (t0 > 0) (window as unknown as { __pedale: { advance: (s: number) => void } }).__pedale.advance(t0);
  if (qs.get('pause') === '1') setSpeed(0);
}
