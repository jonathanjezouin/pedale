// Planche de tracés (UF 2.2 / 2.2b, critère visuel) : 4 tracés par type d'étape, seeds fixes, profil d'étape en entrée.
// La route est colorée par classe de pente ; un bandeau de profil est dessiné sous chaque tracé ; en montagne,
// un agrandissement montre la première série de lacets.
// Usage : node tools/planche-trace.mjs [sortie.svg] [longueur_km] [seed_de_depart]
import { writeFileSync } from 'node:fs';
import { genererProfil, genererTrace, analyserTrace, classePente, PARAMETRES_ETAPE, TYPES_ETAPE } from '../packages/sim/src/monde/index.ts';
import { creerAlea } from '../packages/sim/src/moteur/alea.ts';

const sortie = process.argv[2] ?? 'docs/captures/uf-2-2b-planche-traces.svg';
const longueur_m = Number(process.argv[3] ?? 40) * 1000;
const graine0 = Number(process.argv[4] ?? 1);
const NOMS = { plaine: 'Plaine', vallonne: 'Vallonné', montagne: 'Montagne' };
const COULEUR = { faible: '#3d8bd9', moyenne: '#8a8a82', forte: '#d64a2a' };
const L = 420, H = 400, M = 14, COLS = 4, BANDEAU = 56;

function panneau(type, graine, ox, oy) {
  const pr = genererProfil(type, longueur_m, creerAlea(graine + 500_000));
  const tr = genererTrace(type, longueur_m, creerAlea(graine), pr);
  const an = analyserTrace(tr.route.segments, tr.lacets);
  const pts = [];
  for (let s = 0; s <= tr.route.longueur_m; s += 5) { const q = tr.route.point(s); pts.push([q.s_m, q.x_m, q.y_m, classePente(pr.pente(s))]); }
  const xs = pts.map((q) => q[1]), ys = pts.map((q) => q[2]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const avecZoom = tr.lacets.length > 0; // l'agrandissement des lacets occupe le haut du cadre : le tracé passe dessous
  const haut = avecZoom ? 172 : 52;
  const zone = { x: M, y: haut, l: L - 2 * M, h: H - haut - BANDEAU - 34 };
  const k = Math.min(zone.l / (x1 - x0 || 1), zone.h / (y1 - y0 || 1));
  const cx = zone.x + (zone.l - (x1 - x0) * k) / 2, cy = zone.y + (zone.h - (y1 - y0) * k) / 2;
  const X = (x) => (cx + (x - x0) * k).toFixed(1), Y = (y) => (cy + (y1 - y) * k).toFixed(1);
  const trace = (liste, X, Y) => `M${liste.map((q) => `${X(q[1])},${Y(q[2])}`).join('L')}`;
  let svg = `<g transform="translate(${ox},${oy})"><rect width="${L}" height="${H}" rx="8" class="cadre"/>`;
  svg += `<text x="${M}" y="24" class="titre">${NOMS[type]} · seed ${graine}</text>`;
  svg += `<text x="${M}" y="42" class="sous">${(tr.route.longueur_m / 1000).toFixed(0)} km · droites ${(an.partDroite_ratio * 100).toFixed(0)} % · ${an.viragesParKm.toFixed(1)} virages/km · angle ${(an.angleMoyen_rad * 180 / Math.PI).toFixed(0)}° · ${tr.lacets.length} lacets</text>`;
  // route : tronçons consécutifs de même classe de pente
  let debut = 0;
  for (let i = 1; i <= pts.length; i++) {
    if (i === pts.length || pts[i][3] !== pts[debut][3]) {
      const seg = pts.slice(debut, Math.min(i + 1, pts.length));
      if (seg.length > 1) svg += `<path d="${trace(seg, X, Y)}" stroke="${COULEUR[pts[debut][3]]}" class="route"/>`;
      debut = i;
    }
  }
  for (const z of tr.lacets) {
    const seg = pts.filter((q) => q[0] >= z.debut_m && q[0] <= z.fin_m);
    if (seg.length > 1) svg += `<path d="${trace(seg, X, Y)}" class="lacet"/>`;
  }
  svg += `<circle cx="${X(pts[0][1])}" cy="${Y(pts[0][2])}" r="4" class="depart"/>`;
  const e = pts[pts.length - 1];
  svg += `<rect x="${(+X(e[1]) - 3.5).toFixed(1)}" y="${(+Y(e[2]) - 3.5).toFixed(1)}" width="7" height="7" class="arrivee"/>`;
  const pasEchelle = (x1 - x0) > 20000 ? 5000 : 1000;
  svg += `<line x1="${M}" y1="${H - BANDEAU - 22}" x2="${(M + pasEchelle * k).toFixed(1)}" y2="${H - BANDEAU - 22}" class="echelle"/><text x="${(M + pasEchelle * k + 6).toFixed(1)}" y="${H - BANDEAU - 18}" class="sous">${pasEchelle / 1000} km</text>`;

  // agrandissement de la première série de lacets (montagne)
  if (tr.lacets.length > 0) {
    const z = tr.lacets[0];
    const loc = pts.filter((q) => q[0] >= z.debut_m - 250 && q[0] <= z.fin_m + 250);
    const lx = loc.map((q) => q[1]), ly = loc.map((q) => q[2]);
    const [a0, a1, b0, b1] = [Math.min(...lx), Math.max(...lx), Math.min(...ly), Math.max(...ly)];
    const w = 150, h = 112, kk = Math.min((w - 12) / (a1 - a0 || 1), (h - 22) / (b1 - b0 || 1));
    const ix = L - M - w, iy = 52;
    const XX = (x) => (ix + 6 + (x - a0) * kk).toFixed(1), YY = (y) => (iy + 6 + (b1 - y) * kk).toFixed(1);
    svg += `<g><rect x="${ix}" y="${iy}" width="${w}" height="${h}" rx="4" class="inset"/>`;
    let d0 = 0;
    for (let i = 1; i <= loc.length; i++) {
      if (i === loc.length || loc[i][3] !== loc[d0][3]) {
        const seg = loc.slice(d0, Math.min(i + 1, loc.length));
        if (seg.length > 1) svg += `<path d="${trace(seg, XX, YY)}" stroke="${COULEUR[loc[d0][3]]}" class="route"/>`;
        d0 = i;
      }
    }
    svg += `<text x="${ix + 6}" y="${iy + h - 6}" class="sous">zoom : lacets (${((z.fin_m - z.debut_m) / 1000).toFixed(1)} km)</text></g>`;
  }

  // bandeau de profil : altitude, lacets en noir
  const by = H - BANDEAU - 8, bh = BANDEAU - 6;
  const zs = []; for (let s = 0; s <= pr.longueur_m; s += pr.longueur_m / 300) zs.push([s, pr.altitude(s)]);
  const zmin = Math.min(...zs.map((q) => q[1])), zmax = Math.max(...zs.map((q) => q[1])), et = Math.max(zmax - zmin, 80);
  const BX = (s) => (M + (s / pr.longueur_m) * (L - 2 * M)).toFixed(1), BY = (z) => (by + bh - ((z - zmin) / et) * (bh - 6)).toFixed(1);
  for (const q of tr.lacets) svg += `<rect x="${BX(q.debut_m)}" y="${by}" width="${Math.max(2, (q.fin_m - q.debut_m) / pr.longueur_m * (L - 2 * M)).toFixed(1)}" height="${bh}" class="zonelacet"/>`;
  svg += `<path d="M${zs.map((q) => `${BX(q[0])},${BY(q[1])}`).join('L')}" class="profil"/>`;
  svg += `<text x="${M}" y="${H - 4}" class="axe">profil : ${zmin.toFixed(0)} à ${zmax.toFixed(0)} m · rouge = pente forte, gris = moyenne, bleu = faible</text>`;
  return svg + '</g>';
}

let corps = '';
TYPES_ETAPE.forEach((type, r) => {
  for (let c = 0; c < COLS; c++) corps += panneau(type, graine0 + c, M + c * (L + M), M + r * (H + M));
});
const W = M + COLS * (L + M), HT = M + 3 * (H + M) + 34;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HT}" font-family="system-ui, sans-serif">
<style>
.fond{fill:#f7f7f4}.cadre{fill:#fff;stroke:#d8d8d0}.inset{fill:#fbfbf8;stroke:#c9c9c0}.titre{font-size:15px;font-weight:600;fill:#222}.sous{font-size:11px;fill:#666}.axe{font-size:10px;fill:#888}
.route{fill:none;stroke-width:1.9;stroke-linejoin:round}.lacet{fill:none;stroke:#111;stroke-width:3;opacity:.55}
.depart{fill:#2a9d4a}.arrivee{fill:#222}.echelle{stroke:#222;stroke-width:2}.profil{fill:none;stroke:#333;stroke-width:1.3}.zonelacet{fill:#111;opacity:.18}
</style><rect class="fond" width="${W}" height="${HT}"/>${corps}
<g transform="translate(${M},${HT - 14})"><line x1="0" y1="-4" x2="26" y2="-4" stroke="${COULEUR.faible}" class="route"/><text x="32" y="0" class="sous">pente faible (&lt; 3 %)</text>
<line x1="150" y1="-4" x2="176" y2="-4" stroke="${COULEUR.moyenne}" class="route"/><text x="182" y="0" class="sous">moyenne (3 à 7 %)</text>
<line x1="300" y1="-4" x2="326" y2="-4" stroke="${COULEUR.forte}" class="route"/><text x="332" y="0" class="sous">forte (&gt; 7 %)</text>
<line x1="430" y1="-4" x2="456" y2="-4" class="lacet"/><text x="462" y="0" class="sous">lacets</text>
<circle cx="530" cy="-4" r="4" class="depart"/><text x="540" y="0" class="sous">départ</text><rect x="590" y="-8" width="7" height="7" class="arrivee"/><text x="603" y="0" class="sous">arrivée</text>
<text x="670" y="0" class="sous">Chaque tracé est à sa propre échelle. Étapes de ${longueur_m / 1000} km.</text></g></svg>`;
writeFileSync(sortie, svg);
console.log(sortie, W, 'x', HT);
