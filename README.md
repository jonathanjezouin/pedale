# Pédale

Jeu de cyclisme sur route, vue 100 % de dessus. On incarne un seul coureur, de la première course à la fin de carrière.

- Conception fonctionnelle : [`docs/v0.0.1-design-fonctionnel.md`](docs/v0.0.1-design-fonctionnel.md)
- Choix techniques : [`docs/stack-technique.md`](docs/stack-technique.md)
- Attributs du coureur (niveaux WorldTour) : [`docs/v0.0.3-attributs.md`](docs/v0.0.3-attributs.md)
- Validation statistique du POC v0.0.1 : [`docs/v0.0.1-validation.md`](docs/v0.0.1-validation.md)
- Route, vent et placement : [`docs/v0.0.1-trajectoires.md`](docs/v0.0.1-trajectoires.md)
- Huit coureurs, pas de peloton : [`docs/v0.0.1-sans-peloton.md`](docs/v0.0.1-sans-peloton.md)
- Comportement du coureur : frontières entre étages, contrat Vouloir → Agir, intentions (validé) : [`docs/v0.0.3-comportement.md`](docs/v0.0.3-comportement.md)
- Chaîne complète sur un scénario de bout en bout (validé) : [`docs/v0.0.3-chaine.md`](docs/v0.0.3-chaine.md)
- Génération de parcours (profil, tracé, évaluation) — spécification : [`docs/v0.0.3-parcours.md`](docs/v0.0.3-parcours.md) ; module implémenté (v0.0.4) : [`docs/v0.0.4-parcours.md`](docs/v0.0.4-parcours.md)
- **Plan de développement jusqu'à la v0.1.0** : [`docs/v0.1.0-plan.md`](docs/v0.1.0-plan.md)
- POC graphique initial (HTML seul) : [`docs/poc-graphique/`](docs/poc-graphique/index.html)

## v0.0.5 — huit coureurs, une étape avec relief ; raisonnement individuel ; module de parcours

Huit coureurs qui s'affrontent, chacun pour soi, sur une route qui tourne avec un vent fixe (pas de peloton poursuivant ; des groupes se forment, c'est tout). Chaque coureur
raisonne par étages — **percevoir → interpréter → vouloir → agir** — avec 7 intentions (s'abriter, se placer, participer, attaquer, suivre, revenir, gérer) et des raisons nommées ; il ne connaît pas les autres, il les déduit de ce qu'il voit.
Sur une **étape générée** (plate, vallonnée ou montagne, 20 à 250 km), la route porte son relief : la pente entre dans le bilan de forces, l'abri s'effondre en côte, la descente est limitée par la route, le coureur connaît le profil devant lui. Sans étape, c'est la fin d'étape plate du POC.
Cliquer un coureur (ou `Tab`) affiche **pourquoi** il fait ce qu'il fait.

### Lancer

```bash
npm install
npm run dev          # jeu dans le navigateur : http://localhost:5173  (?seed=1234&biome=desert)
npm test             # tests du cœur de simulation (Vitest)
npm run atelier      # atelier de parcours : http://localhost:5174  (?km=150&type=montagne&finale=descente&seed=7)
npm run parcours -- --n 1000   # validation du générateur de parcours : 1 000 étapes par type
npm run etapes -- --n 30 --km 100   # 30 étapes courues par type : durées, étirement en côte, abri, vainqueurs par profil et par type physique
npm run batch -- --n 500    # 500 courses sans affichage + critères de réussite (§6.6) ; --vent face --route droite pour l'ancien mode
npm run build        # build web (apps/game/dist)
npm run electron     # build + fenêtre Electron
npm run dist         # installeur Windows (electron-builder) — à lancer sous Windows
```

Raccourcis : `Espace` pause · `1-5` vitesse ×1/×4/×16/×64/×256 · `E` étape (aucune → plate → vallonnée → montagne) · `Tab` coureur suivant · `←` `→` coureur devant / derrière au classement · `N` nouvelle course · `B` biome · `A` aspiration (curseur) · `V` vent fixe / de face · `R` route qui tourne / droite · molette = zoom.
Paramètres d'URL : `?seed=1234&biome=desert&vent=face&route=droite`. **Étape** : `?etape=montagne&km=150&seed=7` (en attendant le menu de la v0.0.6). **Relecture** : `?seed=9&t=1200&pause=1` ouvre la course 9 à 20 min, en pause (puis `Espace` / `1` pour la regarder, `Tab` / `←` `→` pour choisir un coureur et lire « pourquoi ? »).

### Organisation

```
packages/sim/    cœur de simulation pur TypeScript (aucune dépendance) : physique, perception, décision, action, trace
packages/parcours/ génération et évaluation de parcours (profil altimétrique, tracé en plan), pur TypeScript
apps/atelier/    atelier de parcours (page de développement)
tools/batch/     courses en masse sans affichage, validation des critères de réussite
apps/game/       rendu PixiJS + interface HTML + coquille Electron (Windows / Steam)
docs/            conception, choix techniques, validation
```
