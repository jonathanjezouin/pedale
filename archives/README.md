# Archives

## v0.0.2-poc — premier POC (huit coureurs sur le plat)

Tout ce qui avait été réalisé avant le redémarrage du projet, déplacé tel quel (historique git conservé) :
cœur de simulation (`packages/sim`), rendu PixiJS (`apps/game`), batch statistique (`tools/batch`), documents de conception et de validation (`docs`).

Pourquoi archivé : simulation, rendu, physique et décision avaient été construits ensemble ; quand un résultat était mauvais
(attaques en rafale, « grattage » au défilement…), impossible de dire quelle couche était en cause.
Le nouveau départ procède par chantiers validés un par un (voir `docs/chantiers.md`).

Ce qui est récupérable au fil des chantiers (à re-vérifier à chaque fois) : décor et silhouettes (`apps/game/src/scenery.ts`, `riders.ts`),
document de conception fonctionnelle (`docs/v0.0.1-design-fonctionnel.md`, toujours la référence de la vision), modèle d'aspiration (`docs/v0.0.2-aspiration.md`).
Le code archivé n'est pas exécuté par le projet courant.
