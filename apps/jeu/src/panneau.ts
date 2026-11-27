import type { EntreeTrace, NomEtage, Raison, TraceDecision, Volonte, Volontes } from '@pedale/sim';
import {
  ecartSelonUnite, lignesDonnee, nomGrandeur, secondes, texteCadre, valeurSelonUnite, valeurVisee,
} from './format.ts';

type Enfant = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, classe: string | null, ...enfants: Enfant[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  for (const x of enfants) e.append(x); // append(string) crée un nœud texte : pas d'injection HTML
  return e;
}

const ETAGES: readonly { nom: NomEtage; titre: string; recoit: string; produit: string }[] = [
  { nom: 'percevoir', titre: 'Percevoir', recoit: 'l’observation du monde', produit: 'le perçu' },
  { nom: 'interpreter', titre: 'Interpréter', recoit: 'le perçu', produit: 'les croyances' },
  { nom: 'vouloir', titre: 'Vouloir', recoit: 'les croyances', produit: 'les volontés' },
  { nom: 'agir', titre: 'Agir', recoit: 'les volontés', produit: 'les commandes' },
];

const liste = (lignes: readonly string[]): HTMLElement => el('ul', 'lignes', ...lignes.map((l) => el('li', null, l)));

function raisons(rs: readonly Raison[]): HTMLElement {
  return el('ul', 'raisons', ...rs.map((r) => el('li', null, el('span', 'explication', r.explication), el('code', 'code', r.code))));
}

// ---- Vouloir : trois niveaux ----
const NIVEAUX = [
  { cle: 'objectif', titre: 'Objectif', horizon: 'l’étape' },
  { cle: 'intention', titre: 'Intention', horizon: 'quelques minutes' },
  { cle: 'manoeuvre', titre: 'Manœuvre', horizon: 'quelques secondes' },
] as const;

function niveau(v: Volonte, titre: string, horizon: string, instant_s: number): HTMLElement {
  const cause = v.raisons.find((r) => r.code.startsWith('reevaluation:'));
  const reevalue = v.evalueeA_s === instant_s;
  const autres = v.raisons.filter((r) => r !== cause);
  return el(
    'div', `niveau${reevalue ? ' reevalue' : ''}`,
    el('div', 'niveau-tete',
      el('strong', null, titre), el('span', 'horizon', ` · horizon : ${horizon}`),
      el('span', reevalue ? 'badge neuf' : 'badge garde', reevalue ? 'réévalué maintenant' : `gardé (évalué à t = ${secondes(v.evalueeA_s)})`)),
    el('div', 'but', v.but.replaceAll('_', ' ')),
    reevalue && cause ? el('div', 'cause', 'Pourquoi réévalué : ', cause.explication) : '',
    raisons(autres),
    v.cadre.length > 0 ? el('div', 'meta', 'Cadre donné au niveau d’en dessous : ', texteCadre(v.cadre)) : '',
    v.visees.length > 0
      ? el('div', 'meta', 'Visées : ', v.visees.map((x) => `${nomGrandeur(x.grandeur)} ${valeurVisee(x.grandeur, x.valeur)}`).join(' ; '))
      : '',
    v.impossibilite ? el('div', 'impossibilite', 'Impossibilité : ', v.impossibilite.explication) : '',
  );
}

function pile(v: Volontes): HTMLElement {
  return el('div', 'pile', ...NIVEAUX.map((n) => niveau(v[n.cle], n.titre, n.horizon, v.instant_s)));
}

// ---- Perçu / réel ----
function percuReel(t: TraceDecision): HTMLElement {
  const lignes = t.ecartsPercuReel.map((e) =>
    el('tr', null,
      el('th', null, e.grandeur === 'reserveLongue' ? 'réserve de fond' : e.grandeur),
      el('td', null, valeurSelonUnite(e.percu, e.unite)),
      el('td', null, valeurSelonUnite(e.reel, e.unite)),
      el('td', null, ecartSelonUnite(e))));
  return el('section', 'carte',
    el('h3', null, 'Perçu et réel, côte à côte'),
    el('p', 'meta', 'Le coureur ne voit que la colonne « perçu ». La colonne « réel » n’existe que dans la trace.'),
    el('table', 'tableau',
      el('thead', null, el('tr', null, el('th', null, ''), el('th', null, 'perçu'), el('th', null, 'réel'), el('th', null, 'écart'))),
      el('tbody', null, ...lignes)));
}

function etage(def: (typeof ETAGES)[number], rang: number, e: EntreeTrace): HTMLElement {
  const corps: Enfant[] = [
    el('h3', null, el('span', 'rang', String(rang)), def.titre),
    el('p', 'flux', 'reçoit ', el('em', null, def.recoit), ' → produit ', el('em', null, def.produit)),
    el('p', 'resume', `« ${e.resume} »`),
  ];
  if (e.produit.etage === 'volontes') {
    corps.push(el('h4', null, 'Les trois niveaux'), pile(e.produit));
  } else {
    corps.push(el('h4', null, 'Reçu'), liste(lignesDonnee(e.recu)), el('h4', null, 'Produit'), liste(lignesDonnee(e.produit)), el('h4', null, 'Raisons'), raisons(e.raisons));
  }
  return el('section', `carte etage-${def.nom}`, ...corps);
}

/** Affiche une décision complète : les quatre étages, leurs raisons, et le perçu face au réel. */
export function rendrePanneau(cible: HTMLElement, t: TraceDecision | undefined): void {
  cible.replaceChildren();
  if (!t) {
    cible.append(el('p', 'vide', 'Aucune décision enregistrée pour l’instant.'));
    return;
  }
  cible.append(
    el('h2', null, 'Pourquoi ?'),
    el('p', 'sous-titre', `Décision du coureur « ${t.coureurId} » à t = ${secondes(t.instant_s)}`),
  );
  const grille = el('div', 'grille');
  ETAGES.forEach((def, i) => {
    grille.append(etage(def, i + 1, t[def.nom]));
    if (def.nom === 'interpreter') grille.append(percuReel(t)); // complète la première rangée
  });
  cible.append(grille);
}
