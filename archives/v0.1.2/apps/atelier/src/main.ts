/* Atelier de parcours : distance, type, seed → profil altimétrique, tracé en plan, évaluation.
   Sert à régler les fourchettes du générateur sans lancer de course (docs/v0.0.4-parcours.md §5). */
import { LIBELLE_CATEGORIE, LIBELLE_FINALE, LIBELLE_TYPE, TYPES, evaluer, genererParcours } from '@pedale/parcours';
import type { Evaluation, Finale, Parcours, TypeEtape } from '@pedale/parcours';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const fr0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const km = (m: number, d = 1) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(m / 1000)} km`;
const heure = (s: number) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

/* ------------------------------ état ------------------------------ */
const qs = new URLSearchParams(location.search);
const FINALES: (Finale | 'auto')[] = ['auto', 'plat', 'bosse', 'descente', 'sommet'];
const etat = {
  distance: Math.min(250, Math.max(20, Number(qs.get('km') ?? 120))),
  type: (TYPES as readonly string[]).includes(qs.get('type') ?? '') ? (qs.get('type') as TypeEtape) : ('montagne' as TypeEtape),
  finale: (FINALES as string[]).includes(qs.get('finale') ?? '') ? (qs.get('finale') as Finale | 'auto') : ('auto' as Finale | 'auto'),
  seed: Math.max(1, Math.floor(Number(qs.get('seed') ?? 7))),
  depuis: 0,
};
let parcours: Parcours, evaluation: Evaluation, survol: number | null = null;

/* ------------------------------ couleurs ------------------------------ */
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
/** Pente (%) → couleur : vert à plat, jaune, orange, rouge, bordeaux ; la descente en bleu. */
function couleurPente(p: number): string {
  if (p < -1) return p < -6 ? '#3b6ea5' : '#6fa8dc';
  if (p < 1.5) return '#8fb996';
  if (p < 3.5) return '#c9d27a';
  if (p < 6) return '#f2c14e';
  if (p < 9) return '#ec8b3c';
  if (p < 12) return '#d64933';
  return '#8b1e3f';
}
const COULEUR_CAT: Record<string, string> = { HC: '#8b1e3f', '1': '#d64933', '2': '#ec8b3c', '3': '#c9a227', '4': '#7d8b4a', bosse: '#8a8f98' };
$('legende').innerHTML = [['descente', '#6fa8dc'], ['plat', '#8fb996'], ['3-6 %', '#f2c14e'], ['6-9 %', '#ec8b3c'], ['9-12 %', '#d64933'], ['> 12 %', '#8b1e3f']]
  .map(([t, c]) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};margin-right:4px"></i>${t}</span>`).join(' &nbsp; ');

/* ------------------------------ canvas ------------------------------ */
function preparer(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}
const pasNice = (plage: number, cibles: number) => { const brut = plage / cibles, e = Math.pow(10, Math.floor(Math.log10(brut))); const f = brut / e; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e; };

/** Pente lissée (%) de chaque pas, sur ~200 m. */
function pentes(p: Parcours): Float64Array {
  const n = p.n, s = new Float64Array(n), k = 5;
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - k), b = Math.min(n - 1, i + k); s[i] = ((p.alt[b]! - p.alt[a]!) / ((b - a) * p.pas)) * 100; }
  return s;
}
let pente: Float64Array;

const M = { g: 54, d: 14, h: 26, b: 28 };
function geomProfil(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect();
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < parcours.n; i++) { const v = parcours.alt[i]!; if (v < min) min = v; if (v > max) max = v; }
  const marge = Math.max(30, (max - min) * 0.08); min = Math.floor((min - marge) / 50) * 50; max = Math.ceil((max + marge) / 50) * 50;
  const W = r.width - M.g - M.d, H = r.height - M.h - M.b;
  return { W, H, min, max, x: (d: number) => M.g + (d / parcours.distance) * W, y: (a: number) => M.h + H - ((a - min) / (max - min)) * H, d: (px: number) => ((px - M.g) / W) * parcours.distance };
}

function dessinerProfil() {
  const c = $<HTMLCanvasElement>('profil'), g = preparer(c), G = geomProfil(c), r = c.getBoundingClientRect();
  const texte = css('--doux'), trait = css('--trait');
  g.clearRect(0, 0, r.width, r.height);
  g.font = '11px system-ui, sans-serif'; g.fillStyle = texte; g.strokeStyle = trait; g.lineWidth = 1;
  // grille
  const pa = pasNice(G.max - G.min, 5);
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let a = Math.ceil(G.min / pa) * pa; a <= G.max; a += pa) { const y = G.y(a); g.beginPath(); g.moveTo(M.g, y); g.lineTo(M.g + G.W, y); g.stroke(); g.fillText(`${fr0.format(a)} m`, M.g - 6, y); }
  const pk = pasNice(parcours.distance / 1000, 8) * 1000;
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let d = 0; d <= parcours.distance; d += pk) { const x = G.x(d); g.beginPath(); g.moveTo(x, M.h); g.lineTo(x, M.h + G.H); g.stroke(); g.fillText(`${d / 1000}`, x, M.h + G.H + 6); }
  g.textAlign = 'right'; g.fillText('km', r.width - 2, M.h + G.H + 14);
  // remplissage coloré par la pente : une colonne par pixel
  const base = G.y(G.min);
  for (let px = 0; px < G.W; px++) {
    const i = Math.min(parcours.n - 1, Math.round(((px / G.W) * parcours.distance) / parcours.pas));
    g.fillStyle = couleurPente(pente[i]!); g.globalAlpha = 0.9;
    const y = G.y(parcours.alt[i]!); g.fillRect(M.g + px, y, 1.2, base - y);
  }
  g.globalAlpha = 1;
  g.beginPath(); g.strokeStyle = css('--texte'); g.lineWidth = 1.3;
  for (let px = 0; px <= G.W; px++) { const i = Math.min(parcours.n - 1, Math.round(((px / G.W) * parcours.distance) / parcours.pas)); const y = G.y(parcours.alt[i]!); px ? g.lineTo(M.g + px, y) : g.moveTo(M.g + px, y); }
  g.stroke();
  // reste de l'étape évalué depuis un point : on grise ce qui est derrière
  if (etat.depuis > 0) { const x = G.x(etat.depuis * 1000); g.fillStyle = css('--carte'); g.globalAlpha = 0.6; g.fillRect(M.g, M.h, x - M.g, G.H); g.globalAlpha = 1; g.strokeStyle = css('--accent'); g.lineWidth = 2; g.beginPath(); g.moveTo(x, M.h - 4); g.lineTo(x, M.h + G.H); g.stroke(); }
  // montées lues : bandeau au-dessus du profil, étiquette pour celles qui sont classées
  g.textBaseline = 'alphabetic'; g.textAlign = 'center'; g.font = '600 10px system-ui, sans-serif';
  for (const m of evaluation.montees) {
    const x0 = G.x(m.debut), x1 = G.x(m.fin), col = COULEUR_CAT[m.categorie]!;
    g.fillStyle = col; g.globalAlpha = m.categorie === 'bosse' ? 0.35 : 0.9; g.fillRect(x0, M.h - 8, Math.max(2, x1 - x0), 4); g.globalAlpha = 1;
    if (m.categorie !== 'bosse' && x1 - x0 > 14) { g.fillStyle = col; g.fillText(m.categorie, (x0 + x1) / 2, M.h - 11); }
  }
  // départ / arrivée
  g.fillStyle = css('--texte'); g.font = '12px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText('A', M.g + 2, M.h + 12); g.textAlign = 'right'; g.fillText('🏁', M.g + G.W - 2, M.h + 14);
  // survol
  if (survol !== null) {
    const x = G.x(survol), i = Math.round(survol / parcours.pas);
    g.strokeStyle = css('--accent'); g.lineWidth = 1; g.beginPath(); g.moveTo(x, M.h); g.lineTo(x, M.h + G.H); g.stroke();
    g.fillStyle = css('--accent'); g.beginPath(); g.arc(x, G.y(parcours.alt[i]!), 4, 0, 6.3); g.fill();
    const t = `km ${fr.format(survol / 1000)} · ${fr0.format(parcours.alt[i]!)} m · ${fr.format(pente[i]!)} % · à ${fr.format((parcours.distance - survol) / 1000)} km de l'arrivée`;
    g.font = '12px system-ui, sans-serif'; const w = g.measureText(t).width + 14, tx = Math.min(Math.max(M.g, x - w / 2), M.g + G.W - w);
    g.fillStyle = css('--carte'); g.strokeStyle = css('--accent'); g.lineWidth = 1; g.beginPath(); g.roundRect(tx, M.h + 4, w, 22, 6); g.fill(); g.stroke();
    g.fillStyle = css('--texte'); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(t, tx + 7, M.h + 15);
  }
}

function dessinerTrace() {
  const c = $<HTMLCanvasElement>('trace'), g = preparer(c), r = c.getBoundingClientRect();
  g.clearRect(0, 0, r.width, r.height);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < parcours.n; i++) { x0 = Math.min(x0, parcours.x[i]!); x1 = Math.max(x1, parcours.x[i]!); y0 = Math.min(y0, parcours.y[i]!); y1 = Math.max(y1, parcours.y[i]!); }
  const pad = 26, ech = Math.min((r.width - 2 * pad) / Math.max(1, x1 - x0), (r.height - 2 * pad) / Math.max(1, y1 - y0));
  const ox = (r.width - (x1 - x0) * ech) / 2 - x0 * ech, oy = (r.height - (y1 - y0) * ech) / 2 - y0 * ech;
  const X = (i: number) => ox + parcours.x[i]! * ech, Y = (i: number) => oy + parcours.y[i]! * ech;
  g.lineCap = 'round'; g.lineJoin = 'round';
  // fond de route sombre puis ruban coloré par la pente
  g.strokeStyle = css('--trait'); g.lineWidth = 7; g.beginPath(); for (let i = 0; i < parcours.n; i++) i ? g.lineTo(X(i), Y(i)) : g.moveTo(X(i), Y(i)); g.stroke();
  g.lineWidth = 4;
  let i = 0;
  while (i < parcours.n - 1) {
    const col = couleurPente(pente[i]!); let j = i + 1;
    while (j < parcours.n - 1 && couleurPente(pente[j]!) === col) j++;
    g.strokeStyle = col; g.beginPath(); g.moveTo(X(i), Y(i)); for (let k = i + 1; k <= j; k++) g.lineTo(X(k), Y(k)); g.stroke(); i = j;
  }
  // repères kilométriques
  g.font = '10px system-ui, sans-serif'; g.fillStyle = css('--doux'); g.textAlign = 'center'; g.textBaseline = 'middle';
  const pk = pasNice(parcours.distance / 1000, 6);
  for (let d = pk; d < parcours.distance / 1000; d += pk) { const k = Math.round((d * 1000) / parcours.pas); g.beginPath(); g.arc(X(k), Y(k), 2.2, 0, 6.3); g.fill(); g.fillText(`${d}`, X(k), Y(k) - 9); }
  // départ et arrivée
  const point = (k: number, txt: string, col: string) => { g.fillStyle = col; g.beginPath(); g.arc(X(k), Y(k), 8, 0, 6.3); g.fill(); g.fillStyle = '#fff'; g.font = '600 11px system-ui, sans-serif'; g.fillText(txt, X(k), Y(k) + 0.5); };
  point(0, 'A', '#2f8f5b'); point(parcours.n - 1, 'B', '#23262b');
  // échelle
  const e = pasNice(Math.max(1, (x1 - x0) / 5), 2), px = e * ech;
  g.strokeStyle = css('--texte'); g.lineWidth = 2; g.beginPath(); g.moveTo(16, r.height - 16); g.lineTo(16 + px, r.height - 16); g.stroke();
  g.fillStyle = css('--texte'); g.textAlign = 'left'; g.font = '11px system-ui, sans-serif'; g.fillText(e >= 1000 ? `${e / 1000} km` : `${e} m`, 20 + px, r.height - 16);
  // survol
  if (survol !== null) { const k = Math.round(survol / parcours.pas); g.fillStyle = css('--accent'); g.strokeStyle = css('--carte'); g.lineWidth = 2; g.beginPath(); g.arc(X(k), Y(k), 6, 0, 6.3); g.fill(); g.stroke(); }
}

/* ------------------------------ panneau d'évaluation ------------------------------ */
function panneau() {
  const ev = evaluation, p = parcours;
  $('phrase').textContent = ev.phrase;
  const stats: [string, string][] = [
    ['Distance évaluée', km(ev.distance, 0)], ['D+', `${fr0.format(ev.denivele)} m`], ['Densité', `${fr.format(ev.densite)} m/km`],
    ['D+ pondéré', `${fr0.format(ev.denivelePondere)} m`], ['Durée estimée', heure(ev.duree)], ['Lue comme', LIBELLE_TYPE[ev.typeLu]],
  ];
  $('stats').innerHTML = stats.map(([t, v]) => `<div class="stat"><span>${t}</span><b>${v}</b></div>`).join('');
  const f = ev.finale, barre = (t: string, v: number) => `<div class="barre"><span>${t}</span><i><u style="width:${(v * 100).toFixed(0)}%"></u></i><em>${(v * 100).toFixed(0)} %</em></div>`;
  $('finale-barres').innerHTML = barre('Sprinteurs', f.sprint) + barre('Puncheurs', f.puncheur) + barre('Grimpeurs', f.grimpeur) + (f.arriveeEnCote ? '<span class="drapeau">arrivée en côte</span>' : '');
  const lignes = ev.montees.filter((m) => m.categorie !== 'bosse' || m.pente >= 4.5).sort((a, b) => a.debut - b.debut);
  $('montees').innerHTML = lignes.length
    ? `<tr><th>Montée</th><th>Départ</th><th>Longueur</th><th>Pente</th><th>Max 500 m</th><th>D+</th><th>À l'arrivée</th><th>Poids</th></tr>` +
      lignes.map((m) => `<tr><td><b style="color:${COULEUR_CAT[m.categorie]}">${m.categorie === 'bosse' ? 'bosse' : m.categorie === 'HC' ? 'HC' : 'cat. ' + m.categorie}</b></td><td>km ${fr.format(m.debut / 1000)}</td><td>${km(m.longueur)}</td><td>${fr.format(m.pente)} %</td><td>${fr.format(m.penteMax500)} %</td><td>${fr0.format(m.denivele)} m</td><td>${km(m.distanceArrivee, 0)}</td><td><span class="poids"><u style="width:${(m.poids * 100).toFixed(0)}%"></u></span>${m.poids.toFixed(2)}</td></tr>`).join('')
    : '<tr><td class="vide">aucune montée notable</td></tr>';
  const ok = p.conforme;
  $('meta').innerHTML = `<div class="meta">${LIBELLE_FINALE[p.finale]} · ${p.essais === 1 ? 'premier tirage' : p.essais + ' tirages'} · <span class="${ok ? 'ok' : 'alerte'}">${ok ? 'conforme' : 'non conforme'}</span><br>rayon min ${fr0.format(p.rayonMin)} m · ${p.elements.length} élément${p.elements.length > 1 ? 's' : ''} structurant${p.elements.length > 1 ? 's' : ''}</div>`;
}

/* ------------------------------ génération et interactions ------------------------------ */
function maj(regenerer = true) {
  if (regenerer) {
    parcours = genererParcours({ seed: etat.seed, distance: etat.distance * 1000, type: etat.type, finale: etat.finale === 'auto' ? undefined : etat.finale });
    pente = pentes(parcours);
    const max = Math.floor(parcours.distance / 1000) - 1;
    $<HTMLInputElement>('depuis').max = String(max);
    if (etat.depuis > max) etat.depuis = 0;
    const url = new URL(location.href);
    url.search = new URLSearchParams({ km: String(etat.distance), type: etat.type, finale: etat.finale, seed: String(etat.seed) }).toString();
    history.replaceState(null, '', url);
  }
  evaluation = evaluer(parcours, etat.depuis * 1000, parcours.distance);
  $('vDistance').textContent = `${etat.distance} km`;
  $('vDepuis').textContent = `${etat.depuis}`;
  $<HTMLInputElement>('depuis').value = String(etat.depuis);
  document.querySelectorAll<HTMLButtonElement>('#types button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.type === etat.type)));
  panneau(); dessinerProfil(); dessinerTrace();
}

$('types').innerHTML = TYPES.map((t) => `<button type="button" role="radio" data-type="${t}">${LIBELLE_TYPE[t]}</button>`).join('');
$('types').addEventListener('click', (e) => { const t = (e.target as HTMLElement).dataset.type as TypeEtape | undefined; if (t) { etat.type = t; maj(); } });
$('finale').innerHTML = FINALES.map((f) => `<option value="${f}">${f === 'auto' ? 'tirée au hasard selon le type' : LIBELLE_FINALE[f]}</option>`).join('');
const selF = $<HTMLSelectElement>('finale'); selF.value = etat.finale; selF.addEventListener('change', () => { etat.finale = selF.value as Finale | 'auto'; maj(); });
const dist = $<HTMLInputElement>('distance'); dist.value = String(etat.distance); dist.addEventListener('input', () => { etat.distance = Number(dist.value); maj(); });
const seedIn = $<HTMLInputElement>('seed'); seedIn.value = String(etat.seed); seedIn.addEventListener('change', () => { etat.seed = Math.max(1, Math.floor(Number(seedIn.value) || 1)); maj(); });
$('autre').addEventListener('click', () => { etat.seed = Math.floor(Math.random() * 99_999) + 1; seedIn.value = String(etat.seed); maj(); });
$<HTMLInputElement>('depuis').addEventListener('input', (e) => { etat.depuis = Number((e.target as HTMLInputElement).value); maj(false); });

const pc = $<HTMLCanvasElement>('profil');
pc.addEventListener('mousemove', (e) => { const r = pc.getBoundingClientRect(), G = geomProfil(pc); survol = Math.min(parcours.distance, Math.max(0, G.d(e.clientX - r.left))); dessinerProfil(); dessinerTrace(); });
pc.addEventListener('mouseleave', () => { survol = null; dessinerProfil(); dessinerTrace(); });
pc.addEventListener('click', (e) => { const r = pc.getBoundingClientRect(), G = geomProfil(pc); etat.depuis = Math.min(Number($<HTMLInputElement>('depuis').max), Math.max(0, Math.round(G.d(e.clientX - r.left) / 1000))); maj(false); });
new ResizeObserver(() => { if (parcours) { dessinerProfil(); dessinerTrace(); } }).observe(document.body);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => maj(false));
maj();
