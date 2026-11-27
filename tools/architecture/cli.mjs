import { chargerFichiersReels } from './charger.mjs';
import { verifierTout } from './regles.mjs';

const fichiers = chargerFichiersReels();
const violations = verifierTout(fichiers);
if (violations.length > 0) {
  console.error(`Architecture : ${violations.length} violation(s)\n` + violations.map((v) => `  - ${v}`).join('\n'));
  process.exit(1);
}
console.log(`Architecture : OK (${fichiers.length} fichiers vérifiés)`);
