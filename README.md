# Pédale

Jeu de cyclisme sur route, vue 100 % de dessus. On incarne un seul coureur, de la première course à la fin de carrière.

- Conception fonctionnelle : [`docs/v0.0.1-design-fonctionnel.md`](docs/v0.0.1-design-fonctionnel.md)
- Choix techniques : [`docs/stack-technique.md`](docs/stack-technique.md)
- Validation statistique du POC v0.0.1 : [`docs/v0.0.1-validation.md`](docs/v0.0.1-validation.md)
- Route, vent et placement : [`docs/v0.0.1-trajectoires.md`](docs/v0.0.1-trajectoires.md)
- Huit coureurs, pas de peloton : [`docs/v0.0.1-sans-peloton.md`](docs/v0.0.1-sans-peloton.md)
- POC graphique initial (HTML seul) : [`docs/poc-graphique/`](docs/poc-graphique/index.html)

## POC v0.0.1 — une échappée sur le plat

Huit coureurs qui s'affrontent, chacun pour soi, sur une route qui tourne avec un vent fixe (pas de peloton, pas de groupe). Chaque coureur
raisonne par étages — **percevoir → interpréter → vouloir → agir** — avec 7 intentions et des raisons nommées.
Cliquer un coureur (ou `Tab`) affiche **pourquoi** il fait ce qu'il fait.

### Lancer

```bash
npm install
npm run dev          # jeu dans le navigateur : http://localhost:5173  (?seed=1234&biome=desert)
npm test             # tests du cœur de simulation (Vitest)
npm run batch -- --n 500    # 500 courses sans affichage + critères de réussite (§6.6) ; --vent face --route droite pour l'ancien mode
npm run build        # build web (apps/game/dist)
npm run electron     # build + fenêtre Electron
npm run dist         # installeur Windows (electron-builder) — à lancer sous Windows
```

Raccourcis : `Espace` pause · `1-4` vitesse ×1/×4/×16/×64 · `Tab` coureur suivant · `←` `→` coureur devant / derrière au classement · `N` nouvelle course · `B` biome · `V` vent fixe / de face · `R` route qui tourne / droite · molette = zoom.
Paramètres d'URL : `?seed=1234&biome=desert&vent=face&route=droite`.

### Organisation

```
packages/sim/    cœur de simulation pur TypeScript (aucune dépendance) : physique, perception, décision, action, trace
tools/batch/     courses en masse sans affichage, validation des critères de réussite
apps/game/       rendu PixiJS + interface HTML + coquille Electron (Windows / Steam)
docs/            conception, choix techniques, validation
```
