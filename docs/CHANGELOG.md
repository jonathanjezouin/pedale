# Journal des versions

## v0.0.3 (en cours)
- **Attributs** : conception documentée (`docs/v0.0.3-attributs.md`) : niveaux ancrés WorldTour, FTP en W/kg au centre, pas de score affiché, durabilité en % du FTP après 3000 kJ.
- **Calibration** (`calibration.ts`) : ancrages et niveaux en données ; coureurs du POC recalés WorldTour (FTP 5,4-6,0 W/kg, pointe jusqu'à 1800 W).
- Rapport batch § 6 : répartition par niveau et profils incohérents. Interface : FTP en W/kg et son niveau ; plus de pourcentages de générosité/agressivité.
- Spécification de la **génération de parcours** (profil altimétrique, tracé, évaluation d'étape) : `docs/v0.0.3-parcours.md`. Conception seulement, rien n'est codé.

## v0.0.2
- **Prise de roue plus empressée** : le suiveur vise une roue à ~0,5 m, rattrape plus vite et accepte de dépasser un peu sa puissance soutenable pour reprendre l'abri (jusqu'à +22 %) ; le coureur qui passe devant se rabat plus tôt et dépasse moins fort. Écart moyen entre roues dans la file : 1,32 m → 0,96 m ; 2 s après un relais, médiane 1,6 m → 1,0 m et p90 7,3 m → 3,3 m.
- **Aspiration** : modèle documenté (`docs/v0.0.2-aspiration.md`), paramètres regroupés dans `ASPIRATION`, **curseur « Aspiration »** (touche `A`) qui affiche le sillage de chaque coureur, « abri x % » dans la liste des coureurs.
- Plus de lettres ni de pastilles sur la course : seule la lettre du coureur sélectionné.
- Passage en v0.0.2 (numéros de version, titre de l'interface).

## v0.0.1
- Cœur de simulation (percevoir / interpréter / vouloir / agir), 7 intentions, raisons nommées, veto, trace « pourquoi ? ».
- Route qui tourne, vent fixe, placement continu, éventails, silhouettes et public à l'échelle.
- Huit coureurs sans peloton ni groupe (décision du propriétaire du projet).
- Caméra sur le coureur sélectionné, flèches gauche/droite par classement.
