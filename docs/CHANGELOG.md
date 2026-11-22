# Journal des versions

## v0.0.3
### v0.0.3b — perception, intentions finales, relais par l'arrière
- **Un coureur ne connaît plus les autres, il les déduit** (`observation.ts`) : une fois par seconde il voit les coureurs à portée (45 m devant, 15 m derrière) avec bruit ; il retient qui roule devant, qui accélère fort, et en déduit rouleur / suiveur / inconnu, danger supposé, état apparent. `archetype`, `pointe` et temps de tête des autres ne sont plus accessibles. Sa propre fatigue est ressentie avec bruit et biais. L'attaque d'un rival est perçue (avec délai), plus signalée à tous.
- **Les 7 intentions finales** : s'abriter, **se placer** (nouveau), **participer**, attaquer, suivre, revenir, gérer. `relais` et `rabattre` disparaissent. Le contrat porte une **place visée** (garder, tête, avant, queue).
- **Le relais se transmet par l'arrière** : le meneur s'écarte et recule en roue libre, le suivant hérite de la tête et choisit selon ses raisons ; un volontaire peut passer devant un groupe trop lent. Dépassements simultanés : ≈ 12 % du temps de dépassement.
- **Abri ressenti et compétence d'exécution** : recherche locale de l'abri (a priori grossier, pas latéral, comparaison), écart de confort / précision / délai de réaction dérivés de l'expérience.
- **Garde-fous techniques** : durée maximale (course neutralisée, comptée par le batch), gestes d'exécution qui n'aboutissent pas déclarés finis.
- **Atelier de relecture** : `?seed=9&t=1200&pause=1` ouvre une course à un instant donné, en pause. Panneau « pourquoi ? » : dispositions déduites, place visée, effort ressenti.
- Batch (300 courses, v0.0.3a → v0.0.3b) : orage d'attaques 56 → 0 % ; attaques par course 9,9 → 2,6 ; vitesse moyenne 37,8 → 36,5 km/h ; changements de tête 61 → 75 ; séquence en tête 97 → 360 s ; part du temps en tête rouleur / sprinteur / attaquant / opportuniste 29 / 16 / 29 / 26 → 35 / 10 / 31 / 24 % ; **victoires 14 / 17 / 48 / 22 → 17 / 5 / 67 / 11 %** (déséquilibre du modèle de sprint, voir le plan : v0.0.3c) ; aucune course neutralisée.
- Tests : 24 → 42 (perception, déduction, abri ressenti, relais par l'arrière, retrait des causes, garde-fou).
- Passage en v0.0.3 (numéros de version, titre de l'interface).

### v0.0.3a — physique et contrat Vouloir → Agir
- **Aspiration en cloche** (σ croissant en aval) et **cumul multiplicatif** (3 sillages au plus, plafond 48 %) ; σ0 calé à 0,35 m (écart moyen entre roues 1,41 → 1,51 m sur 40 courses).
- **FTP partout** : `Profile.cp` devient `Profile.ftp` (le seuil au-dessus duquel l'explosivité se vide) ; zones Z1-Z7 en données (`paliers.ts`), frontière Z4/Z5 à 100 % du FTP.
- **Contrat `Intent`** : Vouloir choisit l'effort visé (part du FTP, ou « ce qu'il faut pour tenir la roue ») et les limites `effortMax` / `fatigueMax` (fatigue = 1 − E, plus basse quand il reste de la route) ; Agir convertit en watts (`wattsPour`) et **déclare** `limite-atteinte`, `fin-burst`, `rejoint`, `passage-termine`, `roue-perdue`. Agir garde son propre état (`Rider.geste`) et ne modifie plus l'intention.
- **Générosité et réciprocité retirées** (profil, raisons `reciprocite` / `egoisme` / `genereux`, plancher d'allure de croisière) ; en tête, l'allure plancher est l'effort visé (83 % du FTP).
- **Groupe** : vue dérivée (`Vue.groupes`), perçue (« groupe de N »). `pointe` normalisée par `POINTE_REF`.
- Interface : le panneau « pourquoi ? » affiche l'effort ressenti (palier), le groupe, l'effort visé et les limites.
- Batch (300 courses, avant → après) : durée 32 → 32 min ; changements de tête 54 → 61 ; part du temps en tête rouleur / sprinteur / attaquant / opportuniste 46 / 9 / 27 / 18 → 29 / 16 / 29 / 26 % ; victoires 23 / 21 / 46 / 10 → 14 / 17 / 48 / 22 % ; orage d'attaques 46 → 56 % ; décrochages 7,3 → 9,1 par course ; aucune course bloquée. Les écarts d'équilibre viennent surtout du retrait de la générosité ; ils seront traités avec les attaques en v0.0.3b.
- Tests : 13 → 24.
- **Docs reprises et rendues cohérentes** : intentions finales (s'abriter, se placer, participer, attaquer, suivre, revenir, gérer), **FTP** comme seul nom du seuil (plus de `cp` ; frontière Z4/Z5 à 100 % du FTP), **groupe** remis comme vue dérivée, **générosité et réciprocité retirées**, autres coureurs **déduits du comportement seul**, départ en paquet, fourchettes de parcours selon la distance. Plan de développement jusqu'à la v0.1.0 : `docs/v0.1.0-plan.md`.
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
