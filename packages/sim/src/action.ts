/* =====================================================================
   Agir : comment le coureur réalise concrètement son intention
   (où il se place sur la route, à quelle puissance). Aucune décision ici.
   Le placement est continu sur toute la largeur de la route ; la file suit l'axe défini dans placement.ts.
   ===================================================================== */
import type { Intention, Rider, World } from './types';
import { capExplosif, capSoutenu, FREINAGE_MAX, puissanceVers, RIDER_LEN, vitesseSolo } from './physics';
import { voisinDevant } from './mind';
import { axeY, decalage, enLigne, limiter, placeDansLaFile, roueEnLigne, yDescendant, yMontant } from './placement';
import { clamp } from './util';

export interface Commande { p: number; yT: number }

const autres = (w: World, r: Rider): Rider[] => w.vue.ordre.filter((o) => o !== r);

/** Coureur juste devant moi au classement (quel que soit son couloir). */
const devantAuClassement = (w: World, r: Rider): Rider | null => { const i = w.vue.ordre.indexOf(r); return i > 0 ? w.vue.ordre[i - 1]! : null; };

/** Le couloir (+1 montant / −1 descendant) est-il libre autour de moi ? (on compte aussi ceux qui s'y dirigent) */
function couloirLibre(w: World, r: Rider, cote: 1 | -1): boolean {
  const off = decalage(r, true), sMont = w.vue.coteMontant;
  return !w.vue.ordre.some((o) => {
    if (o === r || Math.abs(o.x - r.x) >= 9) return false;
    const yLane = axeY(w, o.x) + cote * sMont * off;
    return Math.abs(o.y - yLane) < 0.9 || (o.intent.sprint && o.intent.phase === 'couloir' && o.intent.side === cote);
  });
}

/** Suivre une roue : vitesse cible = celle de la roue + correction d'écart. */
function suivre(roue: Rider, r: Rider, limite: number, aMax = 1.2): number {
  const gap = roue.x - r.x - RIDER_LEN;
  const vDes = clamp(roue.v + 0.5 * (gap - 0.8), roue.v - 3, roue.v + 3);
  return Math.min(limite, puissanceVers(vDes, r.v, r, aMax, FREINAGE_MAX));      // un suiveur peut freiner pour ne pas toucher la roue
}

/** Position latérale dans le sillage de la roue qu'on suit (dérive avec le vent), avec l'habitude personnelle. */
function yAbrite(w: World, r: Rider, roue: Rider): number {
  return limiter(roue.y + Math.max(0, roue.x - r.x - RIDER_LEN) * w.vue.tanB + r.profile.lateral * 0.2);
}

export function agir(w: World, r: Rider): Commande {
  const g = w.vue, it = r.intent, cap = capSoutenu(r);
  switch (it.kind) {
    case 'relais': {
      const rivaux = autres(w, r);
      const xMax = rivaux.reduce((m, o) => Math.max(m, o.x), -1e9);
      // le coureur déjà en tête n'a personne à doubler ; un passeur doit avoir dépassé tous les autres de 3 m
      if (it.phase !== 'tete' && (rivaux.length === 0 || r.x > xMax + 3.0 || (enLigne(w, r) && r.x > xMax))) {
        it.phase = 'tete'; it.phaseSince = w.t;
        // en tête on tient l'allure à laquelle les autres roulaient (médiane de leurs vitesses), dans la limite de ses moyens
        const vs = rivaux.map((o) => o.v).sort((p, q) => p - q);
        const vAutres = vs.length ? vs[Math.floor(vs.length / 2)]! : r.v;
        // jamais en dessous de son allure de croisière personnelle (≈ 78–88 % de sa puissance soutenable selon sa générosité) :
        // sans cela, chaque meneur prendrait l'allure ralentie du précédent et la course s'arrêterait
        const vCroisiere = vitesseSolo((0.78 + 0.10 * r.profile.generosite) * cap, r.profile.cda, r.profile.mass, r.hw);
        it.vHold = Math.max(vAutres, vCroisiere);
      }
      if (it.phase === 'tete') {
        return { yT: limiter(g.yTete + r.profile.lateral * 0.3), p: Math.min(cap * 1.0, puissanceVers(it.vHold, r.v, r, 1.0)) };
      }
      it.phase = 'passe';
      const vMeneur = g.meneur ? g.meneur.v : g.vitesse;
      return { yT: yMontant(w, r), p: Math.min(cap * 1.05, puissanceVers(vMeneur + 1.1, r.v, r, 1.3)) };
    }
    case 'rabattre': {
      const file = autres(w, r).filter((o) => enLigne(w, o));
      const queueX = file.length ? file.reduce((m, o) => Math.min(m, o.x), 1e9) : -1e9;
      if (it.phase === 'decale' && file.length && r.x <= queueX - 3.0) { it.phase = 'rejoint'; it.phaseSince = w.t; it.forceEval = 'rejoint'; }
      if (it.phase === 'rejoint') return { yT: placeDansLaFile(w, r), p: Math.min(cap, puissanceVers(g.vitesse - 0.4, r.v, r)) };
      it.phase = 'decale';
      // tant qu'il n'est pas sorti de la file, il garde l'allure (sinon toute la file derrière freine avec lui) ; puis il se laisse glisser
      const libre = !enLigne(w, r, 1.1);
      return { yT: yDescendant(w, r), p: Math.min(cap, puissanceVers(libre ? g.vitesse - 1.0 : g.vitesse, r.v, r)) };
    }
    case 'attaquer': {
      if (it.sprint) {
        // on sort de la file une fois pour toutes dans un couloir libre, puis on tient son couloir jusqu'à la ligne
        if (it.phase !== 'couloir') {
          it.phase = 'couloir';
          it.side = couloirLibre(w, r, 1) ? 1 : couloirLibre(w, r, -1) ? -1 : (r.y >= axeY(w, r.x) ? -1 : 1);
        }
        const y = axeY(w, r.x) + it.side * g.coteMontant * decalage(r, true);
        return { yT: limiter(y), p: capExplosif(r) };
      }
      if (it.phase === 'burst' && w.t - it.phaseSince >= 10) { it.phase = 'sustain'; it.phaseSince = w.t; it.forceEval = 'fin-burst'; }
      if (it.phase === 'burst') return { yT: yMontant(w, r, true), p: 0.95 * capExplosif(r) };
      const xMax = autres(w, r).reduce((m, o) => Math.max(m, o.x), -1e9);
      return { yT: r.x > xMax + 3 ? limiter(g.yTete) : yMontant(w, r, true), p: Math.min(capExplosif(r), 1.07 * cap) };
    }
    case 'suivre': {
      const a = it.cible !== null ? w.riders[it.cible] : undefined;
      if (a && a.status === 'course') {
        const gap = a.x - r.x - RIDER_LEN;
        const vDes = clamp(a.v + 0.4 * (gap - 1.0), a.v - 3, a.v + 1.5);
        return { yT: yAbrite(w, r, a), p: Math.min(capExplosif(r), puissanceVers(vDes, r.v, r, 1.4, FREINAGE_MAX)) };
      }
      return defaut(w, r);
    }
    case 'gerer':
      return { yT: limiter(r.profile.lateral), p: 0.78 * cap };
    case 'revenir': {
      const dev = devantAuClassement(w, r);
      const vDes = (dev ? dev.v : g.vitesse) + 1.0;          // on rattrape le coureur juste devant
      return { yT: placeDansLaFile(w, r), p: Math.min(capExplosif(r), 1.12 * cap, puissanceVers(vDes, r.v, r, 1.5)) };
    }
    case 'abriter':
    default:
      return defaut(w, r);
  }
}

/** Comportement de base : se placer dans le sillage de la roue devant et la suivre, sinon tenir l'allure. */
function defaut(w: World, r: Rider): Commande {
  const roue = roueEnLigne(w, r), cap = capSoutenu(r);
  if (roue) return { yT: yAbrite(w, r, roue), p: suivre(roue, r, cap * 1.0) };
  return { yT: placeDansLaFile(w, r), p: Math.min(cap, puissanceVers(Math.max(w.vue.vitesse, r.v - 0.3), r.v, r)) };
}

/** Phrase d'« Agir » pour la trace (§6.5 : « je me place derrière le rouleur, effort minimal »). */
export function decrireAction(w: World, r: Rider, k: Intention): string {
  const kmh = Math.round(r.v * 3.6);
  const cote = Math.abs(w.vue.tanB) > 0.12 ? ' (dans le sillage, à l’abri du vent de côté)' : '';
  switch (k) {
    case 'abriter': {
      const roue = roueEnLigne(w, r);
      return roue ? `je me place derrière ${roue.letter}${cote}, effort minimal` : 'je reste dans la file, effort minimal';
    }
    case 'relais':
      return r.intent.phase === 'tete' ? `je roule en tête à ${kmh} km/h pour tenir l'allure` : `je passe devant les autres côté ${w.vue.coteMontant < 0 ? 'gauche' : 'droit'} pour prendre le relais`;
    case 'rabattre': return `je me décale ${w.vue.coteMontant < 0 ? 'à droite' : 'à gauche'}, je laisse passer et je me replace à l’abri dans la file`;
    case 'attaquer': return r.intent.sprint ? 'je lance le sprint à fond' : "j'accélère fort pour faire un écart";
    case 'suivre': { const a = r.intent.cible !== null ? w.riders[r.intent.cible] : null; return a ? `je saute dans la roue de ${a.letter}` : 'je suis le coureur qui attaque'; }
    case 'gerer': return `je roule à mon rythme (≈ ${Math.round(0.78 * capSoutenu(r))} W)`;
    case 'revenir': { const dev = devantAuClassement(w, r); return dev ? `je reviens sur ${dev.letter}, effort soutenu` : 'je reviens, effort soutenu'; }
  }
}
