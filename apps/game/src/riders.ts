/* Coureur vu de dessus : roues, cadre, guidon, jambes qui pédalent, torse, bras, casque, ombre.
   12 poses de pédalage pré-rendues par coureur (canvas 2D → textures PixiJS). */
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
export const RIDER_PX = { w: 180, h: 100 };     // taille d'une frame
export const SCALE = 2.2;                       // échelle du dessin (≈ 1,9 m de vélo à 40 px/m)

function ell(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }

export function drawRiderFrame(c: CanvasRenderingContext2D, T: Palette, skin: string, phase: number): void {
  c.clearRect(0, 0, RIDER_PX.w, RIDER_PX.h);
  const cx = RIDER_PX.w / 2, cy = RIDER_PX.h / 2;
  // ombre (soleil en haut à gauche → ombre en bas à droite)
  c.save(); c.translate(cx + 7, cy + 9); c.scale(SCALE, SCALE); c.fillStyle = 'rgba(20,20,25,.26)'; c.beginPath(); c.ellipse(0, 0, 21, 6.2, 0, 0, TAU); c.fill(); c.restore();
  c.save(); c.translate(cx, cy); c.scale(SCALE, SCALE);
  for (const wx of [-12.5, 12.5]) { ell(c, wx, 0, 7.6, 1.9, '#141418'); ell(c, wx, 0, 6.2, 0.8, '#6a6d78'); }
  c.lineCap = 'round'; c.strokeStyle = T.b; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-12.5, 0); c.lineTo(10, 0); c.stroke();
  c.strokeStyle = '#141418'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(8.6, -4.6); c.lineTo(8.6, 4.6); c.stroke();
  for (const sgn of [-1, 1]) {
    const co = Math.cos(phase + (sgn > 0 ? Math.PI : 0)), lx = -2.5 + co * 4.2;
    ell(c, lx, sgn * 3.1, 5.8, 2.5, T.s); ell(c, lx + 4.4 + co * 1.5, sgn * 3.1, 2.6, 1.4, '#f1f1ee');
  }
  c.lineWidth = 2.6; c.strokeStyle = T.j;
  for (const sgn of [-1, 1]) { c.beginPath(); c.moveTo(4.5, sgn * 5.6); c.lineTo(8.4, sgn * 4.2); c.stroke(); }
  c.fillStyle = T.j; c.beginPath(); c.ellipse(1, 0, 8.4, 5.3, 0, 0, TAU); c.fill();
  c.save(); c.beginPath(); c.ellipse(1, 0, 8.4, 5.3, 0, 0, TAU); c.clip();
  c.fillStyle = T.a; c.fillRect(-0.2, -6, 2.8, 12); c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(-9, -6, 4, 12); c.restore();
  ell(c, 4.6, 0, 3, 7.3, T.j); ell(c, 4.8, -0.8, 1.6, 4.6, 'rgba(255,255,255,.14)');
  ell(c, 8.8, 0, 4.9, 3.9, T.h);
  c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1; c.beginPath(); c.moveTo(6.2, -2.6); c.lineTo(11.6, -1); c.moveTo(6.2, 2.6); c.lineTo(11.6, 1); c.stroke();
  ell(c, 11.8, 0, 1.3, 1.9, skin);
  c.restore();
}

export function buildRiderTextures(id: number): Texture[] {
  const pal = PALETTES[id % PALETTES.length]!, skin = SKIN[id % SKIN.length]!;
  const out: Texture[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const cv = document.createElement('canvas'); cv.width = RIDER_PX.w * 2; cv.height = RIDER_PX.h * 2;
    const c = cv.getContext('2d')!; c.scale(2, 2);   // 2× pour rester net au zoom
    drawRiderFrame(c, pal, skin, (f / FRAMES) * TAU);
    out.push(Texture.from(cv));
  }
  return out;
}
