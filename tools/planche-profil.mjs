// Planche de profils d'étape (UF 2.3, critère visuel) : 4 profils par type, seeds fixes, tronçons colorés.
// Usage : node tools/planche-profil.mjs [sortie.svg] [longueur_km] [seed_de_depart]
import { writeFileSync } from 'node:fs';
import { genererProfil, PARAMETRES_PROFIL, TYPES_ETAPE } from '../packages/sim/src/monde/index.ts';
import { creerAlea } from '../packages/sim/src/moteur/alea.ts';

const sortie = process.argv[2] ?? 'docs/captures/uf-2-3-planche-profils.svg';
const longueur_m = Number(process.argv[3] ?? 100) * 1000;
const graine0 = Number(process.argv[4] ?? 1);
const NOMS = { plaine: 'Plaine', vallonne: 'Vallonné', montagne: 'Montagne' };
const COULEURS = { plat: '#c9d1c0', bosse: '#e9c46a', col: '#d64a2a', descente: '#5b8def' };
const L = 860, H = 180, M = 14, COLS = 2;

function panneau(type, graine, ox, oy) {
  const pr = genererProfil(type, longueur_m, creerAlea(graine));
  const par = PARAMETRES_PROFIL[type];
  const n = 600;
  const zs = Array.from({ length: n + 1 }, (_, i) => pr.altitude((i / n) * pr.longueur_m));
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  // Même échelle verticale par type pour pouvoir comparer : hauteur affichée = au moins 600 m (plaine, vallonné) ou 1500 m.
  const etendue = Math.max(zmax - zmin, type === 'montagne' ? 1500 : type === 'vallonne' ? 500 : 150);
  const z0 = zmin - (etendue - (zmax - zmin)) / 2;
  const zone = { x: 46, y: 40, l: L - 46 - M, h: H - 40 - 26 };
  const X = (s) => zone.x + (s / pr.longueur_m) * zone.l;
  const Y = (z) => zone.y + zone.h - ((z - z0) / etendue) * zone.h;
  let svg = `<g transform="translate(${ox},${oy})"><rect width="${L}" height="${H}" rx="8" class="cadre"/>`;
  const dplus = pr.denivelePositif_m;
  svg += `<text x="${M}" y="22" class="titre">${NOMS[type]} · seed ${graine}</text>`;
  svg += `<text x="${M + 190}" y="22" class="sous">${pr.longueur_m / 1000} km · D+ ${dplus.toFixed(0)} m (${(dplus / (pr.longueur_m / 1000)).toFixed(0)} m/km) · altitude ${zmin.toFixed(0)} à ${zmax.toFixed(0)} m</text>`;
  for (const t of pr.troncons) {
    const pts = [];
    for (let s = t.debut_m; s <= t.fin_m; s += Math.max(20, pr.longueur_m / 1500)) pts.push([s, pr.altitude(s)]);
    pts.push([t.fin_m, pr.altitude(t.fin_m)]);
    const d = `M${X(t.debut_m).toFixed(1)},${(zone.y + zone.h).toFixed(1)}L${pts.map(([s, z]) => `${X(s).toFixed(1)},${Y(z).toFixed(1)}`).join('L')}L${X(t.fin_m).toFixed(1)},${(zone.y + zone.h).toFixed(1)}Z`;
    svg += `<path d="${d}" fill="${COULEURS[t.type]}" fill-opacity="0.85"/>`;
  }
  const ligne = zs.map((z, i) => `${X((i / n) * pr.longueur_m).toFixed(1)},${Y(z).toFixed(1)}`).join('L');
  svg += `<path d="M${ligne}" class="ligne"/>`;
  // axes : altitude à gauche, km en bas
  for (const z of [Math.ceil(z0 / 100) * 100, Math.ceil((z0 + etendue / 2) / 100) * 100]) svg += `<text x="${zone.x - 6}" y="${(Y(z) + 4).toFixed(1)}" class="axe" text-anchor="end">${z} m</text><line x1="${zone.x}" x2="${zone.x + zone.l}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" class="grille"/>`;
  for (let km = 0; km <= pr.longueur_m / 1000; km += 20) svg += `<text x="${X(km * 1000).toFixed(1)}" y="${H - 8}" class="axe" text-anchor="middle">${km} km</text>`;
  return svg + '</g>';
}

let corps = '';
TYPES_ETAPE.forEach((type, r) => {
  for (let c = 0; c < COLS; c++) for (let l = 0; l < 2; l++) {
    corps += panneau(type, graine0 + c * 2 + l, M + c * (L + M), M + (r * 2 + l) * (H + M));
  }
});
const W = M + COLS * (L + M), HT = M + 6 * (H + M) + 30;
const leg = Object.entries(COULEURS).map(([k, c], i) => `<rect x="${i * 110}" y="-10" width="14" height="10" fill="${c}"/><text x="${i * 110 + 20}" y="0" class="sous">${k}</text>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HT}" font-family="system-ui, sans-serif">
<style>.fond{fill:#f7f7f4}.cadre{fill:#fff;stroke:#d8d8d0}.titre{font-size:14px;font-weight:600;fill:#222}.sous{font-size:11px;fill:#666}.axe{font-size:10px;fill:#888}.grille{stroke:#e6e6e0;stroke-width:1}.ligne{fill:none;stroke:#333;stroke-width:1.4;stroke-linejoin:round}</style>
<rect class="fond" width="${W}" height="${HT}"/>${corps}<g transform="translate(${M},${HT - 12})">${leg}<text x="470" y="0" class="sous">Échelle verticale propre à chaque type (la même pour les quatre profils d'un type).</text></g></svg>`;
writeFileSync(sortie, svg);
console.log(sortie, W, 'x', HT);
