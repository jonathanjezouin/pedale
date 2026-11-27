/* Menu de parcours (docs/v0.0.6-menu.md §1) : type, distance, finale, seed, décor → aperçu → « Partir ». */
import { LIBELLE_CATEGORIE, LIBELLE_FINALE, LIBELLE_TYPE, TYPES, evaluerParcours, genererParcours } from '@pedale/parcours';
import type { Finale, Parcours, TypeEtape } from '@pedale/parcours';
import { BIOMES, BIOME_KEYS } from './scenery';
import type { BiomeKey } from './scenery';

export type ChoixType = TypeEtape | 'poc';
export type ChoixFinale = Finale | 'auto';
export type ChoixDecor = BiomeKey | 'auto';
export interface Choix { type: ChoixType; km: number; finale: ChoixFinale; seed: number; decor: ChoixDecor }

export const FINALES_MENU: ChoixFinale[] = ['auto', 'plat', 'bosse', 'descente', 'sommet'];
/** Décor automatique : il suit le type d'étape. */
export const DECOR_AUTO: Record<ChoixType, BiomeKey> = { poc: 'prairie', plate: 'prairie', vallonnee: 'automne', montagne: 'montagne' };

const $ = (id: string) => document.getElementById(id)!;
const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const heure = (s: number) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

export function genererChoix(c: Choix): Parcours | null {
  return c.type === 'poc' ? null : genererParcours({ seed: c.seed, distance: c.km * 1000, type: c.type, ...(c.finale !== 'auto' ? { finale: c.finale } : {}) });
}

/** Aperçu : profil coloré par la pente, tracé en plan, montées classées, phrase de l'évaluateur. */
function apercu(c: Choix): string {
  const p = genererChoix(c);
  if (!p) return '<p class="muted">Fin d\'étape plate du POC : huit coureurs sur 16 à 24 km, départ lancé. Pas de profil.</p>';
  const ev = evaluerParcours(p);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < p.n; i++) { mn = Math.min(mn, p.alt[i]!); mx = Math.max(mx, p.alt[i]!); }
  const pas = Math.max(1, Math.floor(p.n / 300)); let d = 'M0,100';
  for (let i = 0; i < p.n; i += pas) d += ` L${((i / (p.n - 1)) * 100).toFixed(2)},${(100 - ((p.alt[i]! - mn) / Math.max(1, mx - mn)) * 90 - 4).toFixed(1)}`;
  d += ' L100,100 Z';
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.n; i++) { x0 = Math.min(x0, p.x[i]!); x1 = Math.max(x1, p.x[i]!); y0 = Math.min(y0, p.y[i]!); y1 = Math.max(y1, p.y[i]!); }
  const k = 92 / Math.max(1, x1 - x0, y1 - y0), step = Math.max(1, Math.floor(p.n / 200));
  let t = '';
  for (let i = 0; i < p.n; i += step) t += `${i ? 'L' : 'M'}${(4 + (p.x[i]! - x0) * k).toFixed(1)},${(4 + (p.y[i]! - y0) * k).toFixed(1)} `;
  const montees = ev.montees.slice().sort((a, b) => b.score - a.score).slice(0, 4)
    .map((m) => `<li>km ${fr.format(m.debut / 1000)} · ${fr.format(m.longueur / 1000)} km à ${fr.format(m.pente)} % · ${LIBELLE_CATEGORIE[m.categorie]}</li>`).join('');
  return `<div class="mprev"><svg viewBox="0 0 100 100" preserveAspectRatio="none" class="mprof"><path d="${d}"/></svg>
    <svg viewBox="0 0 100 100" class="mtrace"><path d="${t}"/></svg></div>
    <p><b>${fr.format(p.distance / 1000)} km</b> · D+ ${Math.round(p.denivele)} m · ${LIBELLE_FINALE[p.finale]} · environ ${heure(ev.duree)}</p>
    <p class="muted">${ev.phrase}</p>${montees ? `<ul>${montees}</ul>` : ''}`;
}

/** Ouvre le menu sur le choix courant ; `partir` reçoit le choix validé. */
export function ouvrirMenu(initial: Choix, partir: (c: Choix) => void, fermer?: () => void) {
  const box = $('menu'), c: Choix = { ...initial };
  const rend = () => {
    box.innerHTML = `<div class="mbox"><h2>Choisir une étape</h2>
      <div class="mgrid">
        <div>
          <label>Type</label>
          <div class="seg" id="mType">${(['poc', ...TYPES] as ChoixType[]).map((t) => `<button data-v="${t}" class="${c.type === t ? 'on' : ''}">${t === 'poc' ? 'Plat (POC)' : LIBELLE_TYPE[t]}</button>`).join('')}</div>
          <label>Distance : <b id="mKmV">${c.km} km</b></label>
          <input type="range" id="mKm" min="20" max="250" step="5" value="${c.km}" ${c.type === 'poc' ? 'disabled' : ''}>
          <label>Finale</label>
          <div class="seg" id="mFin">${FINALES_MENU.map((f) => `<button data-v="${f}" class="${c.finale === f ? 'on' : ''}" ${c.type === 'poc' ? 'disabled' : ''}>${f === 'auto' ? 'Selon le type' : LIBELLE_FINALE[f].replace('arrivée ', '')}</button>`).join('')}</div>
          <label>Seed</label>
          <div class="row"><input type="number" id="mSeed" min="1" max="999999" value="${c.seed}"><button id="mDe">🎲</button></div>
          <label>Décor</label>
          <div class="seg" id="mDec">${(['auto', ...BIOME_KEYS] as ChoixDecor[]).map((b) => `<button data-v="${b}" class="${c.decor === b ? 'on' : ''}">${b === 'auto' ? 'Auto' : BIOMES[b].label}</button>`).join('')}</div>
        </div>
        <div id="mApercu">${apercu(c)}</div>
      </div>
      <div class="btns"><button id="mGo" class="go">Partir</button>${fermer ? '<button id="mClose">Annuler</button>' : ''}</div></div>`;
    box.hidden = false;
    const seg = (id: string, f: (v: string) => void) => $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { f(b.dataset.v!); rend(); }));
    seg('mType', (v) => { c.type = v as ChoixType; }); seg('mFin', (v) => { c.finale = v as ChoixFinale; }); seg('mDec', (v) => { c.decor = v as ChoixDecor; });
    const km = $('mKm') as HTMLInputElement, seed = $('mSeed') as HTMLInputElement;
    km.addEventListener('input', () => { c.km = Number(km.value); $('mKmV').textContent = `${c.km} km`; });
    km.addEventListener('change', () => { $('mApercu').innerHTML = apercu(c); });
    seed.addEventListener('change', () => { c.seed = Math.max(1, Math.floor(Number(seed.value) || 1)); rend(); });
    $('mDe').onclick = () => { c.seed = Math.floor(Math.random() * 90000) + 1000; rend(); };
    $('mGo').onclick = () => { box.hidden = true; partir({ ...c }); };
    if (fermer) $('mClose').onclick = () => { box.hidden = true; fermer(); };
  };
  rend();
}
export const menuOuvert = () => !$('menu').hidden;
export const fermerMenu = () => { $('menu').hidden = true; };
