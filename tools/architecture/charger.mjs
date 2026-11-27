import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function lister(dossier) {
  const sorties = [];
  for (const nom of readdirSync(dossier)) {
    const complet = path.join(dossier, nom);
    if (statSync(complet).isDirectory()) sorties.push(...lister(complet));
    else if (nom.endsWith('.ts')) sorties.push(complet);
  }
  return sorties;
}

/** Fichiers réels de sim et de l'application, avec chemins relatifs à la racine (séparateur « / »). */
export function chargerFichiersReels() {
  return ['packages/sim/src', 'apps/jeu/src'].flatMap((d) =>
    lister(path.join(RACINE, d)).map((complet) => ({
      chemin: path.relative(RACINE, complet).split(path.sep).join('/'),
      contenu: readFileSync(complet, 'utf8'),
    })),
  );
}
