/* Cycliste vu de dessus, dessiné en mètres (proportions réelles) puis rendu en textures PixiJS.
   Vélo 1,75 m ; épaules 0,43 m ; casque 0,32 m. Quatre postures : les signes visibles de l'effort. */
import { Texture } from 'pixi.js';

export interface Palette { j: string; a: string; s: string; h: string; b: string }
export const PALETTES: Palette[] = [
  { j: '#e63946', a: '#ffffff', s: '#1b1b1f', h: '#ffffff', b: '#c42d38' },
  { j: '#2a6fdb', a: '#f4c20d', s: '#14202e', h: '#f4c20d', b: '#1d4fa0' },
  { j: '#2fa84f', a: '#ffffff', s: '#1b1b1f', h: '#ffffff', b: '#1f7a37' },
  { j: '#f4c20d', a: '#1b1b1f', s: '#1b1b1f', h: '#1b1b1f', b: '#b89200' },
  { j: '#ff6fae', a: '#ffffff', s: '#4a1f35', h: '#ffffff', b: '#c24885' },
  { j: '#ff7a1a', a: '#1d4fa0', s: '#1b1b1f', h: '#ffffff', b: '#b85200' },
  { j: '#f2f2f2', a: '#e63946', s: '#2a2a30', h: '#e63946', b: '#9a9aa2' },
  { j: '#7b4bd6', a: '#f4c20d', s: '#26143f', h: '#f4c20d', b: '#53309a' },
];
const SKIN = ['#f1c9a5', '#d9a67c', '#a56e49', '#7a4a2e'];
const TAU = Math.PI * 2;
export const FRAMES = 12;
export const TEX_PPM = 80;                        // pixels de texture par mètre (affichée à 0,5 → 40 px/m)
const CW = 232, CH = 120;                         // 2,9 m × 1,5 m

/** Paramètres de chaque posture (x vers l'avant, en m ; y latéral). */
interface Pose { hipX: number; shX: number; shHalf: number; headX: number; headL: number; handX: number; handY: number; elbX: number; elbY: number; lowBack: number }
const POSES: Pose[] = [
  { hipX: -0.27, shX: 0.20, shHalf: 0.215, headX: 0.42, headL: 0.31, handX: 0.43, handY: 0.19, elbX: 0.31, elbY: 0.27, lowBack: 0 },     // 0 sur les cocottes
  { hipX: -0.27, shX: 0.29, shHalf: 0.205, headX: 0.55, headL: 0.36, handX: 0.47, handY: 0.20, elbX: 0.37, elbY: 0.23, lowBack: 0 },     // 1 en bas du cintre
  { hipX: -0.06, shX: 0.22, shHalf: 0.225, headX: 0.37, headL: 0.31, handX: 0.44, handY: 0.21, elbX: 0.31, elbY: 0.34, lowBack: 0 },     // 2 en danseuse
  { hipX: -0.27, shX: 0.15, shHalf: 0.225, headX: 0.30, headL: 0.36, handX: 0.42, handY: 0.19, elbX: 0.29, elbY: 0.29, lowBack: 1 },     // 3 écrasé de fatigue
];

function line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, col: string) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function ell(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string, rot = 0) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill(); }

export function drawRiderFrame(c: CanvasRenderingContext2D, T: Palette, skin: string, phase: number, pose: number): void {
  const P = POSES[pose]!;
  c.clearRect(0, 0, CW, CH);
  const ox = CW / 2, oy = CH / 2;
  // ombre portée (soleil en haut à gauche)
  c.save(); c.translate(ox + 0.17 * TEX_PPM, oy + 0.22 * TEX_PPM); c.scale(TEX_PPM, TEX_PPM);
  ell(c, 0, 0, 0.88, 0.3, 'rgba(20,20,25,.27)'); c.restore();

  c.save(); c.translate(ox, oy); c.scale(TEX_PPM, TEX_PPM);
  // --- vélo : roues (pneu fin), cadre, cintre
  for (const wx of [-0.52, 0.52]) { ell(c, wx, 0, 0.34, 0.036, '#131317'); ell(c, wx, 0, 0.29, 0.012, '#7c8090'); }
  line(c, -0.52, 0, -0.06, 0, 0.045, T.b); line(c, -0.06, 0, 0.36, 0, 0.04, T.b); line(c, 0.36, 0, 0.52, 0, 0.03, '#2a2a30');
  line(c, 0.40, -0.215, 0.40, 0.215, 0.028, '#18181c');                                                     // cintre
  line(c, 0.36, 0, 0.40, 0, 0.04, '#18181c');                                                                // potence
  // --- jambes (pédalage alterné) : hanche → genou → pied
  const bbX = -0.02, R = 0.17;
  for (const side of [-1, 1]) {
    const ph = phase + (side > 0 ? Math.PI : 0), foot = bbX + R * Math.cos(ph);
    const hx = P.hipX, hy = side * 0.10, fy = side * 0.115;
    const kx = (hx + foot) / 2 + 0.13 + 0.05 * Math.sin(ph), ky = side * (0.155 + 0.02 * Math.sin(ph));
    line(c, hx, hy, kx, ky, 0.165, T.s);                                                                     // cuisse (cuissard)
    line(c, kx, ky, foot, fy, 0.105, skin);                                                                  // jambe
    line(c, kx + (foot - kx) * 0.55, ky + (fy - ky) * 0.55, foot, fy, 0.11, '#f2f2f0');                       // chaussette
    ell(c, foot + 0.045, fy, 0.085, 0.045, '#1d1d22');                                                       // chaussure
  }
  // --- torse (maillot) : bassin étroit → épaules
  const sway = 0;
  c.fillStyle = T.j; c.beginPath();
  c.moveTo(P.hipX - 0.05, -0.14 + sway); c.quadraticCurveTo(P.hipX + 0.18, -0.17, P.shX - 0.04, -P.shHalf);
  c.quadraticCurveTo(P.shX + 0.10, -P.shHalf * 0.8, P.shX + 0.09, 0); c.quadraticCurveTo(P.shX + 0.10, P.shHalf * 0.8, P.shX - 0.04, P.shHalf);
  c.quadraticCurveTo(P.hipX + 0.18, 0.17, P.hipX - 0.05, 0.14 + sway); c.quadraticCurveTo(P.hipX - 0.12, 0, P.hipX - 0.05, -0.14 + sway); c.fill();
  c.save(); c.clip();
  c.fillStyle = T.a; c.fillRect(P.hipX + (P.shX - P.hipX) * 0.5, -0.3, 0.07, 0.6);                           // bande
  c.fillStyle = 'rgba(0,0,0,.13)'; c.fillRect(P.hipX - 0.1, -0.3, 0.12, 0.6);                               // ombre du bassin
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(P.hipX + 0.1, -0.02, P.shX - P.hipX - 0.05, 0.04);      // arête du dos
  c.restore();
  for (const sy of [-0.07, 0, 0.07]) ell(c, P.hipX + 0.04, sy, 0.035, 0.028, 'rgba(0,0,0,.22)');           // poches dorsales
  // --- bras : épaule → coude → main (manches courtes)
  for (const side of [-1, 1]) {
    const sx = P.shX, sy = side * (P.shHalf - 0.02);
    line(c, sx, sy, P.elbX, side * P.elbY, 0.095, T.j);                                                       // bras (manche)
    line(c, P.elbX, side * P.elbY, P.handX, side * P.handY, 0.075, skin);                                     // avant-bras
    ell(c, P.handX + 0.01, side * P.handY, 0.05, 0.04, '#1d1d22');                                            // gant
  }
  // --- tête : casque allongé + lunettes
  ell(c, P.headX, 0, P.headL / 2, 0.11, T.h);
  c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 0.012; c.beginPath(); for (const v of [-0.05, 0, 0.05]) { c.moveTo(P.headX - P.headL * 0.35, v); c.lineTo(P.headX + P.headL * 0.3, v * 1.2); } c.stroke();
  ell(c, P.headX + P.headL / 2 - 0.035, 0, 0.04, 0.075, 'rgba(20,20,25,.8)');                              // lunettes
  if (P.lowBack) ell(c, P.headX - 0.02, 0, P.headL / 2 + 0.01, 0.115, 'rgba(0,0,0,.10)');                  // tête basse : le casque « s'écrase »
  c.restore();
}

const cache = new Map<string, Texture>();
/** Texture (mise en cache) d'un coureur pour une posture et une phase de pédalage. */
export function riderTexture(id: number, pose: number, frame: number): Texture {
  const key = `${id}|${pose}|${frame}`, hit = cache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  drawRiderFrame(cv.getContext('2d')!, PALETTES[id % PALETTES.length]!, SKIN[id % SKIN.length]!, (frame / FRAMES) * TAU, pose);
  const t = Texture.from(cv); cache.set(key, t); return t;
}
export const clearRiderTextures = () => { for (const t of cache.values()) t.destroy(true); cache.clear(); };
