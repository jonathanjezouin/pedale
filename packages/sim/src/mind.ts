/* =====================================================================
   Le raisonnement d'un coureur, par étages lisibles et traçables (§4) :
     Percevoir → Interpréter → Vouloir  (Agir est dans action.ts)
   Le bruit vivra dans Percevoir et Interpréter, jamais dans Vouloir (§4.1).
   Pour le POC la perception est exacte, mais la structure perçu/réel existe.
   ===================================================================== */
import type {
  AutreCoureur, Evaluation, Interprete, Intention, Percu, Raison, Reel, Rider, World,
} from './types';
import { INTENTIONS, ARCHETYPE_LABEL } from './types';
import { E_CUIT, X_MIN } from './physics';
import { clamp, smoothstep } from './util';
import { abrite, enLigne } from './placement';

/** Tous les « boutons » de réglage des raisons au même endroit (équilibrage par le batch). */
export const TUNE = {
  hysteresis: 0.6,            // un coureur ne change d'avis que si l'écart de score dépasse ça
  intervalleBase: 7,          // s entre deux réévaluations (réduit par l'expérience)
};

/** Distance à laquelle le coureur lance son sprint : ce que son explosivité restante lui permet de tenir,
 *  un peu plus tôt s'il est agressif, un peu plus tard s'il a une grosse pointe. */
export function distanceSprint(r: Rider): number {
  const p = r.profile;
  const dureeTenable = (r.X * p.wPrime) / (0.75 * Math.max(100, p.pPeak - p.cp));   // s
  const f = 1.05 - 0.15 * p.pointe + 0.15 * p.agressivite;
  return Math.round(clamp(f * dureeTenable * 12.5, 110, 480));
}

/** Durée d'engagement minimale de chaque intention (§6.2). */
export function engagement(r: Rider, k: Intention): number {
  switch (k) {
    case 'relais': return 30 + 30 * r.profile.generosite;
    case 'abriter': return 6;
    case 'rabattre': return 14;
    case 'attaquer': return 10;
    case 'suivre': return 10;
    case 'gerer': return 15;
    case 'revenir': return 10;
  }
}

/* ---------------------------- Percevoir ---------------------------- */

export function percevoir(w: World, r: Rider): { percu: Percu; reel: Reel } {
  const g = w.groupe;
  const actifs = g.ordre.filter((o) => o.id !== r.id);
  const dansGroupe = g.groupe.includes(r);
  const rang = dansGroupe ? g.groupe.indexOf(r) : g.groupe.length;
  const devant = voisinDevant(w, r);
  const estEnTete = dansGroupe && enLigne(w, r) && !g.groupe.some((o) => o !== r && abrite(w, o, r, 1.0, 1e9));
  const tempsEnTete = w.meneurId === r.id ? w.t - w.meneurDepuis : 0;
  const sumLead = g.ordre.reduce((s, o) => s + o.stats.leadRecent, 0);
  const moyAutres = actifs.length ? actifs.reduce((s, o) => s + o.stats.leadRecent, 0) / actifs.length : 0;
  let meilleur: Rider | null = null;
  for (const o of actifs) if (!meilleur || o.profile.pointe > meilleur.profile.pointe) meilleur = o;
  const meilleurePointe = Math.max(r.profile.pointe, meilleur?.profile.pointe ?? 0);
  const meneur = w.meneurId !== null ? w.riders[w.meneurId]! : null;
  const ecartMax = g.ordre.length > 1 ? Math.max(...g.ordre.slice(1).map((o, i) => g.ordre[i]!.x - o.x)) : 0;
  let attaque: Percu['groupe']['attaque'] = null;
  if (w.attaque && w.attaque.id !== r.id) {
    const a = w.riders[w.attaque.id]!;
    if (a.status === 'course' && w.t - w.attaque.t < 40 && a.x > r.x) {
      attaque = { id: a.id, letter: a.letter, avance: a.x - r.x, depuis: w.t - w.attaque.t, danger: 0.5 + 0.5 * a.profile.pointe };
    }
  }
  const autres: AutreCoureur[] = actifs.map((o) => ({
    id: o.id, letter: o.letter, archetype: o.archetype, leadRecent: o.stats.leadRecent,
    tempsEnTete: o.id === w.meneurId ? w.t - w.meneurDepuis : 0, pointe: o.profile.pointe, x: o.x, v: o.v,
  }));
  const percu: Percu = {
    moi: {
      reserve: r.E, explosivite: r.X, vitesse: r.v, abrite: r.draft, rang, estEnTete, dansGroupe,
      ecartAuGroupe: dansGroupe || !g.queue ? 0 : Math.max(0, g.queue.x - r.x),
      tempsEnTete, leadRecent: r.stats.leadRecent, partRelais: sumLead > 0 ? r.stats.leadRecent / sumLead : 0,
    },
    groupe: {
      vitesse: g.vitesse, taille: g.groupe.length, soude: g.groupe.length === g.ordre.length, ecartMax,
      devantId: devant ? devant.id : null, devantLetter: devant ? devant.letter : null,
      meneurId: meneur ? meneur.id : null, meneurLetter: meneur ? meneur.letter : null, meneurDepuis: meneur ? w.t - w.meneurDepuis : 0,
      quelquunPasse: g.groupe.some((o) => o !== r && o.intent.kind === 'relais' && o.intent.phase === 'passe'),
      moyenneRelaisAutres: moyAutres,
      meilleurePointe, sprinteurDangereux: !!meilleur && meilleur.profile.pointe > r.profile.pointe + 0.08,
      sprinteurLetter: meilleur && meilleur.profile.pointe > r.profile.pointe + 0.08 ? meilleur.letter : null,
      attaque, autres,
    },
    course: { ecart: w.ecart, tendance: w.tendance, distRestante: Math.max(0, w.finishX - r.x - 0.9), distParcourue: r.x, ventFace: r.hw, ventCote: r.cw },
    role: { objectif: 'gagner' },
    profil: { endurance: r.profile.tEnd, pointe: r.profile.pointe, generosite: r.profile.generosite, agressivite: r.profile.agressivite, experience: r.profile.experience },
  };
  // POC : perception exacte. (Plus tard : biais durable / retard / perception grossière ici.)
  const reel: Reel = { reserve: r.E, explosivite: r.X, ecart: w.ecart, vitesseGroupe: g.vitesse };
  return { percu, reel };
}

/** Coureur directement devant dans mon couloir (roue à suivre), à 35 m max. */
export function voisinDevant(w: World, r: Rider, tolLat = 1.0, portee = 35): Rider | null {
  let best: Rider | null = null;
  for (const o of w.groupe.ordre) {
    if (o === r || !abrite(w, o, r, tolLat, portee)) continue;
    if (!best || o.x < best.x) best = o;
  }
  return best;
}

/* ---------------------------- Interpréter ---------------------------- */

export function interpreter(p: Percu): Interprete {
  const E = p.moi.reserve, X = p.moi.explosivite;
  const forme: Interprete['forme'] = E > 0.6 ? 'frais' : E > 0.35 ? 'bien' : E > E_CUIT ? 'limite' : 'cuit';
  const explosivite: Interprete['explosivite'] = X > 0.7 ? 'pleine' : X > X_MIN ? 'entamee' : 'vide';
  const ecart: Interprete['ecart'] = p.course.tendance < -3 ? 'fond' : p.course.tendance > 3 ? 'grandit' : 'stable';
  const menace = clamp(1 - p.course.ecart / 110, 0, 1);
  const tend = clamp(-p.course.tendance / 10, 0, 1);
  const pression = clamp(0.55 * menace + 0.45 * tend + (p.course.ecart < 25 ? 0.3 : 0), 0, 1);
  const d = p.course.distRestante;
  const distance: Interprete['distance'] = d < 600 ? 'sprint' : d < 2500 ? 'proche' : d < 8000 ? 'moyenne' : 'loin';
  const groupe: Interprete['groupe'] = !p.moi.dansGroupe ? 'rompu' : p.groupe.soude ? 'soude' : 'etire';
  const mine = p.moi.leadRecent, moy = p.groupe.moyenneRelaisAutres;
  const deficitRelais = clamp((moy - mine) / Math.max(25, moy), 0, 1);
  const excesRelais = clamp((mine - moy) / Math.max(25, mine), 0, 1);
  const partRelais: Interprete['partRelais'] = deficitRelais > 0.25 ? 'moins' : excesRelais > 0.25 ? 'plus' : 'egal';
  const sumAll = mine + p.groupe.autres.reduce((s, o) => s + o.leadRecent, 0);
  const rasLeBol = sumAll >= 90 ? clamp((mine / sumAll - 0.45) / 0.4, 0, 1) : 0;
  const sprintFocus = clamp((p.profil.pointe - 0.45) / 0.4, 0, 1);
  const phrases: string[] = [];
  phrases.push(forme === 'frais' ? 'je me sens frais' : forme === 'bien' ? 'je me sens bien' : forme === 'limite' ? 'je suis à la limite' : 'je suis cuit');
  if (explosivite === 'vide') phrases.push("je n'ai plus d'explosivité");
  if (ecart === 'fond') phrases.push("l'écart avec le peloton fond");
  else if (ecart === 'grandit') phrases.push("l'écart avec le peloton grandit");
  if (partRelais === 'plus') phrases.push("j'ai plus roulé que les autres");
  else if (partRelais === 'moins') phrases.push("j'ai moins roulé que les autres");
  if (groupe === 'rompu') phrases.push('je suis lâché');
  return {
    forme, explosivite, ecart, pression, distance, groupe, placement: p.moi.abrite > 0.12 ? 'abrite' : 'expose', partRelais,
    reserveBasse: clamp((0.45 - E) / 0.35, 0, 1), explosiviteBasse: clamp((0.6 - X) / 0.4, 0, 1),
    deficitRelais, excesRelais, rasLeBol, sprintFocus, phrases,
  };
}

/* ---------------------------- Vouloir ---------------------------- */

const mk = (liste: Raison[], id: string, texte: string, valeur: number) => { if (Math.abs(valeur) >= 0.05) liste.push({ id, texte, valeur }); };

/** Évalue chaque intention : veto d'abord (impossibilités), puis une liste de raisons nommées. */
export function evaluer(w: World, r: Rider, p: Percu, it: Interprete): Evaluation[] {
  const out: Evaluation[] = [];
  const d = p.course.distRestante;
  const prof = r.profile;
  const cuit = r.E < E_CUIT;
  const sansExplosif = r.X < X_MIN;
  const pasDeRoue = p.groupe.devantId === null;
  
  for (const k of INTENTIONS) {
    const raisons: Raison[] = [];
    const vetos: string[] = [];

    switch (k) {
      case 'relais': {
        if (cuit) vetos.push('Je suis cuit : plus de réserve pour rouler devant');
        if (!p.moi.dansGroupe) vetos.push("Je suis lâché : il n'y a plus de groupe à mener");
        mk(raisons, 'objectif', "Mon objectif est de gagner : l'échappée doit survivre", 1.5);
        mk(raisons, 'ecart', it.ecart === 'fond' ? "L'écart avec le peloton fond" : 'Le peloton reste à portée', 3.5 * it.pression);
        mk(raisons, 'reciprocite', "Je n'ai pas roulé autant que les autres", 3.5 * it.deficitRelais);
        mk(raisons, 'reserve', 'Ma réserve est basse', -4.5 * it.reserveBasse);
        mk(raisons, 'rasLeBol', 'Je suis presque le seul à rouler depuis longtemps', -4.5 * it.rasLeBol);
        mk(raisons, 'egoisme', 'Mon tempérament est plutôt égoïste', -2.5 * (1 - prof.generosite));
        if (!p.moi.estEnTete && p.groupe.meneurId !== null && p.groupe.meneurDepuis < 20)
          mk(raisons, 'dejaPris', `${p.groupe.meneurLetter} vient de prendre le relais`, -4 * clamp(1 - p.groupe.meneurDepuis / 25, 0, 1));
        if (!p.moi.estEnTete && p.moi.rang > 1) mk(raisons, 'rang', 'Il y a du monde à dépasser avant de passer devant', -0.6 * Math.min(p.moi.rang - 1, 4));
        if (!p.moi.estEnTete && p.groupe.quelquunPasse) mk(raisons, 'quelquunPasse', 'Quelqu’un est déjà en train de passer', -3);
        break;
      }
      case 'abriter': {
        if (voisinDevant(w, r, 3.5, 40) === null) vetos.push('Personne devant moi : pas de roue à suivre');
        if (!p.moi.dansGroupe && p.moi.ecartAuGroupe > 40) vetos.push("Je suis lâché : pas de roue à portée");
        mk(raisons, 'forces', 'Je veux garder des forces pour la fin', 1.5 + 1.5 * it.sprintFocus);
        mk(raisons, 'reserve', 'Ma réserve est basse', 4 * it.reserveBasse);
        mk(raisons, 'dejaRoule', "J'ai déjà roulé récemment", 2.5 * it.excesRelais);
        mk(raisons, 'ralentit', "Le groupe ralentit et l'écart baisse", -3 * it.pression);
        break;
      }
      case 'rabattre': {
        if (!p.moi.dansGroupe) vetos.push('Je ne suis plus dans le groupe');
        if (!(p.moi.estEnTete || (r.intent.kind === 'rabattre' && r.intent.phase !== 'rejoint'))) vetos.push("Je suis déjà à l'abri dans la file");
        const dureeRelais = engagement(r, 'relais');
        mk(raisons, 'duree', "J'ai fait mon temps de relais", 4 * clamp(p.moi.tempsEnTete / dureeRelais, 0, 1.2));
        mk(raisons, 'rasLeBol', 'Je suis presque le seul à rouler depuis longtemps', 4.5 * it.rasLeBol);
        mk(raisons, 'reserve', 'Ma réserve est basse', 3 * it.reserveBasse);
        if (p.groupe.quelquunPasse) mk(raisons, 'releve', 'Quelqu’un prend le relais : je peux me rabattre', 2.5);
        else mk(raisons, 'personne', "L'écart fond et personne ne relève", -3 * it.pression);
        mk(raisons, 'genereux', 'Je suis généreux : je préfère rester devant', -1.5 * prof.generosite);
        break;
      }
      case 'attaquer': {
        if (cuit) vetos.push('Je suis cuit : plus de réserve pour attaquer');
        if (sansExplosif) vetos.push("Je n'ai plus d'explosivité");
        const sprintD = distanceSprint(r);
        if (!p.moi.dansGroupe && !(d <= sprintD)) vetos.push("Je suis lâché : rien à attaquer");
        const fenetre = smoothstep(500, 1200, d) * (1 - smoothstep(4000, 9000, d));
        const dmax = 3000 + 4000 * prof.agressivite;
        const frais = p.groupe.autres.length ? p.groupe.autres.filter((o) => w.riders[o.id]!.E > 0.4).length / p.groupe.autres.length : 0;
        const dernier = clamp(1 - (w.t - r.stats.lastAttackT) / 600, 0, 1);
        mk(raisons, 'pointe', 'Ma pointe de vitesse ne me permet pas de gagner au sprint', 1.5 * clamp((0.6 - prof.pointe) / 0.3, 0, 1));
        mk(raisons, 'distance', 'Il reste peu de distance, mais assez pour tenter', 1.5 * fenetre);
        mk(raisons, 'agressif', 'Mon tempérament est agressif', 2.3 * prof.agressivite);
        if (p.groupe.sprinteurDangereux)
          mk(raisons, 'sprinteur', `${p.groupe.sprinteurLetter} est un sprinteur dangereux dans le groupe`, 1.0 * clamp((p.groupe.meilleurePointe - prof.pointe) / 0.3, 0, 1));
        mk(raisons, 'explosivite', "Mon explosivité est basse", -5 * it.explosiviteBasse);
        mk(raisons, 'tropTot', 'Trop tôt : il reste trop de kilomètres', -4 * clamp((d - dmax) / dmax, 0, 1));
        mk(raisons, 'peuFrais', 'Trop de coureurs sont encore frais pour que ça passe', -2 * frais);
        mk(raisons, 'dejaEssaye', "Je viens déjà d'essayer", -4.5 * dernier);
        mk(raisons, 'pression', "Le peloton revient : d'abord rouler", -2.5 * it.pression * (1 - prof.agressivite * 0.5));
        if (r.intent.kind === 'attaquer' && !r.intent.sprint) {
          const chasseur = w.groupe.ordre.filter((o) => o !== r).reduce((m, o) => Math.max(m, o.x), -1e9);
          const avance = r.x - chasseur;
          mk(raisons, 'passe', `Je suis parti et j'ai ${Math.max(0, Math.round(avance))} m d'avance : ça passe`, 4 * clamp(avance / 25, 0, 1));
          mk(raisons, 'suivi', "On me suit : ça ne passe pas", -3 * clamp(1 - avance / 15, 0, 1));
        }
        if (d <= sprintD && d > 0) mk(raisons, 'sprint', `Il reste ${Math.round(d)} m : je lance mon sprint`, 9);
        break;
      }
      case 'suivre': {
        const a = p.groupe.attaque;
        if (!a) vetos.push("Personne n'attaque");
        if (cuit) vetos.push('Je suis cuit : je ne peux pas suivre');
        if (sansExplosif) vetos.push("Je n'ai plus d'explosivité");
        if (!p.moi.dansGroupe) vetos.push("Je suis lâché");
        mk(raisons, 'rival', `${a ? a.letter : 'Le coureur'} est un rival direct`, 2.0 * (a ? a.danger : 0.6));
        mk(raisons, 'frais', 'Je suis encore frais', 2.0 * clamp((r.E - 0.3) / 0.4, 0, 1));
        mk(raisons, 'proche', "Il reste peu de distance : je ne peux pas le laisser partir", 3.0 * (1 - smoothstep(3000, 9000, d)));
        mk(raisons, 'tropLoin', 'Il reste trop de kilomètres : le groupe va le reprendre', -2.5 * clamp((d - 9000) / 6000, 0, 1));
        mk(raisons, 'explosivite', "Mon explosivité est basse", -4 * it.explosiviteBasse);
        mk(raisons, 'cuit', 'Je suis cuit', -5 * it.reserveBasse);
        mk(raisons, 'sprint', 'Je garde mon explosivité pour le sprint', -3.0 * it.sprintFocus * (d > 1500 ? 1 : 0.3));
        mk(raisons, 'laisserPartir', 'Si je le laisse partir, je ne pourrai pas gagner au sprint', 3.0 * it.sprintFocus * (1 - smoothstep(1000, 3000, d)));
        if (a) mk(raisons, 'avance', `${a.letter} a déjà ${Math.round(a.avance)} m d'avance`, -1.5 * clamp((a.avance - 20) / 40, 0, 1));
        break;
      }
      case 'gerer': {
        if (p.moi.dansGroupe) vetos.push('Je suis encore dans le groupe');
        mk(raisons, 'lache', 'Je ne peux plus suivre le groupe', 1.5);
        mk(raisons, 'reserve', 'Ma réserve est basse', 3 * it.reserveBasse);
        mk(raisons, 'loin', 'Le groupe est loin devant', 3.5 * clamp(p.moi.ecartAuGroupe / 300, 0, 1));
        break;
      }
      case 'revenir': {
        if (p.moi.dansGroupe) vetos.push('Je suis encore dans le groupe');
        if (cuit) vetos.push('Je suis cuit : je ne peux pas revenir');
        mk(raisons, 'ecart', 'Le groupe est tout proche', 4 * clamp(1 - p.moi.ecartAuGroupe / 250, 0, 1));
        mk(raisons, 'arrivee', "L'arrivée est proche : je me bats jusqu'au bout", 2 * (1 - smoothstep(1500, 5000, d)));
        mk(raisons, 'sprint', 'Je garde mon explosivité pour le sprint', -1.5 * it.sprintFocus);
        mk(raisons, 'jus', "Il me reste du jus", 3 * clamp((r.E - 0.15) / 0.3, 0, 1));
        mk(raisons, 'cout', 'Revenir coûte cher', -1.0);
        break;
      }
    }
    out.push({ intention: k, score: raisons.reduce((s, q) => s + q.valeur, 0), raisons, vetos });
  }
  return out;
}

export const nomProfil = (r: Rider) => `Coureur ${r.letter}, ${ARCHETYPE_LABEL[r.archetype]}`;
