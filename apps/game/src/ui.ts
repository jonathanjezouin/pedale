/* Interface HTML : fil de course, liste des coureurs, explication « pourquoi ? », fin de course. */
import { ARCHETYPE_LABEL, INTENTION_LABEL, expliquer, resumeEvaluations } from '@pedale/sim';
import type { Intention, Rider, SimEvent, World } from '@pedale/sim';
import { PALETTES } from './riders';

export const INTENT_COLOR: Record<Intention, string> = {
  relais: '#e4572e', abriter: '#2a6fdb', rabattre: '#8e6bd1', attaquer: '#d62839', suivre: '#e49a2e', gerer: '#7a7f87', revenir: '#1aa39a',
};
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export const fmtT = (s: number) => `${Math.floor(s / 60)}'${String(Math.floor(s % 60)).padStart(2, '0')}"`;
/** Classement de course : arrivés dans l'ordre d'arrivée, puis coureurs en course du plus avancé au dernier . */
export function classement(w: World): number[] {
  const arr = w.result.ordre.slice();
  const enCourse = w.riders.filter((r) => r.status === 'course').sort((a, b) => b.x - a.x).map((r) => r.id);
  return arr.concat(enCourse);
}
export const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.max(0, Math.round(m))} m`);

/* ---------------- HUD ---------------- */
export function updateHud(w: World, sel: number) {
  const g = w.vue;
  const reste = Math.max(0, w.finishX - (g.ordre.length ? Math.max(...g.ordre.map((r) => r.x)) : w.finishX));
  $('sKm').textContent = fmtKm(reste);
  const rk = classement(w), pos = rk.indexOf(sel), rs = w.riders[sel]!;
  $('sGap').textContent = pos < 0 ? '—' : `${pos === 0 ? '1er' : pos + 1 + 'e'} / ${w.riders.length}`;
  const dev = pos > 0 ? w.riders[rk[pos - 1]!]! : null;
  $('sGapSub').textContent = rs.status === 'arrive' ? 'arrivé' : dev ? `à ${Math.max(0, Math.round(dev.x - rs.x))} m de ${dev.letter}` : 'en tête de la course';
  $('sSpd').textContent = `${(rs.v * 3.6).toFixed(1)} km/h`;
  const lead = g.ordre[0];
  $('sWind').textContent = `${w.cfg.vent.toFixed(1)} m/s`;
  if (lead) {
    const ang = Math.atan2(Math.abs(lead.cw), lead.hw) * 180 / Math.PI;           // 0° = de face, 90° = de côté, 180° = dans le dos
    const lab = ang < 25 ? 'de face' : ang < 65 ? 'de trois-quarts face' : ang < 115 ? 'de côté' : ang < 155 ? 'de trois-quarts dos' : 'dans le dos';
    const cote = ang >= 25 && ang <= 155 ? (lead.cw > 0 ? ' (de gauche)' : ' (de droite)') : '';
    $('sWindRel').textContent = w.cfg.ventMode === 'face' ? 'toujours de face' : lab + cote;
    const dir = w.cfg.ventMode === 'face' ? w.road.heading(lead.x) + Math.PI : Math.atan2(w.vent.wy, w.vent.wx);
    document.getElementById('windArrow')!.style.transform = `rotate(${dir}rad)`;
  }
  $('sT').textContent = fmtT(w.t);
}

/* ---------------- liste des coureurs ---------------- */
let rowsBuilt = false;
export function buildRiders(w: World, onSelect: (id: number) => void) {
  const el = $('riders');
  el.innerHTML = `<h2><span>Les 8 coureurs · ← →</span><span class="legend"><i style="background:#2f8f4e"></i>réserve<i style="background:#e49a2e"></i>explosivité</span></h2>` +
    w.riders.map((r) => {
      const pal = PALETTES[r.id % PALETTES.length]!;
      return `<div class="rider" data-id="${r.id}"><span class="badge" style="background:${pal.j};color:${isLight(pal.j) ? '#111' : '#fff'}">${r.letter}</span>
        <div><div class="l1"><b>${cap(ARCHETYPE_LABEL[r.archetype])}</b><span class="chip" data-f="chip"></span><span class="rk" data-f="rk"></span></div>
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
  const rk = classement(w);
  document.querySelectorAll<HTMLElement>('#riders .rider').forEach((row) => {
    const r = w.riders[Number(row.dataset.id)]!;
    row.classList.toggle('sel', r.id === sel);
    row.classList.toggle('out', r.status !== 'course');
    const f = (k: string) => row.querySelector<HTMLElement>(`[data-f="${k}"]`)!;
    const chip = f('chip');
    if (r.status === 'arrive') { chip.textContent = 'Arrivé'; chip.style.setProperty('--c', '#2f8f4e'); }
    else if (r.intent.kind) { chip.textContent = r.intent.sprint ? 'Sprint' : INTENTION_LABEL[r.intent.kind]; chip.style.setProperty('--c', INTENT_COLOR[r.intent.kind]); }
    const pos = rk.indexOf(r.id); f('rk').textContent = pos >= 0 ? (pos === 0 ? '1er' : `${pos + 1}e`) : '';
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
    `allure ${(p.rivaux.allure * 3.6).toFixed(0)} km/h`,
    p.moi.decroche ? `décroché (${Math.round(p.moi.ecartDevant)} m)` : p.moi.rang === 0 ? 'premier' : `${p.moi.rang + 1}e${p.moi.abrite > 0.12 ? ', abrité' : ', exposé'}`,
    `vent ${p.course.ventFace >= 0 ? 'de face' : 'dans le dos'} ${Math.abs(p.course.ventFace).toFixed(1)} m/s` + (Math.abs(p.course.ventCote) > 0.5 ? `, de côté ${Math.abs(p.course.ventCote).toFixed(1)} m/s (${p.course.ventCote > 0 ? 'de gauche' : 'de droite'})` : ''),
    ...(p.rivaux.devantLetter ? [`${p.rivaux.devantLetter} devant moi`] : []),
    ...(p.rivaux.attaque ? [`${p.rivaux.attaque.letter} attaque`] : []),
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
      <div class="muted">Réel : réserve ${Math.round(d.reel.reserve * 100)} % — perception exacte en v0.0.1 (pas de bruit).</div></div>
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

/* ---------------- bande de progression : chaque coureur est un point ---------------- */
export function updateStrip(w: World, sel: number) {
  const el = $('strip');
  if (!el.querySelector('.track')) el.innerHTML = '<div class="track"><div class="rail"></div><div id="dots"></div><div class="lab l0">départ</div><div class="lab l1" id="stripKm"></div></div><div class="flag">🏁</div>';
  const L = w.finishX, pct = (x: number) => `${Math.max(0, Math.min(1, x / L)) * 100}%`;
  const rk = classement(w);
  $('dots').innerHTML = w.riders.map((r) => {
    const pal = PALETTES[r.id % PALETTES.length]!, k = rk.indexOf(r.id);
    return `<i class="dot ${r.id === sel ? 'sel' : ''}" style="left:${pct(r.x)};top:${24 + (k % 3) * 7}px;background:${pal.j}" title="${r.letter}"></i>`;
  }).join('');
  const act = w.riders.filter((r) => r.status === 'course');
  const lead = act.length ? Math.max(...act.map((r) => r.x)) : w.finishX;
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
  const win = w.riders[res.vainqueur!]!;
  box.innerHTML = `<div class="box"><h2>Victoire de ${win.letter}, ${ARCHETYPE_LABEL[win.archetype]}</h2>
    <div class="sub">${fmtKm(w.finishX)} en ${fmtT(win.finishTime ?? res.tFin)}.</div>
    ${ordre ? `<ol>${ordre}</ol>` : ''}
    <div class="btns"><button id="eReplay">Rejouer cette course</button><button id="eNext">Nouvelle course</button><button id="eTrace">Télécharger la trace (JSON)</button><button id="eClose">Voir la course</button></div></div>`;
  box.hidden = false;
  document.getElementById('eReplay')!.onclick = () => { box.hidden = true; handlers.replay(); };
  document.getElementById('eNext')!.onclick = () => { box.hidden = true; handlers.next(); };
  document.getElementById('eTrace')!.onclick = handlers.trace;
  document.getElementById('eClose')!.onclick = () => { box.hidden = true; };
}
export const hideEnd = () => { $('end').hidden = true; };
export type { Rider };

/* ---------------- mini-carte : la route et les coureurs ---------------- */
let miniBox: { x0: number; y0: number; sc: number; ox: number; oy: number } | null = null; let miniRoad: HTMLCanvasElement | null = null; let miniFor: World | null = null;
export function updateMini(w: World, _cam: { x: number; y: number } | null) {
  const cv = document.getElementById('mini') as HTMLCanvasElement, ctx = cv.getContext('2d')!, road = w.road;
  if (miniFor !== w) {
    miniFor = w; let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
    for (let i = 0; i < road.n; i += 5) { x0 = Math.min(x0, road.X[i]!); x1 = Math.max(x1, road.X[i]!); y0 = Math.min(y0, road.Y[i]!); y1 = Math.max(y1, road.Y[i]!); }
    const pad = 14, sc = Math.min((cv.width - 2 * pad) / Math.max(1, x1 - x0), (cv.height - 2 * pad) / Math.max(1, y1 - y0));
    miniBox = { x0, y0, sc, ox: pad + ((cv.width - 2 * pad) - (x1 - x0) * sc) / 2, oy: pad + ((cv.height - 2 * pad) - (y1 - y0) * sc) / 2 };
    miniRoad = document.createElement('canvas'); miniRoad.width = cv.width; miniRoad.height = cv.height;
    const c = miniRoad.getContext('2d')!; c.fillStyle = 'rgba(251,247,234,.94)'; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = '#4b4d55'; c.lineWidth = 3.5; c.lineJoin = 'round'; c.beginPath();
    for (let s = 0; s <= w.finishX; s += 20) { const p = road.xy(s); const X = miniBox.ox + (p.x - miniBox.x0) * miniBox.sc, Y = miniBox.oy + (p.y - miniBox.y0) * miniBox.sc; s ? c.lineTo(X, Y) : c.moveTo(X, Y); }
    c.stroke();
    const f = road.xy(w.finishX); c.fillStyle = '#16161a'; c.fillRect(miniBox.ox + (f.x - miniBox.x0) * miniBox.sc - 3, miniBox.oy + (f.y - miniBox.y0) * miniBox.sc - 3, 6, 6);
  }
  const b = miniBox!; ctx.drawImage(miniRoad!, 0, 0);
  const at = (s: number) => { const p = road.xy(s); return { x: b.ox + (p.x - b.x0) * b.sc, y: b.oy + (p.y - b.y0) * b.sc }; };
  for (const r of w.riders) { const p = at(r.x); ctx.fillStyle = PALETTES[r.id % PALETTES.length]!.j; ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
}
