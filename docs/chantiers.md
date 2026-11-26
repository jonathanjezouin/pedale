# Pédale — Chantiers et critères de validation

> Document de pilotage. La vision fonctionnelle reste celle de `archives/v0.0.2-poc/docs/v0.0.1-design-fonctionnel.md`.
> Ici : dans quel ordre on construit, et à quoi on reconnaît qu'une étape est terminée.

## 1. Méthode

1. **Une seule application**, qui grandit chantier après chantier. Pas de page séparée par chantier : chaque chantier ajoute des fonctions et un **panneau de diagnostic** dans la même appli.
2. **Un chantier n'est démarré que lorsque le précédent est validé** par le propriétaire du projet.
3. Un chantier se découpe en **unités fonctionnelles** (UF), chacune avec ses propres critères de complétude. Le premier chantier est découpé ici ; les suivants le seront au moment de les démarrer.
4. **Chaque critère est vérifiable** de l'une de ces trois façons (indiquée entre crochets) :
   - **[auto]** test automatique ou mesure chiffrée, exécutable sans écran ;
   - **[visuel]** capture ou vidéo à regarder, avec ce qu'il faut y voir ;
   - **[valid]** essai manuel par le propriétaire, avec un scénario précis.
5. **Une UF est terminée** quand tous ses critères passent et que l'appli tourne. Une couche déjà validée ne doit jamais régresser : les tests des UF précédentes restent exécutés.
6. **Vérité unique** : la simulation (TypeScript pur, déterministe par seed) ne connaît pas l'affichage ; l'affichage ne fait que la lire. Quand quelque chose est faux, on sait ainsi dans quelle couche chercher.
7. **Pas de gras dans le périmètre** : on ne traite pas ce qui appartient à un chantier suivant, même si c'est tentant.
8. À la fin de chaque chantier : une courte note (ce qui a été fait, chiffres de validation, ce qu'on retient de l'archive) et une version.

## 2. Stack retenue

| Couche | Choix |
|---|---|
| Simulation | TypeScript pur, générateur aléatoire seedé, aucune dépendance, aucun `Math.random` |
| Rendu | PixiJS v8 (WebGL) en point de départ ; **le défilement est une UF à part entière (1.6) avec des critères mesurables**. Si les critères ne passent pas, on change l'approche de rendu avant d'aller plus loin |
| Interface | HTML/CSS (panneaux, diagnostic) |
| Build / tests | Vite, Vitest ; workspace npm avec un paquet `sim` et une application |
| Desktop / Steam | Electron plus tard (hors chantiers 1 à 8) |

Le choix du rendu est volontairement réversible : il n'engage que la couche d'affichage.

## 3. Vue d'ensemble

| # | Chantier | Résumé |
|---|---|---|
| 0 | Archivage et socle | Fait : l'existant est dans `archives/`, ce document existe |
| 1 | La route | Tracé réaliste, profil d'étape, défilement graphique robuste |
| 2 | Coureur seul : physique et énergie | Puissance, vitesse, pente, vent, deux réserves d'énergie |
| 3 | Coureur seul : estimation du reste à parcourir | Réguler son effort selon le profil à venir |
| 4 | Coureur seul : trajectoire | La ligne choisie sur la route et ses conséquences |
| 5 | Deux coureurs : aspiration | Abri, sillage, prise de roue |
| 6 | Le groupe | Relais, placement, éventails au vent de côté |
| 7 | La décision | Intentions, raisons nommées, trace « pourquoi ? » |
| 8 | Le joueur | Contrôle du coureur, brouillard de perception, radio |

---

## 4. Chantier 0 — Archivage et socle (fait)

- [x] Tout l'existant déplacé dans `archives/v0.0.2-poc/` avec son historique git, et un README qui explique pourquoi et ce qui est récupérable.
- [x] Ce document de chantiers.
- [ ] Squelette de l'appli (workspace, `npm test`, `npm run dev`) : créé au début de l'UF 1.1, pas avant.

---

## 5. Chantier 1 — La route

**But** : disposer d'une route réaliste (tracé + profil d'altitude) sur laquelle un coureur pourra rouler, et la regarder défiler sans défaut graphique, quelle que soit la longueur de l'étape.

**Critères du chantier entier**
- [auto] 1 000 routes générées avec des seeds différentes, pour chacun des types d'étape, sans échec, sans croisement du tracé, et respectant toutes les bornes de l'UF 1.2 et 1.3.
- [visuel] Sur 5 seeds par type d'étape, la route paraît plausible : pas de virage impossible, pas de ligne droite parfaite sur plus de la longueur autorisée, profil crédible.
- [valid] Je peux faire défiler une étape de bout en bout, aux vitesses d'accélération du temps prévues, sans scintillement, saccade ni coupure visible.
- [auto] Le défilement garde les performances de l'UF 1.6 sur une étape de 200 km.

### UF 1.1 — Géométrie de la route

**Contenu** : la route est définie par une abscisse curviligne `s` (mètres depuis le départ). À chaque `s` on sait donner : position `(x, y)`, cap, courbure, et le repère local (devant / à gauche).
Création du squelette de l'appli (workspace, tests, lancement).

**Critères**
- [auto] `position(s)` est continue : l'écart entre `s` et `s + 1 cm` est de 1 cm, à 1 mm près.
- [auto] Le cap est continu : aucun saut de cap supérieur à 0,01° entre deux points distants de 1 cm.
- [auto] La longueur totale annoncée correspond à la somme des segments, à 0,1 % près.
- [auto] `s` croissant implique un avancement le long du tracé, sans retour en arrière ni sur place.
- [auto] Résultats identiques à seed identique (déterminisme), sur deux exécutions.
- [auto] `npm test` et `npm run dev` fonctionnent depuis un clone neuf.

### UF 1.2 — Génération du tracé

**Contenu** : générer un tracé réaliste de route à partir d'une seed et d'un type d'étape (plaine, vallonné, montagne, éventuellement littoral). Virages larges, enchaînements, lacets de col, lignes droites de longueur variable.

**Critères**
- [auto] Rayon de courbure minimal respecté par type (ordre de grandeur : ≥ 150 m en plaine, ≥ 20 m en lacet de col ; valeurs exactes fixées au démarrage de l'UF et inscrites ici).
- [auto] Aucun croisement ni recouvrement du tracé avec lui-même à moins de 3 largeurs de route.
- [auto] Plus longue ligne droite : bornée par type d'étape (par exemple ≤ 5 km en plaine, ≤ 1 km en montagne).
- [auto] Longueur demandée respectée à 1 % près, pour des étapes de 20 à 250 km.
- [auto] Distribution des virages (nombre par km, angle moyen) différente et stable d'un type à l'autre, sur 1 000 seeds.
- [visuel] Planche de 12 tracés : aucun ne ressemble à une courbe lissée artificielle ou à un zigzag aléatoire.

### UF 1.3 — Profil d'étape

**Contenu** : altitude `z(s)` et pente `p(s)`, avec des tronçons nommés (plat, bosse, col, descente). Cohérence avec le tracé (lacets plutôt en montée de col).

**Critères**
- [auto] `z(s)` continue ; pente lissée : variation de pente bornée (pas de marche d'escalier).
- [auto] Pente maximale par type (par exemple ≤ 3 % en plaine, ≤ 12 % en col ; valeurs exactes inscrites ici au démarrage).
- [auto] Dénivelé positif cumulé conforme au type d'étape demandé (fourchette inscrite au démarrage).
- [auto] Les tronçons sont étiquetés sans trou ni chevauchement, et couvrent toute l'étape.
- [auto] Les lacets (courbure forte) apparaissent surtout sur des tronçons de montée.
- [visuel] Profil d'étape à la manière d'un profil de course : on reconnaît un col, une bosse, un plat.

### UF 1.4 — Route à deux dimensions : largeur et bords

**Contenu** : un point sur la route se repère par `(s, d)` : abscisse et décalage latéral. Largeur de la route, accotements. Conversion entre `(s, d)` et le monde.

**Critères**
- [auto] Aller-retour `(s, d)` → monde → `(s, d)` : erreur < 1 cm sur 10 000 points tirés.
- [auto] Décalage latéral extérieur d'un virage serré : la conversion reste valide, sans retournement, dans la largeur de route.
- [auto] Largeur de route définie par tronçon, bornée, sans saut brutal.

### UF 1.5 — Visualisation du tracé et du profil

**Contenu** : dans l'appli, une vue carte de l'étape entière et un profil d'altitude, avec un curseur qui balaie la route (position, altitude, pente, courbure affichées).

**Critères**
- [visuel] La vue carte montre toute l'étape à l'échelle ; le curseur et le profil sont synchronisés.
- [visuel] Les valeurs affichées (pente, courbure) correspondent aux tests de 1.1 à 1.3 sur 5 points choisis.
- [valid] Je peux générer une route avec seed et type d'étape, la regarder, et en régénérer une autre en une action.

### UF 1.6 — Défilement graphique robuste

**Contenu** : une caméra suit un point qui avance sur la route, en vue de dessus, sur toute la longueur de l'étape, avec le fond de route, ses bords et un décor minimal. C'est ici que l'on règle le « grattage » rencontré dans le premier POC et que l'on valide ou non le choix de PixiJS.

**Critères**
- [auto] Le point avance à vitesse constante (de 5 à 25 m/s) pendant 10 minutes de temps réel simulé : l'écart entre deux positions affichées successives ne varie pas de plus de 5 % hors virages (mesure de position écran à chaque image).
- [auto] Durée d'image : 99 % des images sous 20 ms et aucune image > 50 ms, sur une étape de 200 km, aux accélérations ×1, ×4, ×16 et ×64.
- [auto] Mémoire bornée : l'utilisation mémoire d'un défilement de 200 km ne croît pas après stabilisation (pas de fuite, découpage du décor chargé et libéré au fil du parcours).
- [visuel] Captures consécutives en virage serré, sur une jonction de tronçons, et à fort zoom : aucune couture, trou, ni décalage de texture visible.
- [visuel] Vidéo d'un défilement en virage et en descente rapide : aucun scintillement ni « grattage » du fond.
- [valid] Je fais défiler 10 minutes à ×1 puis un col à ×16 : rien d'anormal à l'œil.
- Décision à prendre dans l'UF et à consigner ici : orientation de la caméra (monde fixe et caméra qui tourne, ou route qui défile vers le haut) et niveau de zoom constant. Les deux sont testées sur les critères ci-dessus, on garde celle qui passe.

### UF 1.7 — Décor de bord de route (reprise de l'archive)

**Contenu** : biomes, végétation, public, bord de route. Réutilisation du décor de l'archive, revérifié, et adapté à la nouvelle route.

**Critères**
- [visuel] Aucun motif répété visible sur 5 minutes de défilement.
- [auto] Le décor suit exactement les bords de route de l'UF 1.4 (aucun élément sur la chaussée).
- [auto] Les critères de performance et de mémoire de l'UF 1.6 restent satisfaits avec le décor.
- [valid] Je valide le rendu sur les biomes retenus.

---

## 6. Chantier 2 — Coureur seul : physique et énergie

**But** : un coureur seul avance sur la route du chantier 1 avec une physique crédible et une gestion d'énergie à deux réserves.

**Critères (à décliner en UF au démarrage)**
- [auto] Vitesse d'équilibre à puissance constante cohérente avec les ordres de grandeur réels : environ 250 W sur le plat sans vent donne une vitesse de l'ordre de 38 à 42 km/h pour un coureur type ; dans une pente de 8 %, de l'ordre de 15 à 20 km/h pour 6 W/kg.
- [auto] Le vent de face, de côté et de dos modifie la vitesse dans le bon sens et dans des proportions plausibles ; la descente accélère jusqu'à un plafond raisonnable.
- [auto] Deux réserves : l'**endurance** se vide lentement avec l'effort soutenu, la **capacité d'explosion** se vide vite et se recharge lentement. Au-dessus de la puissance soutenable, la capacité d'explosion diminue ; à zéro, le coureur ne peut plus dépasser son seuil.
- [auto] Conservation : sur un parcours donné, l'énergie dépensée correspond à la somme des puissances sur le temps, sans création ni perte.
- [visuel] Courbes de vitesse, puissance et réserves le long de l'étape, lisibles.
- [valid] Je règle la puissance et je vois le coureur monter, descendre, se fatiguer comme je l'attends.

## 7. Chantier 3 — Coureur seul : estimation du reste à parcourir

**But** : le coureur régule son effort en fonction de ce qu'il croit rester à parcourir (distance et profil), avec une connaissance imparfaite.

**Critères (à décliner en UF au démarrage)**
- [auto] Sur une étape « 15 km de plat puis 15 km de montée dure », un coureur qui connaît le profil termine plus vite et avec moins de réserve gaspillée qu'un coureur qui l'ignore (écart de temps minimal à fixer au démarrage).
- [auto] Trois niveaux de connaissance comparés sur les mêmes étapes (profil complet, profil partiel, aucun profil) : ordre des performances attendu (complet ≥ partiel ≥ aucun) sur 100 seeds.
- [auto] L'effort instantané tient compte de la pente à venir : sur la même portion de plat, la puissance choisie est plus basse quand une montée dure suit que quand l'arrivée est proche.
- [auto] Une erreur d'estimation volontaire (par exemple croire qu'il reste 10 % de moins) provoque une fin d'étape plus difficile, de façon mesurable.
- [visuel] Courbes de puissance planifiée contre puissance réalisée, avec l'estimation affichée.
- [valid] Je vois le coureur « garder des forces » avant la montée et « lâcher » juste avant la fin.

## 8. Chantier 4 — Coureur seul : trajectoire

**But** : le coureur choisit sa ligne sur la route (décalage latéral, ligne de virage), avec des conséquences réelles sur la vitesse et la distance.

**Critères (à décliner en UF au démarrage)**
- [auto] Distance parcourue en virage : la ligne qui coupe le virage est plus courte que la ligne extérieure, dans les proportions géométriques attendues.
- [auto] Vitesse en virage et en descente : la ligne choisie influence la vitesse maximale sans sortir de la route ; aucune sortie de chaussée sur 1 000 routes.
- [auto] Pas de variations brusques : accélération latérale bornée, trajectoire continue et lissée.
- [auto] Le même virage pris de trois façons (extérieur, médian, ligne de course) donne des temps ordonnés de façon cohérente.
- [visuel] Capture de la trajectoire superposée à la route : crédible et sans zigzag.
- [valid] Je vois le coureur choisir sa ligne de façon naturelle.

## 9. Chantier 5 — Deux coureurs : aspiration

**Critères (à décliner en UF au démarrage)**
- [auto] La puissance économisée dans la roue d'un autre suit la loi documentée (voir `archives/v0.0.2-poc/docs/v0.0.2-aspiration.md`) en fonction de la distance entre roues, et disparaît au-delà d'une distance donnée.
- [auto] Un suiveur peut rester dans la roue à puissance inférieure à celle du meneur, et un meneur seul garde sa puissance.
- [auto] Prise de roue : un coureur qui revient sur un autre se place dans son sillage sans oscillation ni dépassement brutal.
- [visuel] Visualisation du sillage (curseur d'aspiration), cohérente avec les chiffres.
- [valid] Je vois deux coureurs se relayer ou se laisser dépasser de façon crédible.

## 10. Chantier 6 — Le groupe

**Critères (à décliner en UF au démarrage)**
- [auto] Des rotations de relais apparaissent sans avoir été écrites, avec un partage de l'effort non dégénéré sur de nombreuses courses.
- [auto] Vent de côté : formation d'éventails et de bordures cohérents avec la direction du vent.
- [auto] Aucune collision ni chevauchement de coureurs ; placement continu et stable.
- [auto] Les statistiques de course (écart, vitesse moyenne, nombre de changements de tête) restent dans des fourchettes plausibles, avec un batch sans affichage.
- [visuel] Capture d'un groupe en file, en éventail et en peloton.

## 11. Chantier 7 — La décision

**Critères (à décliner en UF au démarrage)**
- [auto] Chaque décision produit une trace complète (perçu, réel, intentions évaluées avec leurs raisons et vetos, action) ; aucune décision sans trace.
- [auto] Pas de comportement absurde sur un grand nombre de courses (coureur seul en tête sans raison, attaques en rafale permanentes, blocage de la course).
- [auto] Les profils de coureurs (rouleur, sprinteur, attaquant, opportuniste) se comportent de façon différente et crédible ; le sprinteur gagne souvent, mais pas toujours.
- [valid] J'interroge « pourquoi ? » sur n'importe quel coureur à n'importe quel moment et la réponse a du sens pour moi.

## 12. Chantier 8 — Le joueur

**Critères (à décliner en UF au démarrage)**
- [auto] Le joueur remplace « Vouloir » et « Agir » de son coureur, et reste soumis à la perception : il n'accède pas à l'état exact des autres.
- [auto] Brouillard de perception : biais durable, retard, imprécision, reproductibles par seed.
- [valid] Une course jouable de bout en bout, avec accélération du temps et pauses sur les événements.
- [valid] Le conseiller (« à ta place, mon coureur ferait ça, parce que… ») est utile et désactivable.

---

## 13. Journal de validation

À remplir au fil de l'eau : pour chaque UF ou chantier, date, critères validés, chiffres, décisions prises.

| Date | UF / chantier | Résultat | Décision / remarque |
|---|---|---|---|
| | | | |
