# Archives

## v0.1.2 — travail réalisé avant le redémarrage du projet

État de `main` en **v0.1.2**, déplacé tel quel (l'historique git de toutes les versions v0.0.1 à v0.1.2 est conservé) :
cœur de simulation (`packages/sim`), rendu PixiJS (`apps/game`), atelier et module de parcours, bancs d'essai et validations (`tools/batch`), documents de conception et de validation (`docs`).

Pourquoi archivé : simulation, rendu, physique et décision avaient été construits ensemble ; quand un résultat était mauvais
(attaques en rafale, « grattage » au défilement, comportement de groupe…), il était difficile de dire quelle couche était en cause.
Le nouveau départ procède par chantiers validés un par un (voir `docs/chantiers.md`) avec une structure de code commune (`docs/architecture.md`).

Le code archivé n'est pas exécuté par le projet courant ; il se relance depuis `archives/v0.1.2/` (`npm install` puis `npm run dev`).

### Ce qui est récupérable au fil des chantiers (à re-vérifier à chaque fois)

| Pour le chantier | Dans l'archive (`archives/v0.1.2/`) |
|---|---|
| 1 Architecture | `docs/v0.0.3-comportement.md` (frontières entre étages, contrat Vouloir → Agir), `docs/v0.0.3-chaine.md` (chaîne complète sur un scénario) |
| 2 Route | `docs/v0.0.3-parcours.md` (spécification), `docs/v0.0.4-parcours.md` (module implémenté), `docs/v0.0.5-pente.md`, `docs/v0.0.6-menu.md`, atelier de parcours ; décor et silhouettes : `apps/game/src/scenery.ts`, `riders.ts` |
| 3 Physique et énergie | `docs/v0.0.3-attributs.md` (attributs, calibration WorldTour), `docs/v0.0.7-fatigue.md` |
| 6 Aspiration | `docs/v0.0.2-aspiration.md`, banc d'essai de groupe (`docs/v0.1.2-groupe.md`) |
| 7 à 8 Groupe, décision | `docs/v0.1.2-groupe.md`, `docs/v0.1.0-plan.md`, `docs/v0.1.0-validation.md` |
| Vision | `docs/v0.0.1-design-fonctionnel.md` (reste la référence) |
