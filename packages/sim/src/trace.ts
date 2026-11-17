import type { Decision, Evaluation } from './types';
import { ARCHETYPE_LABEL, INTENTION_LABEL } from './types';
import { signed } from './util';

const fmtT = (t: number) => `${Math.floor(t / 60)}'${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Trace attendue (§6.5) : Perçu / Intention (avec ses raisons) / Action. */
export function expliquer(d: Decision): string {
  const km = (d.distRestante / 1000).toFixed(d.distRestante < 1000 ? 2 : 1);
  const p = d.percu;
  const percu = [
    `réserve ${Math.round(p.moi.reserve * 100)} %`,
    `explosivité ${Math.round(p.moi.explosivite * 100)} %`,
    `groupe à ${(p.groupe.vitesse * 3.6).toFixed(0)} km/h`,
    `écart ${Math.round(p.course.ecart)} s (${p.course.tendance >= 0 ? '+' : '−'}${Math.abs(Math.round(p.course.tendance))} s/30 s)`,
    p.moi.dansGroupe ? (p.moi.estEnTete ? 'en tête' : `${p.moi.rang + 1}e de la file`) : 'lâché',
  ].join(', ');
  const raisons = d.raisons.map((q) => `${signed(q.valeur)} ${q.texte}`).join(' ; ');
  const reel = `réel : réserve ${Math.round(d.reel.reserve * 100)} %, écart ${Math.round(d.reel.ecart)} s`;
  return [
    `[${fmtT(d.t)}] Coureur ${d.letter}, ${ARCHETYPE_LABEL[d.archetype]}, à ${km} km de l'arrivée.`,
    `Perçu : ${percu}. (${reel})`,
    `Interprété : ${d.interprete.phrases.join(', ')}.`,
    `Intention : ${INTENTION_LABEL[d.intention]}${d.change && d.precedente ? ` (avant : ${INTENTION_LABEL[d.precedente]})` : ''} — ${raisons || 'aucune raison marquante'}.`,
    `Action : ${d.action}.`,
  ].join('\n');
}

export function resumeEvaluations(evals: Evaluation[]) {
  return evals.map((e) => ({
    intention: e.intention, label: INTENTION_LABEL[e.intention], score: e.score, vetos: e.vetos, raisons: e.raisons,
  })).sort((a, b) => (a.vetos.length ? 1 : 0) - (b.vetos.length ? 1 : 0) || b.score - a.score);
}
