/* Interface HTML : fil de course, liste des coureurs, explication « pourquoi ? », fin de course. */
import { ARCHETYPE_LABEL, INTENTION_LABEL, expliquer, resumeEvaluations } from '@pedale/sim';
import type { Intention, Rider, SimEvent, World } from '@pedale/sim';
import { PALETTES } from './riders';

export const INTENT_COLOR: Record<Intention, string> = {
  relais: '#e4572e', abriter: '#2a6fdb', rabattre: '#8e6bd1', attaquer: '#d62839', suivre: '#e49a2e', gerer: '#7a7f87', revenir: '#1aa39a',
};
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export const fmtT = (s: number) => `${Math.floor(s / 60)}'${String(Math.floor(s % 60)).padStart(2, '0')}"`;
export const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.max(0, Math.round(m))} m`);

/* ---------------- HUD ---------------- */
export function updateHud(w: World) {
  const g = w.groupe;
  const reste = Math.max(0, w.finishX - (g.ordre.length ? Math.max(...g.ordre.map((r) => r.x)) : w.finishX));
  $('sKm').textContent = fmtKm(reste);
  $('sGap').textContent = (w.ecart >= 0 ? '+' : '−') + fmtT(Math.abs(w.ecart)) + (w.tendance < -3 ? ' ▼' : w.tendance > 3 ? ' ▲' : '');
  $('sGapBox').classList.toggle('warn', w.ecart < 40);
  $('sSpd').textContent = `${(g.vitesse * 3.6).toFixed(1)} km/h`;
  $('sWind').textContent = `${w.cfg.vent.toFixed(1)} m/s`;
  $('sT').textContent = fmtT(w.t);
}

/* ---------------- liste des coureurs ---------------- */
let rowsBuilt = false;
export function buildRiders(w: World, onSelect: (id: number) => void) {
  const el = $('riders');
  el.innerHTML = `<h2><span>Les 8 de l'échappée</span><span class="legend"><i style="background:#2f8f4e"></i>réserve<i style="background:#e49a2e"></i>explosivité</span></h2>` +
    w.riders.map((r) => {
      const pal = PALETTES[r.id % PALETTES.length]!;
      return `<div class="rider" data-id="${r.id}"><span class="badge" style="background:${pal.j};color:${isLight(pal.j) ? '#111' : '#fff'}">${r.letter}</span>
        <div><div class="l1"><b>${cap(ARCHETYPE_LABEL[r.archetype])}</b><span class="chip" data-f="chip"></span></div>
        <div class="bars"><i class="e"><b data-f="e"></b></i><i class="x"><b data-f="x"></b></i></div></div>
        <div class="num"><b data-f="v"></b><br><span data-f="p"></span></div></div>`;
    }).join('');
  el.querySelectorAll<HTMLElement>('.rider').forEach((n) => n.addEventListener('click', () => onSelect(Number(n.dataset.id))));
  rowsBuilt = true;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function isLight(hex: string) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; }

export function updateRiders(w: World, sel: number) {
  if (!rowsBuilt) return;
  document.querySelectorAll<HTMLElement>('#riders .rider').forEach((row) => {
    const r = w.riders[Number(row.dataset.id)]!;
    row.classList.toggle('sel', r.id === sel);
    row.classList.toggle('out', r.status !== 'course');
    const f = (k: string) => row.querySelector<HTMLElement>(`[data-f="${k}"]`)!;
    const chip = f('chip');
    if (r.status === 'arrive') { chip.textContent = 'Arrivé'; chip.style.setProperty('--c', '#2f8f4e'); }
    else if (r.status === 'repris') { chip.textContent = 'Repris'; chip.style.setProperty('--c', '#555'); }
    else if (r.intent.kind) { chip.textContent = r.intent.sprint ? 'Sprint' : INTENTION_LABEL[r.intent.kind]; chip.style.setProperty('--c', INTENT_COLOR[r.intent.kind]); }
    f('e').style.width = `${Math.round(r.E * 100)}%`; f('x').style.width = `${Math.round(r.X * 100)}%`;
    f('v').textContent = `${(r.v * 3.6).toFixed(0)} km/h`; f('p').textContent = `${Math.round(r.p)} W`;
  });
}

/* ---------------- explication d'un coureur ---------------- */
let showAlt = false;
export const toggleAlt = () => { showAlt = !showAlt; };
export function updateTrace(w: World, id: number) {
  const r = w.riders[id]!, d = r.last, el = $('trace');
  if (!d) { el.innerHTML = '<div class="muted">En attente de la première décision…</div>'; return; }
  const p = d.percu, it = d.interprete;
  const pills = [
    `réserve ${Math.round(p.moi.reserve * 100)} %`, `explosivité ${Math.round(p.moi.explosivite * 100)} %`,
    `groupe à ${(p.groupe.vitesse * 3.6).toFixed(0)} km/h`, `écart ${Math.round(p.course.ecart)} s (${p.course.tendance >= 0 ? '+' : '−'}${Math.abs(Math.round(p.course.tendance))} s/30 s)`,
    p.moi.dansGroupe ? (p.moi.estEnTete ? 'en tête' : `${p.moi.rang + 1}e de la file${p.moi.abrite > 0.12 ? ', abrité' : ''}`) : 'lâché',
    ...(p.groupe.devantLetter ? [`${p.groupe.devantLetter} devant moi`] : []),
    ...(p.groupe.attaque ? [`${p.groupe.attaque.letter} attaque`] : []),
  ];
  const max = Math.max(3, ...d.raisons.map((q) => Math.abs(q.valeur)));
  const why = d.raisons.map((q) => `<div class="why"><span class="v ${q.valeur >= 0 ? 'p' : 'n'}">${q.valeur >= 0 ? '+' : '−'}${Math.abs(q.valeur).toFixed(1)}</span><span class="t">${q.texte}<div class="bar ${q.valeur >= 0 ? 'p' : 'n'}" style="width:${Math.round((Math.abs(q.valeur) / max) * 100)}%"></div></span></div>`).join('') || '<div class="muted">aucune raison marquante</div>';
  const ev = resumeEvaluations(d.evaluations);
  const alt = ev.map((e) => `<div class="alt ${e.vetos.length ? 'veto' : ''}"><span class="chip" style="--c:${INTENT_COLOR[e.intention]}">${e.label}</span><span>${e.vetos.length ? 'impossible : ' + e.vetos[0] : e.raisons.slice().sort((a, b) => Math.abs(b.valeur) - Math.abs(a.valeur)).slice(0, 2).map((q) => `${q.valeur >= 0 ? '+' : '−'}${Math.abs(q.valeur).toFixed(1)} ${q.texte.toLowerCase()}`).join(' ; ') || '—'}</span><span class="sc">${e.vetos.length ? '✕' : e.score.toFixed(1)}</span></div>`).join('');
  const sprint = r.intent.sprint ? ' (sprint)' : '';
  el.innerHTML = `
    <h2><span>Pourquoi ?</span><span class="muted">décision de ${fmtT(d.t)} · ${d.declencheur}</span></h2>
    <div class="who">Coureur ${r.letter}, ${ARCHETYPE_LABEL[r.archetype]}</div>
    <div class="muted">à ${fmtKm(d.distRestante)} de l'arrivée · CP ${Math.round(r.profile.cp)} W · pointe ${Math.round(r.profile.pPeak)} W · générosité ${Math.round(r.profile.generosite * 100)} % · agressivité ${Math.round(r.profile.agressivite * 100)} %</div>
    <div class="sec"><b>Perçu</b><div class="pills">${pills.map((t) => `<span>${t}</span>`).join('')}</div>
      <div class="muted">Réel : réserve ${Math.round(d.reel.reserve * 100)} %, écart ${Math.round(d.reel.ecart)} s — perception exacte en v0.0.1 (pas de bruit).</div></div>
    <div class="sec"><b>Interprété</b>${cap(it.phrases.join(', '))}.</div>
    <div class="sec"><b>Intention</b><span class="chip" style="--c:${INTENT_COLOR[d.intention]}">${INTENTION_LABEL[d.intention]}${sprint}</span>
      <span class="muted"> engagée jusqu'à ${d.engagementJusqua === Infinity ? 'la ligne' : fmtT(d.engagementJusqua)}</span>${why}</div>
    <div class="sec"><b>Action</b><div class="quote">« ${cap(d.action)}. »</div></div>
    <div class="sec"><button id="bAlt">${showAlt ? 'Masquer' : 'Voir'} les autres intentions</button>
      <button id="bCopy">Copier la trace</button></div>
    ${showAlt ? `<div class="sec">${alt}</div>` : ''}`;
  document.getElementById('bAlt')!.onclick = () => { toggleAlt(); updateTrace(w, id); };
  document.getElementById('bCopy')!.onclick = () => { void navigator.clipboard?.writeText(expliquer(d)); };
}

/* ---------------- fil de course ---------------- */
export function pushFeed(e: SimEvent) {
  const feed = $('feed');
  const div = document.createElement('div'); div.className = 'card' + (e.grave ? ' grave' : '');
  div.innerHTML = `<time>${fmtT(e.t)}</time>${e.texte}`;
  feed.appendChild(div);
  while (feed.children.length > 6) feed.firstElementChild!.remove();
  setTimeout(() => div.remove(), e.grave ? 14000 : 7000);
}

/* ---------------- bande de progression ---------------- */
export function updateStrip(w: World) {
  const el = $('strip');
  if (!el.querySelector('.track')) el.innerHTML = '<div class="track"><div class="rail"></div><div class="brk" id="brk"></div><div class="pelo" id="pelo"></div><div class="lab l0">départ</div><div class="lab l1" id="stripKm"></div></div><div class="flag">🏁</div>';
  const L = w.finishX, pct = (x: number) => `${Math.max(0, Math.min(1, x / L)) * 100}%`;
  const act = w.riders.filter((r) => r.status === 'course');
  const lead = act.length ? Math.max(...act.map((r) => r.x)) : w.finishX;
  const brk = $('brk'); brk.style.left = pct(lead);
  brk.innerHTML = w.riders.map((r) => r.status === 'repris' ? '' : `<i style="background:${PALETTES[r.id % PALETTES.length]!.j}"></i>`).join('');
  const pelo = $('pelo'); pelo.style.left = pct(w.peloton.x); pelo.textContent = `peloton −${fmtT(Math.max(0, w.ecart))}`;
  $('stripKm').textContent = `${fmtKm(Math.max(0, w.finishX - lead))} à l'arrivée`;
}

/* ---------------- fin de course ---------------- */
export function showEnd(w: World, handlers: { replay: () => void; next: () => void; trace: () => void }) {
  const box = $('end'), res = w.result;
  const ordre = res.ordre.map((id, i) => {
    const r = w.riders[id]!, pal = PALETTES[r.id % PALETTES.length]!, t = r.finishTime ?? 0;
    const first = w.riders[res.ordre[0]!]!.finishTime ?? 0;
    return `<li><b>${i + 1}.</b><span class="badge" style="background:${pal.j};color:${isLight(pal.j) ? '#111' : '#fff'}">${r.letter}</span>${cap(ARCHETYPE_LABEL[r.archetype])} <span class="muted">${i ? '+' + (t - first).toFixed(1) + ' s' : fmtT(t)}</span></li>`;
  }).join('');
  const repris = res.repris.map((id) => `${w.riders[id]!.letter} (${cap(ARCHETYPE_LABEL[w.riders[id]!.archetype])})`).join(', ');
  box.innerHTML = `<div class="box"><h2>${res.echappeeSurvit ? `L'échappée va au bout — victoire de ${w.riders[res.vainqueur!]!.letter}` : 'Le peloton a repris l’échappée'}</h2>
    <div class="sub">${res.echappeeSurvit ? `${res.ordre.length} coureur(s) à l'arrivée en ${fmtT(res.tFin)}, ${res.repris.length} repris.` : `Reprise à ${fmtKm(res.distanceReprise ?? 0)} de l'arrivée.`}</div>
    ${ordre ? `<ol>${ordre}</ol>` : ''}${repris ? `<div class="muted" style="margin-bottom:12px">Repris : ${repris}</div>` : ''}
    <div class="btns"><button id="eReplay">Rejouer cette course</button><button id="eNext">Nouvelle course</button><button id="eTrace">Télécharger la trace (JSON)</button><button id="eClose">Voir la course</button></div></div>`;
  box.hidden = false;
  document.getElementById('eReplay')!.onclick = () => { box.hidden = true; handlers.replay(); };
  document.getElementById('eNext')!.onclick = () => { box.hidden = true; handlers.next(); };
  document.getElementById('eTrace')!.onclick = handlers.trace;
  document.getElementById('eClose')!.onclick = () => { box.hidden = true; };
}
export const hideEnd = () => { $('end').hidden = true; };
export type { Rider };
