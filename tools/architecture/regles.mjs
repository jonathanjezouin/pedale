// Règles d'architecture (docs/architecture.md §2). Fonctions pures : elles reçoivent
// des fichiers { chemin, contenu } et rendent la liste des violations.
import path from 'node:path/posix';

const SIM_SRC = 'packages/sim/src/';
const APP_SRC = 'apps/jeu/src/';

/** Couches de sim -> couches qu'elles ont le droit d'importer (elles-mêmes incluses). */
export const AUTORISATIONS = {
  contrats: ['contrats'],
  monde: ['monde', 'contrats'],
  esprit: ['esprit', 'contrats'],
  trace: ['trace', 'contrats'],
  moteur: ['moteur', 'contrats', 'monde', 'esprit', 'trace'],
  // index.ts de sim : la porte d'entrée de l'application (ni monde ni esprit)
  'sim-index': ['contrats', 'trace', 'moteur'],
  // application : uniquement la porte d'entrée de sim, jamais monde/ ni esprit/
  app: ['app', 'sim-index', 'contrats', 'moteur', 'trace'],
};

/** Couche d'un fichier (ou null s'il est hors périmètre). */
export function coucheDe(chemin) {
  if (chemin === `${SIM_SRC}index.ts`) return 'sim-index';
  if (chemin.startsWith(SIM_SRC)) {
    const c = chemin.slice(SIM_SRC.length).split('/')[0];
    return c in AUTORISATIONS && c !== 'sim-index' && c !== 'app' ? c : 'inconnue';
  }
  if (chemin.startsWith(APP_SRC)) return 'app';
  return null;
}

function retirerCommentaires(texte) {
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Spécificateurs importés (import ... from, import 'x', import('x'), export ... from). */
export function importsDe(contenu) {
  const texte = retirerCommentaires(contenu);
  const trouves = [];
  const motif = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g;
  for (const m of texte.matchAll(motif)) trouves.push(m[2]);
  return trouves;
}

/** Couche visée par un import depuis `chemin`, ou 'externe'. */
function cibleDe(chemin, specifieur) {
  if (specifieur === '@pedale/sim') return 'sim-index';
  if (specifieur.startsWith('@pedale/sim/')) {
    return coucheDe(`packages/sim/${specifieur.slice('@pedale/sim/'.length)}`) ?? 'externe';
  }
  if (specifieur.startsWith('.')) {
    const cible = path.normalize(path.join(path.dirname(chemin), specifieur));
    const couche = coucheDe(cible.endsWith('.ts') ? cible : `${cible}.ts`) ?? coucheDe(`${cible}/index.ts`);
    return couche ?? 'hors-perimetre';
  }
  return 'externe';
}

export function verifierDependances(fichiers) {
  const violations = [];
  for (const { chemin, contenu } of fichiers) {
    const source = coucheDe(chemin);
    if (source === null) continue;
    if (source === 'inconnue') {
      violations.push(`${chemin} : dossier de sim hors des couches prévues`);
      continue;
    }
    for (const spec of importsDe(contenu)) {
      const cible = cibleDe(chemin, spec);
      if (cible === 'externe') {
        // sim n'a aucune dépendance externe ; l'application peut en avoir
        if (source !== 'app') violations.push(`${chemin} : import externe interdit dans sim ('${spec}')`);
        continue;
      }
      if (cible === 'hors-perimetre') {
        violations.push(`${chemin} : import hors du périmètre vérifié ('${spec}')`);
        continue;
      }
      if (!AUTORISATIONS[source].includes(cible)) {
        violations.push(`${chemin} : la couche « ${source} » ne peut pas importer « ${cible} » ('${spec}')`);
      }
    }
  }
  return violations;
}

const INTERDITS_SIM = [
  [/\bMath\.random\b/, 'Math.random'],
  [/\bDate\b/, 'Date'],
  [/\bperformance\.now\b/, 'performance.now'],
];

export function verifierInterdits(fichiers) {
  const violations = [];
  for (const { chemin, contenu } of fichiers) {
    if (!chemin.startsWith(SIM_SRC)) continue;
    const texte = retirerCommentaires(contenu);
    for (const [motif, nom] of INTERDITS_SIM) {
      if (motif.test(texte)) violations.push(`${chemin} : « ${nom} » interdit dans sim (hasard et temps viennent du moteur)`);
    }
  }
  return violations;
}

// Toute propriété numérique des contrats porte son unité (SI) dans son nom.
const SUFFIXES_UNITE = /_(m|s|w|j|kg|rad|m_s|m_s2|rad_m|rad_s|ratio|n)$/;

// Exceptions explicites : l'unité est portée par un champ voisin, pas par le nom du nombre.
const EXCEPTIONS_UNITE = {
  'packages/sim/src/contrats/volontes.ts': ['min', 'max', 'valeur'], // Borne, Visee : unité = celle de `grandeur`
  'packages/sim/src/contrats/trace.ts': ['percu', 'reel'], // EcartPercuReel : unité = champ `unite`
};

export function verifierUnites(fichiers) {
  const violations = [];
  for (const { chemin, contenu } of fichiers) {
    if (!chemin.startsWith(`${SIM_SRC}contrats/`)) continue;
    const texte = retirerCommentaires(contenu);
    for (const m of texte.matchAll(/\b([A-Za-z_]\w*)\??\s*:\s*number\b/g)) {
      if (!SUFFIXES_UNITE.test(m[1]) && !(EXCEPTIONS_UNITE[chemin] ?? []).includes(m[1])) {
        violations.push(`${chemin} : la grandeur « ${m[1]} » n'a pas d'unité dans son nom (_m, _s, _w, _m_s, _ratio, _n…)`);
      }
    }
  }
  return violations;
}

export function verifierTout(fichiers) {
  return [...verifierDependances(fichiers), ...verifierInterdits(fichiers), ...verifierUnites(fichiers)];
}
