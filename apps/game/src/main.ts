import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { creerMonde, pas } from '@pedale/sim';
import type { World } from '@pedale/sim';
import { BIOMES, BIOME_KEYS, PX_PER_M, Scenery, TILE } from './scenery';
import type { BiomeKey } from './scenery';
import { FRAMES, clearRiderTextures, riderTexture } from './riders';
import { INTENT_COLOR, buildRiders, hideEnd, pushFeed, showEnd, updateHud, updateMini, updateRiders, updateStrip, updateTrace } from './ui';

const SIM_DT = 0.25;
const TAU = Math.PI * 2;
const qs = new URLSearchParams(location.search);
let seed = Number(qs.get('seed') ?? 20260);
let biome: BiomeKey = (BIOME_KEYS as string[]).includes(qs.get('biome') ?? '') ? (qs.get('biome') as BiomeKey) : 'prairie';
let ventMode: 'fixe' | 'face' = qs.get('vent') === 'face' ? 'face' : 'fixe';
let route: 'courbes' | 'droite' = qs.get('route') === 'droite' ? 'droite' : 'courbes';

const stageEl = document.getElementById('stage')!;
const app = new Application();
await app.init({ resizeTo: stageEl, background: BIOMES[biome].base, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
stageEl.appendChild(app.canvas);

/* ------------------------- scène ------------------------- */
const world = new Container(); app.stage.addChild(world);
const tileLayer = new Container(); const ridersLayer = new Container(); const overlay = new Container();
world.addChild(tileLayer, ridersLayer, overlay);
const wind = new Graphics(); app.stage.addChild(wind);
const ring = new Graphics(); overlay.addChild(ring);
const Q = Math.min(window.devicePixelRatio || 1, 1.25);

interface RiderView { sprite: Sprite; label: Text; dot: Graphics; phase: number; vy: number; pose: number; sway: number }
let W: World; let scenery: Scenery; let views: RiderView[] = [];
let prev: { x: number; y: number }[] = [];
let acc = 0, timeScale = 1, paused = false, selected = 0, eventPtr = 0, ended = false, auto = true;
const cam = { x: 0, y: 0, zoom: 1, user: 1, vx: 0, vy: 0 };
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

function setupRiders() {
  for (const v of views) { v.sprite.destroy(); v.label.destroy(); v.dot.destroy(); }
  clearRiderTextures();
  views = W.riders.map((r) => {
    const sprite = new Sprite(riderTexture(r.id, 0, 0)); sprite.anchor.set(0.5); sprite.scale.set(0.5); ridersLayer.addChild(sprite);
    const dot = new Graphics(); overlay.addChild(dot);
    const label = new Text({ text: r.letter, style: { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: 15, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x111111, width: 4 } } });
    label.anchor.set(0.5); overlay.addChild(label);
    return { sprite, label, dot, phase: Math.random() * TAU, vy: 0, pose: 0, sway: Math.random() * TAU };
  });
}

/** Position écran-monde (px) d'un coureur interpolé entre deux pas de simulation. */
function pos(s: number, d: number) { const p = W.road.toXY(s, d); return { x: p.x * PX_PER_M, y: p.y * PX_PER_M, h: p.heading }; }

function newWorld(s: number) {
  seed = s; W = creerMonde({ seed, trace: 'changements', ventMode, route });
  scenery = new Scenery(W.road, { seed, biome, finishS: W.finishX });
  prev = W.riders.map((r) => ({ x: r.x, y: r.y })); acc = 0; eventPtr = 0; ended = false; hideEnd();
  document.getElementById('feed')!.innerHTML = '';
  clearTiles(); setupRiders();
  app.renderer.background.color = BIOMES[biome].base; document.body.style.background = BIOMES[biome].base;
  document.getElementById('biomeName')!.textContent = BIOMES[biome].label;
  document.getElementById('ventName')!.textContent = ventMode === 'fixe' ? 'Vent fixe' : 'Vent de face';
  document.getElementById('routeName')!.textContent = route === 'courbes' ? 'Route qui tourne' : 'Route droite';
  buildRiders(W, (id) => { selected = id; });
  const c = pos(W.groupe.xMoyen || 0, 0); cam.x = c.x; cam.y = c.y;
  const url = new URL(location.href); url.searchParams.set('seed', String(seed)); url.searchParams.set('biome', biome); url.searchParams.set('vent', ventMode); url.searchParams.set('route', route); history.replaceState(null, '', url);
  for (let i = 0; i < 2; i++) pas(W);
  eventPtr = 0;
}

/* ------------------------- boucle ------------------------- */
const streaks = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), l: 24 + Math.random() * 60, s: 0.6 + Math.random() * 0.8 }));
let hudT = 0, frames = 0, lastNow = performance.now();

function effectiveScale(): number {
  if (!auto) return timeScale;
  const g = W.groupe; const lead = g.ordre.length ? Math.max(...g.ordre.map((r) => r.x)) : W.finishX; const reste = W.finishX - lead;
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
    raisons: d.raisons, percu: d.percu.moi && { reserve: d.percu.moi.reserve, explosivite: d.percu.moi.explosivite, ecart: d.percu.course.ecart, vitesseGroupe: d.percu.groupe.vitesse, ventFace: d.percu.course.ventFace, ventCote: d.percu.course.ventCote }, reel: d.reel, action: d.action }));
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
  const live: { x: number; y: number }[] = [];
  W.riders.forEach((r, i) => {
    const p = prev[i]!, v = views[i]!;
    const s = p.x + (r.x - p.x) * alpha, d = p.y + (r.y - p.y) * alpha;
    const q = pos(s, d);
    const lat = (r.y - p.y) / SIM_DT; v.vy += (lat - v.vy) * 0.2;
    v.phase += r.v * dtReal * motion * 0.032 * 2; v.sway += dtReal * motion * 5.5;
    if (v.pose !== r.posture) v.pose = r.posture;
    const swayAmp = v.pose === 2 ? 1 : 0;                                            // danseuse : le coureur balance le vélo
    const sw = Math.sin(v.sway) * swayAmp;
    v.sprite.position.set(q.x - Math.sin(q.h) * sw * 3.5, q.y + Math.cos(q.h) * sw * 3.5);
    v.sprite.rotation = q.h + Math.atan2(v.vy, Math.max(r.v, 2)) * 1.6 + sw * 0.07;
    v.sprite.texture = riderTexture(r.id, v.pose, Math.floor(((v.phase % TAU) / TAU) * FRAMES) % FRAMES);
    v.sprite.visible = r.status === 'course' || r.status === 'arrive';
    v.label.position.set(q.x - 2, q.y - 52); v.label.visible = v.sprite.visible; v.label.alpha = r.status === 'arrive' ? 0.5 : 1;
    v.dot.clear();
    if (r.intent.kind && v.sprite.visible) v.dot.circle(q.x + 14, q.y - 52, 5.5).fill(parseInt(INTENT_COLOR[r.intent.kind].slice(1), 16)).stroke({ color: 0x111111, width: 1.5 });
    if (r.status === 'course') live.push({ x: q.x, y: q.y });
  });

  // caméra nord en haut : suit le groupe, dézoome quand l'échappée s'étire, se recentre sur la tête si c'est trop étiré
  const viewW = app.screen.width, viewH = app.screen.height;
  if (live.length) {
    const xs = live.map((o) => o.x), ys = live.map((o) => o.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const bw = Math.max(x1 - x0, 1), bh = Math.max(y1 - y0, 1);
    const needZoom = Math.min((viewW * 0.72) / bw, (viewH * 0.66) / bh);
    const targetZoom = Math.max(0.35, Math.min(cam.user, needZoom));
    cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dtReal * 2.5);
    let tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
    if (needZoom < 0.35) { const lead = W.groupe.ordre[0]; if (lead) { const q = pos(lead.x, lead.y); tx = q.x; ty = q.y; } }
    const px = cam.x, py = cam.y;
    cam.x += (tx - cam.x) * Math.min(1, dtReal * 3); cam.y += (ty - cam.y) * Math.min(1, dtReal * 3);
    if (dtReal > 0) { cam.vx += ((cam.x - px) / dtReal - cam.vx) * 0.1; cam.vy += ((cam.y - py) / dtReal - cam.vy) * 0.1; }
  }
  world.scale.set(cam.zoom); world.position.set(viewW / 2 - cam.x * cam.zoom, viewH / 2 - cam.y * cam.zoom);

  // tuiles visibles (2 nouvelles max par image ; tout au démarrage)
  const hw = viewW / 2 / cam.zoom, hh = viewH / 2 / cam.zoom;
  const tx0 = Math.floor((cam.x - hw) / TILE), tx1 = Math.floor((cam.x + hw) / TILE), ty0 = Math.floor((cam.y - hh) / TILE), ty1 = Math.floor((cam.y + hh) / TILE);
  let budget = frames < 4 ? 99 : 2;
  const wanted: [number, number, number][] = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) wanted.push([tx, ty, Math.hypot(tx + 0.5 - cam.x / TILE, ty + 0.5 - cam.y / TILE)]);
  wanted.sort((a, b) => a[2] - b[2]);
  for (const [tx, ty] of wanted) { if (budget <= 0) break; if (ensureTile(tx, ty)) budget--; }
  for (const [k, s] of tiles) { const [a, b] = k.split(',').map(Number) as [number, number]; if (a < tx0 - 2 || a > tx1 + 2 || b < ty0 - 2 || b > ty1 + 2) { s.texture.destroy(true); s.destroy(); tiles.delete(k); } }

  // anneau du coureur sélectionné
  const sv = views[selected]!; ring.clear();
  if (sv && sv.sprite.visible) ring.circle(sv.sprite.x, sv.sprite.y, 46).stroke({ color: 0xffffff, width: 3, alpha: 0.9 }).circle(sv.sprite.x, sv.sprite.y, 49).stroke({ color: 0x111111, width: 1.5, alpha: 0.5 });

  // vent : des traînées d'air emportées à la vitesse du vent dans le monde, vues depuis la caméra qui suit le groupe
  wind.clear();
  const vx = (W.vent.wx * PX_PER_M - cam.vx) * cam.zoom * (paused ? 0 : 1), vy = (W.vent.wy * PX_PER_M - cam.vy) * cam.zoom * (paused ? 0 : 1);
  const mode = W.cfg.ventMode === 'face';
  const g = W.groupe.ordre[0]; const h = g ? W.road.heading(g.x) : 0;
  const dirx = mode ? -Math.cos(h) : vx, diry = mode ? -Math.sin(h) : vy;
  const spd = mode ? (W.cfg.vent * PX_PER_M + Math.hypot(cam.vx, cam.vy)) * cam.zoom : 1;
  const m = Math.hypot(dirx, diry) || 1, ux = dirx / m, uy = diry / m;
  for (const s of streaks) {
    const k = mode ? spd * 0.35 : 0.35 * Math.min(Math.hypot(vx, vy), 900);
    s.x += (ux * k * s.s * dtReal * Math.min(effectiveScale(), 3)) / viewW; s.y += (uy * k * s.s * dtReal * Math.min(effectiveScale(), 3)) / viewH;
    if (s.x < -0.1 || s.x > 1.1 || s.y < -0.1 || s.y > 1.1) { s.x = Math.random(); s.y = Math.random(); }
    const px0 = s.x * viewW, py0 = s.y * viewH;
    wind.moveTo(px0, py0).lineTo(px0 - ux * s.l, py0 - uy * s.l).stroke({ color: 0xffffff, width: 1.5, alpha: 0.16 });
  }
  hudT += dtReal;
  if (hudT > 0.2) { hudT = 0; updateHud(W); updateRiders(W, selected); updateStrip(W); updateTrace(W, selected); updateMini(W, live.length ? { x: cam.x, y: cam.y } : null); }
});

/* ------------------------- commandes ------------------------- */
function setSpeed(v: number) {
  paused = v === 0; if (v > 0) timeScale = v;
  document.querySelectorAll<HTMLElement>('#controls button[data-sp]').forEach((b) => b.classList.toggle('on', Number(b.dataset.sp) === (paused ? 0 : timeScale)));
}
document.querySelectorAll<HTMLElement>('#controls button[data-sp]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.sp))));
document.getElementById('auto')!.addEventListener('change', (e) => { auto = (e.target as HTMLInputElement).checked; });
const nextSeed = () => newWorld(Math.floor(Math.random() * 90000) + 1000);
const nextBiome = () => { biome = BIOME_KEYS[(BIOME_KEYS.indexOf(biome) + 1) % BIOME_KEYS.length]!; newWorld(seed); };
const toggleVent = () => { ventMode = ventMode === 'fixe' ? 'face' : 'fixe'; newWorld(seed); };
const toggleRoute = () => { route = route === 'courbes' ? 'droite' : 'courbes'; newWorld(seed); };
document.getElementById('bNew')!.onclick = nextSeed;
document.getElementById('bBiome')!.onclick = nextBiome;
document.getElementById('bVent')!.onclick = toggleVent;
document.getElementById('bRoute')!.onclick = toggleRoute;
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === ' ') { setSpeed(paused ? timeScale : 0); e.preventDefault(); }
  else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(4); else if (e.key === '3') setSpeed(16); else if (e.key === '4') setSpeed(64);
  else if (e.key === 'n' || e.key === 'N') nextSeed(); else if (e.key === 'b' || e.key === 'B') nextBiome();
  else if (e.key === 'v' || e.key === 'V') toggleVent(); else if (e.key === 'r' || e.key === 'R') toggleRoute();
  else if (e.key === 'Tab') { selected = (selected + 1) % W.riders.length; e.preventDefault(); }
});
stageEl.addEventListener('wheel', (e) => { cam.user = Math.max(0.6, Math.min(1.8, cam.user * (e.deltaY < 0 ? 1.08 : 0.926))); }, { passive: true });
stageEl.addEventListener('pointerdown', (e) => {
  const rect = stageEl.getBoundingClientRect();
  const wx = (e.clientX - rect.left - app.screen.width / 2) / cam.zoom + cam.x, wy = (e.clientY - rect.top - app.screen.height / 2) / cam.zoom + cam.y;
  let best = -1, bd = 60 / Math.max(cam.zoom, 0.5);
  views.forEach((v, i) => { const d = Math.hypot(v.sprite.x - wx, v.sprite.y - wy); if (d < bd && v.sprite.visible) { bd = d; best = i; } });
  if (best >= 0) selected = best;
});

cam.user = Math.max(0.7, Math.min(1.2, app.screen.width / 1800)); cam.zoom = cam.user;
newWorld(seed); setSpeed(1);
(window as unknown as { __pedale: unknown }).__pedale = {
  get world() { return W; }, setSpeed, select: (i: number) => { selected = i; }, newWorld,
  advance: (sec: number) => { for (let i = 0; i < sec / SIM_DT && !over(); i++) { prev = W.riders.map((r) => ({ x: r.x, y: r.y })); pas(W); } handleEvents(); acc = 0; },
  setZoom: (z: number) => { cam.user = z; }, setAuto: (a: boolean) => { auto = a; },
};
