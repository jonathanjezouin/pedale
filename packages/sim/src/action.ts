/* =====================================================================
   Agir : comment le coureur réalise concrètement son intention
   (où il se place, à quelle puissance). Aucune décision ici.
   ===================================================================== */
import type { Intention, Rider, World } from './types';
import { capExplosif, capSoutenu, LANE, puissanceVers, RIDER_LEN } from './physics';
import { voisinDevant } from './mind';
import { clamp } from './util';

export interface Commande { p: number; yT: number }

/** Couloir « montant » (on remonte la file) = gauche ; couloir « descendant » (on se laisse glisser) = droite. */
export const RISING = -1;
export const FALLING = 1;

function autresDuGroupe(w: World, r: Rider): Rider[] { return w.groupe.groupe.filter((o) => o !== r); }

function couloirLibre(w: World, r: Rider, signe: number): boolean {
  return !w.groupe.ordre.some((o) => o !== r && Math.abs(o.x - r.x) < 9 &&
    (Math.abs(o.y - signe * LANE) < 0.9 || (o.intent.sprint && o.intent.phase === 'couloir' && o.intent.side === signe)));
}

/** Suivre une roue : vitesse cible = celle de la roue + correction d'écart. */
function suivre(w: World, r: Rider, roue: Rider, limite: number, aMax = 1.2): number {
  const gap = roue.x - r.x - RIDER_LEN;
  const vDes = clamp(roue.v + 0.5 * (gap - 0.8), roue.v - 3, roue.v + 3);
  return Math.min(limite, puissanceVers(vDes, r.v, r, w.cfg.vent, aMax));
}

export function agir(w: World, r: Rider): Commande {
  const g = w.groupe, vent = w.cfg.vent, it = r.intent, cap = capSoutenu(r);
  switch (it.kind) {
    case 'relais': {
      const autres = autresDuGroupe(w, r);
      const xMax = autres.reduce((m, o) => Math.max(m, o.x), -1e9);
      if (it.phase !== 'tete' && (autres.length === 0 || r.x > xMax + 3.0)) {
        it.phase = 'tete'; it.phaseSince = w.t;
      }
      if (it.phase === 'tete') {
        it.vHold = w.vRef;
        return { yT: 0, p: Math.min(cap * 1.0, puissanceVers(it.vHold, r.v, r, vent, 1.0)) };
      }
      it.phase = 'passe';
      const vMeneur = g.meneur ? g.meneur.v : g.vitesse;
      return { yT: RISING * LANE, p: Math.min(cap * 1.05, puissanceVers(vMeneur + 1.1, r.v, r, vent, 1.3)) };
    }
    case 'rabattre': {
      const lane0 = autresDuGroupe(w, r).filter((o) => Math.abs(o.y) < 0.8);
      const queueX = lane0.length ? lane0.reduce((m, o) => Math.min(m, o.x), 1e9) : -1e9;
      if (it.phase === 'decale' && lane0.length && r.x <= queueX - 3.0) { it.phase = 'rejoint'; it.phaseSince = w.t; it.forceEval = 'rejoint'; }
      if (it.phase === 'rejoint') return { yT: 0, p: Math.min(cap, puissanceVers(g.vitesse - 0.4, r.v, r, vent)) };
      it.phase = 'decale';
      return { yT: FALLING * LANE, p: Math.min(cap, puissanceVers(g.vitesse - 1.0, r.v, r, vent)) };
    }
    case 'attaquer': {
      if (it.sprint) {
        // on sort de la file une fois pour toutes dans un couloir libre, puis on tient son couloir jusqu'à la ligne
        if (it.phase !== 'couloir') {
          it.phase = 'couloir';
          it.side = couloirLibre(w, r, RISING) ? RISING : couloirLibre(w, r, FALLING) ? FALLING : (r.y <= 0 ? RISING : FALLING);
        }
        return { yT: it.side * LANE, p: capExplosif(r) };
      }
      if (it.phase === 'burst' && w.t - it.phaseSince >= 10) { it.phase = 'sustain'; it.phaseSince = w.t; it.forceEval = 'fin-burst'; }
      if (it.phase === 'burst') return { yT: RISING * LANE, p: 0.95 * capExplosif(r) };
      const autres = w.groupe.ordre.filter((o) => o !== r);
      const xMax = autres.reduce((m, o) => Math.max(m, o.x), -1e9);
      return { yT: r.x > xMax + 3 ? 0 : RISING * LANE, p: Math.min(capExplosif(r), 1.07 * cap) };
    }
    case 'suivre': {
      const a = it.cible !== null ? w.riders[it.cible] : undefined;
      if (a && a.status === 'course') {
        const gap = a.x - r.x - RIDER_LEN;
        const vDes = clamp(a.v + 0.4 * (gap - 1.0), a.v - 3, a.v + 1.5);
        return { yT: Math.abs(a.y) < 0.8 ? 0 : a.y, p: Math.min(capExplosif(r), puissanceVers(vDes, r.v, r, vent, 1.4)) };
      }
      return defaut(w, r);
    }
    case 'gerer':
      return { yT: 0, p: 0.78 * cap };
    case 'revenir': {
      const vDes = g.vitesse + 0.9;
      return { yT: 0, p: Math.min(capExplosif(r), 1.12 * cap, puissanceVers(vDes, r.v, r, vent, 1.5)) };
    }
    case 'abriter':
    default:
      return defaut(w, r);
  }
}

/** Comportement de base : suivre la roue devant, sinon tenir la vitesse du groupe. */
function defaut(w: World, r: Rider): Commande {
  const roue = voisinDevant(w, r, 1.0, 40), cap = capSoutenu(r);
  if (roue) return { yT: 0, p: suivre(w, r, roue, cap * 1.0) };
  return { yT: 0, p: Math.min(cap, puissanceVers(Math.max(w.groupe.vitesse, r.v - 0.3), r.v, r, w.cfg.vent)) };
}

/** Phrase d'« Agir » pour la trace (§6.5 : « je me place derrière le rouleur, effort minimal »). */
export function decrireAction(w: World, r: Rider, k: Intention): string {
  const kmh = Math.round(r.v * 3.6);
  switch (k) {
    case 'abriter': {
      const roue = voisinDevant(w, r, 1.0, 40);
      return roue ? `je me place derrière ${roue.letter}, effort minimal` : 'je reste dans la file, effort minimal';
    }
    case 'relais':
      return r.intent.phase === 'tete' ? `je roule en tête à ${kmh} km/h pour tenir la vitesse du groupe` : 'je passe devant le groupe pour prendre le relais';
    case 'rabattre': return 'je me décale, je laisse passer et je me replace à l’abri dans la file';
    case 'attaquer': return r.intent.sprint ? 'je lance le sprint à fond' : "j'accélère fort pour faire un écart";
    case 'suivre': { const a = r.intent.cible !== null ? w.riders[r.intent.cible] : null; return a ? `je saute dans la roue de ${a.letter}` : 'je suis le coureur qui attaque'; }
    case 'gerer': return `je roule à mon rythme (≈ ${Math.round(0.78 * capSoutenu(r))} W)`;
    case 'revenir': return 'je reviens sur le groupe, effort soutenu';
  }
}
