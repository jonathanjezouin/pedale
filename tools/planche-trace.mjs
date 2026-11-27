// Planche de tracés (UF 2.2, critère visuel) : 4 tracés par type d'étape, tirés avec des seeds fixes.
// Usage : node tools/planche-trace.mjs [sortie.svg] [longueur_km] [seed_de_depart]
import { writeFileSync } from 'node:fs';
import { genererTrace, analyserTrace, PARAMETRES_ETAPE, TYPES_ETAPE } from '../packages/sim/src/monde/index.ts';
import { creerAlea } from '../packages/sim/src/moteur/alea.ts';

const sortie = process.argv[2] ?? 'docs/captures/uf-2-2-planche-traces.svg';
const longueur_m = Number(process.argv[3] ?? 40) * 1000;
const graine0 = Number(process.argv[4] ?? 1);
const NOMS = { plaine: 'Plaine', vallonne: 'Vallonné', montagne: 'Montagne' };
const L = 420, H = 330, M = 14, COLS = 4;

function panneau(type, graine, ox, oy) {
  const tr = genererTrace(type, longueur_m, creerAlea(graine));
  const an = analyserTrace(tr.route.segments, tr.lacets);
  const p = PARAMETRES_ETAPE[type];
  const pts = [];
  for (let s = 0; s <= tr.route.longueur_m; s += 5) { const q = tr.route.point(s); pts.push([q.s_m, q.x_m, q.y_m]); }
  const xs = pts.map((q) => q[1]), ys = pts.map((q) => q[2]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zone = { x: M, y: 52, l: L - 2 * M, h: H - 52 - 30 };
  const k = Math.min(zone.l / (x1 - x0 || 1), zone.h / (y1 - y0 || 1));
  const cx = zone.x + (zone.l - (x1 - x0) * k) / 2, cy = zone.y + (zone.h - (y1 - y0) * k) / 2;
  const X = (x) => (cx + (x - x0) * k).toFixed(1), Y = (y) => (cy + (y1 - y) * k).toFixed(1);
  const chemin = (a, b) => {
    const seg = pts.filter((q) => q[0] >= a && q[0] <= b);
    return seg.length > 1 ? `M${seg.map((q) => `${X(q[1])},${Y(q[2])}`).join('L')}` : '';
  };
  let svg = `<g transform="translate(${ox},${oy})"><rect width="${L}" height="${H}" rx="8" class="cadre"/>`;
  svg += `<text x="${M}" y="24" class="titre">${NOMS[type]} · seed ${graine}</text>`;
  svg += `<text x="${M}" y="42" class="sous">${(tr.route.longueur_m / 1000).toFixed(0)} km · droites ${(an.partDroite_ratio * 100).toFixed(0)} % · ${an.viragesParKm.toFixed(1)} virages/km · angle moyen ${(an.angleMoyen_rad * 180 / Math.PI).toFixed(0)}°</text>`;
  svg += `<path d="${chemin(0, tr.route.longueur_m)}" class="route"/>`;
  // droites longues en bleu, lacets en rouge
  for (const d of an.droites.filter((d) => d.longueur_m >= p.droiteLongueMin_m)) svg += `<path d="${chemin(d.debut_m, d.debut_m + d.longueur_m)}" class="droite"/>`;
  for (const z of tr.lacets) svg += `<path d="${chemin(z.debut_m, z.fin_m)}" class="lacet"/>`;
  svg += `<circle cx="${X(pts[0][1])}" cy="${Y(pts[0][2])}" r="4" class="depart"/>`;
  const e = pts[pts.length - 1];
  svg += `<rect x="${(+X(e[1]) - 3.5).toFixed(1)}" y="${(+Y(e[2]) - 3.5).toFixed(1)}" width="7" height="7" class="arrivee"/>`;
  // échelle : 1 km ou 5 km selon la taille du tracé
  const pasEchelle = (x1 - x0) > 20000 ? 5000 : 1000;
  svg += `<line x1="${M}" y1="${H - 14}" x2="${(M + pasEchelle * k).toFixed(1)}" y2="${H - 14}" class="echelle"/><text x="${(M + pasEchelle * k + 6).toFixed(1)}" y="${H - 10}" class="sous">${pasEchelle / 1000} km</text>`;
  return svg + '</g>';
}

let corps = '';
TYPES_ETAPE.forEach((type, r) => {
  for (let c = 0; c < COLS; c++) corps += panneau(type, graine0 + c, M + c * (L + M), M + r * (H + M));
});
const W = M + COLS * (L + M), HT = M + 3 * (H + M) + 34;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HT}" font-family="system-ui, sans-serif">
<style>
.fond{fill:#f7f7f4}.cadre{fill:#fff;stroke:#d8d8d0}.titre{font-size:15px;font-weight:600;fill:#222}.sous{font-size:11px;fill:#666}
.route{fill:none;stroke:#555;stroke-width:1.8;stroke-linejoin:round}.droite{fill:none;stroke:#1f6fd1;stroke-width:3.2;stroke-linecap:round}
.lacet{fill:none;stroke:#d64a2a;stroke-width:3.2}.depart{fill:#2a9d4a}.arrivee{fill:#222}.echelle{stroke:#222;stroke-width:2}
</style><rect class="fond" width="${W}" height="${HT}"/>${corps}
<g transform="translate(${M},${HT - 14})"><line x1="0" y1="-4" x2="26" y2="-4" class="route"/><text x="32" y="0" class="sous">route</text>
<line x1="90" y1="-4" x2="116" y2="-4" class="droite"/><text x="122" y="0" class="sous">droite longue (≥ seuil du type)</text>
<line x1="310" y1="-4" x2="336" y2="-4" class="lacet"/><text x="342" y="0" class="sous">lacets</text>
<circle cx="410" cy="-4" r="4" class="depart"/><text x="420" y="0" class="sous">départ</text><rect x="470" y="-8" width="7" height="7" class="arrivee"/><text x="483" y="0" class="sous">arrivée</text>
<text x="560" y="0" class="sous">Chaque tracé est à sa propre échelle (barre d'échelle en bas de chaque cadre). Étapes de ${longueur_m / 1000} km.</text></g></svg>`;
writeFileSync(sortie, svg);
console.log(sortie, W, 'x', HT);
