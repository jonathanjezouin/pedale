# Pédale — Choix techniques

> Décision prise avec le propriétaire du projet. Cible : **Steam, Windows uniquement**.

## Décision

**TypeScript, cœur de simulation pur, rendu 2D PixiJS, interface HTML/CSS, Electron pour Steam.**

| Couche | Choix | Raison |
|---|---|---|
| Simulation | TypeScript pur (`packages/sim`), générateur aléatoire seedé, aucune dépendance | Exécutable sans affichage (tests, batch de milliers de courses), déterministe, utilisable plus tard dans un worker pour l'accélération du temps et la simulation des étapes non jouées. La trace de décision est une donnée. |
| Rendu de course | PixiJS v8 (WebGL) ; décor procédural dessiné en canvas 2D puis uploadé en textures par tronçons | Style top-down du POC graphique réutilisé ; supportera un peloton de ~180 coureurs. |
| Interface | HTML/CSS | Meilleur qu'une UI de moteur de jeu pour l'interface dense à la Football Manager (carrière, contrats, texte). |
| Build | Vite + npm workspaces | Cycle de développement rapide. |
| Desktop / Steam | Electron + `steamworks.js` (succès, cloud, overlay) + electron-builder (NSIS/zip) | Voie éprouvée pour publier sur Steam. |
| Tests | Vitest (unitaires) + `tools/batch` (statistiques sur N courses) | Les critères de réussite du POC sont statistiques. |

Pourquoi pas un moteur de jeu (Godot, Unity) : le cœur du jeu est une simulation de décision, pas du rendu ; ce stack permet de tout vérifier en ligne de commande et en navigateur sans écran ; et l'interface de gestion est bien plus naturelle en HTML.

## Principes d'architecture

1. **La simulation ne connaît pas l'affichage.** `packages/sim` n'importe rien (ni DOM, ni PixiJS). L'application ne fait que lire son état.
2. **Pas de `Math.random` dans le cœur** : tout est rejouable à partir d'une seed. Le bruit de perception (plus tard) sera lui aussi seedé.
3. **Les étages du raisonnement sont des fonctions séparées** (`percevoir`, `interpreter`, `evaluer`, `agir`) pour pouvoir y brancher le bruit (percevoir/interpréter) sans toucher à « Vouloir ».
4. **La trace est un résultat de première classe** : chaque décision produit une structure (perçu, réel, interprété, évaluations de toutes les intentions avec veto et raisons, action) ; l'UI, les tests et le batch la lisent.
5. **Pas fixe** (0,25 s) : l'accélération du temps consiste à enchaîner plusieurs pas par image ; la simulation d'étapes non jouées utilisera les mêmes modèles.

## Limites connues / à surveiller

- Electron : ~150 Mo et plus de RAM qu'un moteur natif — acceptable pour ce type de jeu.
- Intégration Steam (`steamworks.js`) : **non testée** en v0.0.1 (nécessite le client Steam et un AppID). Le code est en place dans `apps/game/electron/main.cjs`, désactivé par défaut.
- L'installeur Windows (`npm run dist`) doit être produit sous Windows ; il n'a pas été exécuté dans l'environnement de développement (Linux).
- Performance avec ~180 coureurs et des étapes de 4-5 h : à mesurer ; le cœur pur en worker est la voie prévue.
- Si un jour il fallait changer de moteur, la logique de simulation se porte ; le rendu se réécrit.
