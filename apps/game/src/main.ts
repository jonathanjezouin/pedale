import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { creerMonde, pas } from '@pedale/sim';
import type { World } from '@pedale/sim';
import { BIOMES, BIOME_KEYS, CHUNK_H, CHUNK_W, PX_PER_M, drawChunk } from './scenery';
import type { BiomeKey } from './scenery';
import { FRAMES, buildRiderTextures, PALETTES } from './riders';
import { INTENT_COLOR, buildRiders, hideEnd, pushFeed, showEnd, updateHud, updateRiders, updateStrip, updateTrace } from './ui';

const SIM_DT = 0.25;
const over = () => (W.result.statut as string) === 'termine';
const TAU = Math.PI * 2;
const qs = new URLSearchParams(location.search);
let seed = Number(qs.get('seed') ?? 20260);
let biome: BiomeKey = (BIOME_KEYS as string[]).includes(qs.get('biome') ?? '') ? (qs.get('biome') as BiomeKey) : 'prairie';

const stageEl = document.getElementById('stage')!;
const app = new Application();
await app.init({ resizeTo: stageEl, background: BIOMES[biome].base, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
stageEl.appendChild(app.canvas);

/* ------------------------- scène ------------------------- */
const world = new Container(); app.stage.addChild(world);
const chunkLayer = new Container(); const ridersLayer = new Container(); const overlay = new Container();
world.addChild(chunkLayer, ridersLayer, overlay);
const wind = new Graphics(); app.stage.addChild(wind);
const ring = new Graphics(); overlay.addChild(ring);
const Q = Math.min(window.devicePixelRatio || 1, 1.5);

interface RiderView { sprite: Sprite; tex: Texture[]; label: Text; dot: Graphics; phase: number; vy: number }
let W: World; let views: RiderView[] = [];
let prev: { x: number; y: number }[] = [];
let acc = 0, timeScale = 1, paused = false, selected = 0, eventPtr = 0, ended = false, auto = true;
const cam = { x: 0, y: 0, zoom: 1, user: 1 };
const chunks = new Map<number, Sprite>();

function sceneOpts() { return { seed, biome, finishPx: W.finishX * PX_PER_M }; }
function clearChunks() { for (const s of chunks.values()) { s.texture.destroy(true); s.destroy(); } chunks.clear(); }
function ensureChunk(k: number): boolean {
  if (chunks.has(k)) return false;
  const cv = document.createElement('canvas'); cv.width = Math.round(CHUNK_W * Q); cv.height = Math.round(CHUNK_H * Q);
  drawChunk(cv.getContext('2d')!, k, sceneOpts(), Q);
  const s = new Sprite(Texture.from(cv)); s.x = k * CHUNK_W; s.y = -CHUNK_H / 2; s.scale.set(1 / Q);
  chunkLayer.addChild(s); chunks.set(k, s); return true;
}

function setupRiders() {
  for (const v of views) { v.sprite.destroy(); v.label.destroy(); v.dot.destroy(); }
  views = W.riders.map((r) => {
    const tex = buildRiderTextures(r.id);
    const sprite = new Sprite(tex[0]!); sprite.anchor.set(0.5); sprite.scale.set(0.5); ridersLayer.addChild(sprite);
    const dot = new Graphics(); overlay.addChild(dot);
    const label = new Text({ text: r.letter, style: { fontFamily: 'Trebuchet MS, system-ui, sans-serif', fontSize: 15, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x111111, width: 4 } } });
    label.anchor.set(0.5); overlay.addChild(label);
    return { sprite, tex, label, dot, phase: Math.random() * TAU, vy: 0 };
  });
}

function newWorld(s: number) {
  seed = s; W = creerMonde({ seed, trace: 'changements' });
  prev = W.riders.map((r) => ({ x: r.x, y: r.y })); acc = 0; eventPtr = 0; ended = false; hideEnd();
  document.getElementById('feed')!.innerHTML = '';
  clearChunks(); setupRiders();
  app.renderer.background.color = BIOMES[biome].base; document.body.style.background = BIOMES[biome].base;
  document.getElementById('biomeName')!.textContent = BIOMES[biome].label;
  buildRiders(W, (id) => { selected = id; });
  cam.x = W.groupe.xMoyen * PX_PER_M; cam.y = 0;
  const url = new URL(location.href); url.searchParams.set('seed', String(seed)); url.searchParams.set('biome', biome); history.replaceState(null, '', url);
  for (let i = 0; i < 2; i++) pas(W);          // premières décisions
  eventPtr = 0;
}

/* ------------------------- boucle ------------------------- */
const streaks = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), l: 30 + Math.random() * 70, s: 0.6 + Math.random() * 0.8 }));
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
    raisons: d.raisons, percu: d.percu.moi && { reserve: d.percu.moi.reserve, explosivite: d.percu.moi.explosivite, ecart: d.percu.course.ecart, vitesseGroupe: d.percu.groupe.vitesse }, reel: d.reel, action: d.action }));
  const blob = new Blob([JSON.stringify({ seed, config: W.cfg, resultat: W.result, evenements: W.events, trace: slim }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pedale-trace-${seed}.json`; a.click();
}

app.ticker.add((tk) => {
  const now = performance.now(), dtReal = Math.min(0.1, (now - lastNow) / 1000); lastNow = now; frames++;
  if (!paused && !over()) {
    acc += dtReal * effectiveScale();
    let guard = 0;
    while (acc >= SIM_DT && guard++ < 600 && !over()) { prev = W.riders.map((r) => ({ x: r.x, y: r.y })); pas(W); acc -= SIM_DT; }
    if (guard >= 600) acc = 0;
    handleEvents();
  }
  const alpha = paused || over() ? 1 : Math.min(1, acc / SIM_DT);
  // positions interpolées
  let cx = 0, n = 0;
  W.riders.forEach((r, i) => {
    const p = prev[i]!, v = views[i]!;
    const x = (p.x + (r.x - p.x) * alpha), y = (p.y + (r.y - p.y) * alpha);
    const px = x * PX_PER_M, py = y * PX_PER_M;
    const lat = (r.y - p.y) / SIM_DT; v.vy += (lat - v.vy) * 0.2;
    v.sprite.position.set(px, py); v.sprite.rotation = Math.atan2(v.vy, Math.max(r.v, 2)) * 1.6;
    v.phase += r.v * dtReal * (paused ? 0 : Math.min(effectiveScale(), 3)) * 0.032 * 2;
    v.sprite.texture = v.tex[Math.floor(((v.phase % TAU) / TAU) * FRAMES) % FRAMES]!;
    v.sprite.visible = r.status === 'course' || r.status === 'arrive';
    v.label.position.set(px - 2, py - 48); v.label.visible = v.sprite.visible; v.label.alpha = r.status === 'arrive' ? 0.5 : 1;
    const pal = PALETTES[r.id % PALETTES.length]!;
    v.dot.clear();
    if (r.intent.kind && v.sprite.visible) v.dot.circle(px + 14, py - 48, 5.5).fill(parseInt(INTENT_COLOR[r.intent.kind].slice(1), 16)).stroke({ color: 0x111111, width: 1.5 });
    void pal;
    if (r.status === 'course') { cx += px; n++; }
  });
  // caméra : suit le groupe, dézoome (niveaux de détail) quand l'échappée s'étire, se recentre sur la tête si c'est trop étiré
  const viewW = app.screen.width, viewH = app.screen.height;
  const live = views.map((v, i) => ({ v, r: W.riders[i]! })).filter((o) => o.r.status === 'course');
  if (live.length) {
    const xs = live.map((o) => o.v.sprite.x), xMax = Math.max(...xs), xMin = Math.min(...xs), spread = Math.max(xMax - xMin, 1);
    const targetZoom = Math.max(0.45, Math.min(cam.user, (viewW * 0.72) / spread));
    cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dtReal * 2.5);
    const fits = spread * cam.zoom < viewW * 0.74;
    const tx = fits ? (xMax + xMin) / 2 + 80 : xMax - (viewW * 0.30) / cam.zoom;
    cam.x += (tx - cam.x) * Math.min(1, dtReal * 3);
  }
  void cx; void n;
  world.scale.set(cam.zoom); world.position.set(viewW / 2 - cam.x * cam.zoom, viewH / 2 - cam.y * cam.zoom);
  const half = viewW / 2 / cam.zoom, kMin = Math.floor((cam.x - half) / CHUNK_W) - 1, kMax = Math.floor((cam.x + half) / CHUNK_W) + 1;
  let budget = frames < 4 ? 99 : 2;
  for (let k = kMin; k <= kMax && budget > 0; k++) if (k >= -1 && ensureChunk(k)) budget--;
  for (const [k, s] of chunks) if (k < kMin - 3 || k > kMax + 3) { s.texture.destroy(true); s.destroy(); chunks.delete(k); }
  // anneau du coureur sélectionné
  const sv = views[selected]!; ring.clear();
  if (sv && sv.sprite.visible) ring.circle(sv.sprite.x, sv.sprite.y, 44).stroke({ color: 0xffffff, width: 3, alpha: 0.9 }).circle(sv.sprite.x, sv.sprite.y, 47).stroke({ color: 0x111111, width: 1.5, alpha: 0.5 });
  // vent de face : traînées qui filent vers l'arrière
  wind.clear();
  const camSpeed = W.groupe.vitesse * PX_PER_M * cam.zoom, windPx = W.cfg.vent * PX_PER_M * cam.zoom;
  for (const s of streaks) {
    s.x -= ((camSpeed * 0.0 + windPx * 1.3) * s.s * dtReal * (paused ? 0 : Math.min(effectiveScale(), 3))) / viewW;
    if (s.x < -0.1) { s.x = 1.05; s.y = Math.random(); }
    wind.moveTo(s.x * viewW, s.y * viewH).lineTo(s.x * viewW + s.l, s.y * viewH).stroke({ color: 0xffffff, width: 1.5, alpha: 0.18 });
  }
  hudT += dtReal;
  if (hudT > 0.2) { hudT = 0; updateHud(W); updateRiders(W, selected); updateStrip(W); updateTrace(W, selected); }
  void tk;
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
document.getElementById('bNew')!.onclick = nextSeed;
document.getElementById('bBiome')!.onclick = nextBiome;
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === ' ') { setSpeed(paused ? timeScale : 0); e.preventDefault(); }
  else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(4); else if (e.key === '3') setSpeed(16); else if (e.key === '4') setSpeed(64);
  else if (e.key === 'n' || e.key === 'N') nextSeed(); else if (e.key === 'b' || e.key === 'B') nextBiome();
  else if (e.key === 'Tab') { selected = (selected + 1) % W.riders.length; e.preventDefault(); }
});
stageEl.addEventListener('wheel', (e) => { cam.user = Math.max(0.6, Math.min(1.8, cam.user * (e.deltaY < 0 ? 1.08 : 0.926))); }, { passive: true });
stageEl.addEventListener('pointerdown', (e) => {
  const rect = stageEl.getBoundingClientRect();
  const wx = (e.clientX - rect.left - app.screen.width / 2) / cam.zoom + cam.x, wy = (e.clientY - rect.top - app.screen.height / 2) / cam.zoom + cam.y;
  let best = -1, bd = 60;
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
