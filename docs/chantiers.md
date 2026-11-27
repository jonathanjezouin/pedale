# Pédale — Chantiers et critères de validation

> Document de pilotage. La vision fonctionnelle reste celle de `archives/v0.1.2/docs/v0.0.1-design-fonctionnel.md`.
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

Structure du code commune à tous les chantiers : [`architecture.md`](architecture.md).

## 2. Stack retenue

| Couche | Choix |
|---|---|
| Simulation | TypeScript pur, générateur aléatoire seedé, aucune dépendance, aucun `Math.random` |
| Rendu | PixiJS v8 (WebGL) en point de départ ; **le défilement est une UF à part entière (2.6) avec des critères mesurables**. Si les critères ne passent pas, on change l'approche de rendu avant d'aller plus loin |
| Interface | HTML/CSS (panneaux, diagnostic) |
| Build / tests | Vite, Vitest ; workspace npm avec un paquet `sim` et une application |
| Desktop / Steam | Electron plus tard (hors chantiers 1 à 9) |

Le choix du rendu est volontairement réversible : il n'engage que la couche d'affichage.

## 3. Vue d'ensemble

| # | Chantier | Résumé |
|---|---|---|
| 0 | Archivage et socle | Fait : l'existant est dans `archives/`, ce document existe |
| 1 | Architecture du code | Structure commune (voir `architecture.md`), règles vérifiées automatiquement, coureur témoin avec la chaîne complète |
| 2 | La route | Tracé réaliste, profil d'étape, défilement graphique robuste |
| 3 | Coureur seul : physique et énergie | Puissance, vitesse, pente, vent, deux réserves d'énergie |
| 4 | Coureur seul : estimation du reste à parcourir | Réguler son effort selon le profil à venir |
| 5 | Coureur seul : trajectoire | La ligne choisie sur la route et ses conséquences |
| 6 | Deux coureurs : aspiration | Abri, sillage, prise de roue |
| 7 | Le groupe | Relais, placement, éventails au vent de côté |
| 8 | La décision | Intentions, raisons nommées, trace « pourquoi ? » |
| 9 | Le joueur | Contrôle du coureur, brouillard de perception, radio |

---

## 4. Chantier 0 — Archivage et socle (fait)

- [x] Tout l'existant (état de `main` en v0.1.2) déplacé dans `archives/v0.1.2/` avec son historique git, et un README qui explique pourquoi et ce qui est récupérable.
- [x] Ce document de chantiers.
- [x] Squelette de l'appli (workspace, `npm test`, `npm run dev`) : créé dans le chantier 1 (UF 1.1).

---

## 5. Chantier 1 — Architecture du code

**But** : fixer une structure unique que tous les chantiers suivants respectent, et la prouver avec un **coureur témoin** qui traverse la chaîne complète *percevoir → interpréter → vouloir → agir*, avec un contenu volontairement trivial. Référence : [`architecture.md`](architecture.md).

**Critères du chantier entier**
- [auto] Les règles de dépendance de `architecture.md` §2 sont vérifiées par un script lancé par `npm test` ; une violation volontaire de test fait échouer la vérification.
- [auto] Le coureur témoin traverse les quatre étages sur une piste de test, et chaque décision laisse une trace complète.
- [auto] Déterminisme : deux exécutions de même seed donnent exactement la même trace, quel que soit le nombre de pas par image (×1 comme ×64).
- [valid] Je lis la trace d'une décision du témoin et je comprends ce qu'il a perçu, cru, voulu et fait.
- [valid] Les questions ouvertes de `architecture.md` §8 sont tranchées et le document est à jour.

### UF 1.1 — Socle et règles automatiques

**Contenu** : workspace (paquet `sim` et application), `npm test`, `npm run dev`, générateur aléatoire seedé, vérification des dépendances entre couches, vérification « pas de `Math.random` / `Date` dans `sim` ».

**Critères**
- [auto] `npm test` et `npm run dev` fonctionnent depuis un clone neuf.
- [auto] Le script de dépendances échoue sur un import interdit (cas de test inclus) et passe sur le code réel.
- [auto] Le générateur seedé donne la même suite à seed identique, et des suites différentes à seeds différentes.
- [auto] Une recherche de `Math.random` et `Date` dans `sim` ne trouve rien.

### UF 1.2 — Contrats des étages

**Contenu** : types `Observation`, `Perçu`, `Croyances`, `Volontés` (avec cadre, raisons, échéance), `Commandes`, `Trace`, sans logique. Signature de chaque étage comme fonction pure.

**Critères**
- [auto] Compilation stricte sans type implicite ; chaque étage ne reçoit que le type de l'étage précédent (vérifié par la compilation d'un cas mal typé, qui doit échouer).
- [auto] Toutes les grandeurs portent leur unité dans leur nom ou leur type (SI).
- [valid] Je relis les types : ils me paraissent compréhensibles et suffisants pour les chantiers 2 à 5.

### UF 1.3 — Coureur témoin et chaîne complète

**Contenu** : un coureur qui avance sur une piste droite fictive, avec un contenu trivial à chaque étage (par exemple : perçoit sa vitesse, croit qu'il est « trop lent », veut atteindre une vitesse cible, commande une puissance), appliqué par une physique minimale.

**Critères**
- [auto] Chaque étage est testable seul avec des entrées écrites à la main.
- [auto] Changer un état caché du monde non exposé par l'Observation ne change ni le Perçu ni les Croyances.
- [auto] Aucune fonction d'étage ne modifie l'état du monde ou du coureur (comparaison avant/après sur 1 000 pas).
- [auto] Un pas du moteur appelle les quatre étages dans l'ordre, puis la physique.

### UF 1.4 — Vouloir hiérarchique

**Contenu** : pile à trois niveaux (Objectif, Intention, Manœuvre) avec cadre descendant, remontée d'impossibilité, échéances et déclencheurs de réévaluation, sur un cas jouet (voir `architecture.md` §4).

**Critères**
- [auto] Le niveau inférieur ne produit jamais une Volonté qui sort du cadre reçu (1 000 tirages).
- [auto] Une impossibilité remontée provoque la réévaluation du niveau immédiatement supérieur, et pas plus haut.
- [auto] Chaque niveau se réévalue à sa propre cadence (un cas de test par déclencheur).
- [auto] Chaque niveau écrit ses raisons dans la trace.

### UF 1.5 — Trace et panneau de diagnostic

**Contenu** : enregistrement borné des traces, lecture par le moteur et l'interface, panneau « pourquoi ? » dans l'appli pour le coureur témoin.

**Critères**
- [auto] Aucune décision sans trace ; la trace garde Perçu et réel côte à côte.
- [auto] Mémoire de la trace bornée sur une très longue simulation.
- [visuel] Le panneau affiche, pour une décision, les étages et les raisons, lisibles.

### UF 1.6 — Point d'injection du joueur

**Contenu** : possibilité de remplacer Vouloir/Agir par une source externe (script de test, plus tard le joueur), qui fournit des Volontés ou des Commandes.

**Critères**
- [auto] Un coureur piloté par un script de Commandes et un coureur IA produisant les mêmes Commandes ont exactement la même trajectoire.
- [auto] La source externe ne reçoit que Perçu et Croyances, jamais l'état réel.

### Note de fin de chantier 1 (version 0.1.0)

**Fait.** Une structure unique en cinq couches (`contrats`, `monde`, `esprit`, `trace`, `moteur`) et une application qui n'en lit que la porte d'entrée. Un coureur témoin traverse la chaîne percevoir > interpréter > vouloir > agir sur une piste droite, avec un Vouloir à trois niveaux (cadre descendant, remontée d'impossibilité, cadences propres), une trace complète de chaque décision, un journal borné, un panneau « pourquoi ? » et un point d'injection pour le joueur.

**Chiffres de validation** (`npm test`, 76 tests) :
- règles de dépendance entre couches et entre les quatre étages, `Math.random`/`Date` interdits dans `sim`, unités dans les noms : tout est vérifié par script, chaque règle avec son cas de violation volontaire ;
- cadre respecté sur 1 000 tirages aléatoires ; pureté des étages vérifiée sur 1 000 pas ;
- journal borné sur 100 000 pas ; mêmes traces à ×1, ×10 et ×64 ;
- un pilote rejouant les Commandes ou les Volontés de l'IA reproduit exactement sa trajectoire sur 400 pas.

**Validé par le propriétaire.** Les types (UF 1.2), la capture du panneau (UF 1.5), les questions de `architecture.md` §8 et le chantier.

**À retenir.**
- Les décisions 2, 3, 4 et 5 de `architecture.md` §8 sont des choix par défaut, à réviser aux chantiers 7, 8 et 9.
- Les mutations volontaires (casser une règle pour voir si le test l'attrape) ont attrapé tous les défauts introduits ; elles ont aussi révélé trois défauts du Vouloir, corrigés (voir le journal).
- De l'archive : seule la vision fonctionnelle sert de référence. Aucun code n'a été repris ; le décor de bord de route (UF 2.7) sera le premier emprunt.

---

## 6. Chantier 2 — La route

**But** : disposer d'une route réaliste (tracé + profil d'altitude) sur laquelle un coureur pourra rouler, et la regarder défiler sans défaut graphique, quelle que soit la longueur de l'étape.

**Ordre d'exécution (décidé en cours de chantier).** 2.1, 2.2 (tracé de base, réalisé), puis **2.3 (profil d'étape) avant 2.2b (tracé conditionné par la pente)**, puis 2.4 et suivantes. Le profil est généré en premier pour la longueur demandée ; le tracé le reçoit ensuite en entrée (même abscisse `s`) : là où la pente est faible, droites et virages doux sont plus probables ; là où elle est moyenne, virages moyens ; là où elle est raide, lacets possibles. Ce sont des probabilités, pas des règles : une pente forte en ligne droite reste possible.

**Critères du chantier entier**
- [auto] 1 000 routes générées avec des seeds différentes, pour chacun des types d'étape, sans échec, **sans que la route ne se recroise ni ne se frôle**, avec **de vraies lignes droites** en plus des virages, et respectant toutes les bornes des UF 2.2 et 2.3.
- [visuel] Sur 5 seeds par type d'étape, la route paraît plausible : pas de virage impossible, pas de ligne droite parfaite sur plus de la longueur autorisée, profil crédible.
- [valid] Je peux faire défiler une étape de bout en bout, aux vitesses d'accélération du temps prévues, sans scintillement, saccade ni coupure visible.
- [auto] Le défilement garde les performances de l'UF 2.6 sur une étape de 200 km.

### UF 2.1 — Géométrie de la route  *(réalisée : `monde/route.ts`, `test/route.test.ts`, 9 tests)*

**Contenu** : la route est définie par une abscisse curviligne `s` (mètres depuis le départ). À chaque `s` on sait donner : position `(x, y)`, cap, courbure, et le repère local (devant / à gauche).

**Critères**
- [auto] `position(s)` est continue : l'écart entre `s` et `s + 1 cm` est de 1 cm, à 1 mm près.
- [auto] Le cap est continu : aucun **saut** de cap supérieur à 0,01° entre deux points distants de 1 cm, c'est-à-dire écart au cap attendu (courbure × distance) ≤ 0,01°. *(Précisé en UF 2.1 : la rotation naturelle d'un lacet de 20 m est de 0,029° par centimètre, donc la lettre du critère interdirait tout rayon < 57 m.)*
- [auto] La longueur totale annoncée correspond à la somme des segments, à 0,1 % près.
- [auto] `s` croissant implique un avancement le long du tracé, sans retour en arrière ni sur place.
- [auto] Résultats identiques à seed identique (déterminisme), sur deux exécutions.

### UF 2.2 — Génération du tracé (base, sans profil ; reprise en UF 2.2b)  *(réalisée : `monde/etapes.ts`, `analyse.ts`, `generation.ts`, `test/generation.test.ts`, 30 tests)*

**Contenu** : générer un tracé réaliste de route à partir d'une seed et d'un type d'étape (plaine, vallonné, montagne, éventuellement littoral). Virages larges, enchaînements, lacets de col, lignes droites de longueur variable.

**Critères**
- [auto] Rayon de courbure minimal respecté par type (ordre de grandeur : ≥ 150 m en plaine, ≥ 20 m en lacet de col ; valeurs exactes fixées au démarrage de l'UF et inscrites ici).
- [auto] **La route ne se recroise jamais** : deux points dont les abscisses diffèrent de plus de 100 m sont toujours séparés, en plan, d'au moins 3 largeurs de route (seuil exact fixé au démarrage de l'UF). Vérifié sur 1 000 seeds par type d'étape, lacets compris.
- [auto] **Des lignes droites existent** (une ligne droite est un tronçon de rayon de courbure > 5 km) : par exemple, en plaine, au moins 3 lignes droites ≥ 1 km pour 50 km d'étape ; en vallonné, au moins une ≥ 500 m ; en montagne, au moins une ≥ 200 m (valeurs exactes inscrites au démarrage).
- [auto] **Ni que des lignes droites, ni que des virages** : la part de la longueur en ligne droite reste dans une fourchette propre à chaque type d'étape (par exemple 30 à 60 % en plaine).
- [auto] Plus longue ligne droite : bornée par type d'étape (par exemple ≤ 5 km en plaine, ≤ 1 km en montagne).
- [auto] Longueur demandée respectée à 1 % près, pour des étapes de 20 à 250 km.
- [auto] Distribution des virages (nombre par km, angle moyen) différente et stable d'un type à l'autre, sur 1 000 seeds.
- [visuel] Planche de 12 tracés : aucun ne ressemble à une courbe lissée artificielle ou à un zigzag aléatoire, et chacun montre des lignes droites franches entre les virages.

**Valeurs retenues (validées par le propriétaire au démarrage de l'UF 2.2).** Ce tableau fait foi pour les critères ci-dessus.

*Définitions.* Ligne droite : tronçon de rayon > 5 km (le générateur produit des droites exactes). Virage : suite continue d'arcs tournant dans le même sens ; on mesure son angle total. Lacet : virage d'environ 180°, rayon de 20 à 30 m, enchaîné par 4 à 10 en alternant gauche et droite (montagne seulement, en montée : lien avec l'UF 2.3). Largeur de route : 7 m (à confirmer à l'UF 2.4). Non-recroisement : deux points distants de plus de 100 m en `s` restent séparés d'au moins 3 largeurs = 21 m en plan. Littoral : écarté pour l'instant, à rouvrir comme UF à part si besoin. Raccords en clothoïde : non, courbure par paliers (à revoir si l'UF 2.6 ou le chantier 3 montre un à-coup).

| | Plaine | Vallonné | Montagne |
|---|---|---|---|
| Rayon min. hors lacet | 150 m | 80 m | 40 m |
| Rayon min. en lacet | n/a | n/a | 20 m |
| Droites minimales | ≥ 3 de ≥ 1 km par 50 km (proportionnel, au moins 1) | ≥ 1 de ≥ 500 m | ≥ 1 de ≥ 200 m |
| Part de longueur en droite | 30 à 60 % | 15 à 40 % | 5 à 25 % |
| Plus longue droite | ≤ 5 km | ≤ 2 km | ≤ 1 km |
| Virages par km (hors lacets) | 0,5 à 2 | 1,5 à 4 | 3 à 6 |
| Angle moyen d'un virage | 15 à 40° | 25 à 60° | 40 à 90° |
| Lacets | aucun | aucun | autorisés |

Les fourchettes de virages par km et d'angles (vallonné, montagne) sont provisoires : à ajuster sur la planche de 12 tracés.

*Précisions de réalisation.* « 1 000 seeds par type » = 1 000 seeds de 20 à 100 km, plus 30 seeds de 100 à 250 km par type, plus les extrêmes 20 km et 250 km contrôlés à pas fin (le coût du contrôle croît avec la longueur ; la suite complète dure environ 1 minute). Le générateur construit bloc par bloc (droite + virage, ou série de lacets), refuse tout bloc qui frôle le tracé existant (marge d'échantillonnage de 4 m) et recule de quelques blocs en cas d'impasse. Il expose les zones de lacets pour que l'UF 2.3 y place les montées. Les tests vérifient le non-recroisement avec un contrôle indépendant du générateur, lui-même validé contre une force brute et sur des cas de violation volontaires.

### UF 2.3 — Profil d'étape  *(réalisée : `monde/profil.ts`, paramètres dans `etapes.ts`, `test/profil.test.ts`, 37 tests)*

**Contenu** : altitude `z(s)` et pente `p(s)` générées à partir d'une seed, d'un type d'étape et d'une longueur, avec des tronçons nommés : plat, bosse (une côte, avec ou sans sa descente : celle-ci forme un tronçon « descente » à part une fois sur deux), col (montée jusqu'au sommet), descente. Le profil est indépendant du tracé et passe en entrée de sa génération (UF 2.2b).

**Construction.** La pente est une suite de segments linéaires (rampes et paliers) ; l'altitude en est l'intégrale exacte, donc continue. La rampe entre deux pentes a une longueur imposée par la variation de pente maximale.

**Valeurs retenues (validées par le propriétaire au démarrage de l'UF 2.3).**

| | Plaine | Vallonné | Montagne |
|---|---|---|---|
| Pente max en montée | 3 % | 9 % | 12 % (en col) |
| Pente max en descente | −4 % | −10 % | −14 % |
| Dénivelé positif par km | 2 à 9 m/km | 10 à 22 m/km | 22 à 45 m/km |
| Tronçons présents | plat, bosse, descente | plat, bosse (côtes), descente | plat, bosse, col (montée de 5 à 20 km à 5–9 % en moyenne), descente |
| Altitude de départ | 50 à 200 m | 200 à 600 m | 500 à 1 500 m |
| Altitude maximale | 400 m | 1 200 m | 2 800 m |

Communes aux trois types : variation de pente bornée à 1 point de pente par 100 m (|dp/ds| ≤ 1·10⁻⁴ par mètre) ; longueur minimale d'un tronçon : 300 m ; altitude ≥ 0. Le dénivelé par km s'applique à toute longueur d'étape de 20 à 250 km (il n'est pas fixé par étape). Limite physique constatée : avec des pentes réalistes (7 % en montée, 9 % en descente) et un dénivelé qui revient à peu près à son niveau de départ, on ne peut pas monter plus d'environ 56 % de la longueur ni descendre plus de 44 %, soit au plus 39 m/km environ. Le haut de la fourchette montagne (45 m/km) n'est donc pas atteignable de façon crédible : la cible est tirée entre 30 et 60 % de la largeur de la fourchette (soit 28 à 35 m/km en montagne), et la fourchette reste la borne de contrôle. Les cols sont planifiés d'abord (de 450 à 1 400 m de haut, au moins 75 % du dénivelé), puis les bosses ; le plan est rejoué avec des hauteurs recalées jusqu'à obtenir le dénivelé visé à 3 % près. Un tronçon de moins de 300 m (en pratique le dernier, coupé à la longueur d'étape) est fusionné avec son voisin. Précision de réalisation : la bosse ou la côte dure au minimum le temps de monter puis redescendre à la pente maximale permise par la variation bornée (par exemple 1,2 km pour une côte à 6 %), donc « côtes de 0,5 à 3 km » du premier projet devient « de 1 à 4 km ».

**Critères**
- [auto] `z(s)` continue ; pente lissée : |p(s + Δ) − p(s)| ≤ 1 point de pente par 100 m de Δ, pas de marche d'escalier.
- [auto] Pente maximale par type (tableau), en montée et en descente.
- [auto] Dénivelé positif par km conforme au type d'étape demandé (tableau), sur 1 000 seeds par type, longueurs de 20 à 250 km.
- [auto] Altitude comprise entre 0 et l'altitude maximale du type ; altitude de départ dans la fourchette du type.
- [auto] Les tronçons sont étiquetés (plat, bosse, col, descente) sans trou ni chevauchement, couvrent toute l'étape, et durent au moins 300 m. Les cols n'existent qu'en montagne.
- [auto] Résultats identiques à seed identique.
- [visuel] Profil d'étape à la manière d'un profil de course : on reconnaît un col, une bosse, un plat.

### UF 2.2b — Tracé conditionné par la pente

**Contenu** : reprise du générateur de tracé de l'UF 2.2 en lui donnant le profil de l'UF 2.3 en entrée. La pente en valeur absolue (montée comme descente, ce sont les mêmes versants) modifie la probabilité de chaque type de bloc. Les bornes globales du tableau de l'UF 2.2 (part de droite, virages par km, angle moyen, rayons, droites longues, non-recroisement, longueur) et leur contrôle en boucle fermée restent inchangés.

**Valeurs retenues (validées par le propriétaire).**

| Pente (valeur absolue) | Blocs favorisés | Lacets |
|---|---|---|
| Faible, < 3 % | droites longues, virages doux (angle ≤ 30°, grands rayons) | aucun |
| Moyenne, 3 à 7 % | virages moyens (30 à 70°), droites plus courtes | aucun |
| Forte, > 7 % | virages serrés, lacets, droites encore possibles | environ 1 bloc sur 3 (montagne seulement) |

Ce sont des pondérations : aucune classe n'interdit un type de bloc, sauf les lacets hors montagne et hors pente forte. La plaine (pentes < 3 %) se comporte comme à l'UF 2.2.

**Critères**
- [auto] Tous les critères de l'UF 2.2 (non-recroisement, bornes du tableau, longueur) sont vérifiés tels quels sur 1 000 seeds par type, avec profil.
- [auto] Lacets : au moins 90 % de leur longueur sur une pente d'au moins 7 % en valeur absolue.
- [auto] Sur 1 000 seeds, pour les types où les trois classes de pente existent : la part de droite est plus grande sur pente faible que sur pente moyenne, et sur pente moyenne que sur pente forte ; l'angle moyen des virages croît avec la pente.
- [auto] Des pentes fortes en ligne droite existent encore (la pente ne détermine pas le tracé).
- [visuel] Planche : en montagne, les lacets se placent là où le profil grimpe fort ; les parties plates sont plutôt droites.

### UF 2.4 — Route à deux dimensions : largeur et bords

**Contenu** : un point sur la route se repère par `(s, d)` : abscisse et décalage latéral. Largeur de la route, accotements. Conversion entre `(s, d)` et le monde.

**Critères**
- [auto] Aller-retour `(s, d)` → monde → `(s, d)` : erreur < 1 cm sur 10 000 points tirés.
- [auto] Décalage latéral extérieur d'un virage serré : la conversion reste valide, sans retournement, dans la largeur de route.
- [auto] Largeur de route définie par tronçon, bornée, sans saut brutal.

### UF 2.5 — Visualisation du tracé et du profil

**Contenu** : dans l'appli, une vue carte de l'étape entière et un profil d'altitude, avec un curseur qui balaie la route (position, altitude, pente, courbure affichées).

**Critères**
- [visuel] La vue carte montre toute l'étape à l'échelle ; le curseur et le profil sont synchronisés.
- [visuel] Les valeurs affichées (pente, courbure) correspondent aux tests de 2.1 à 2.3 sur 5 points choisis.
- [valid] Je peux générer une route avec seed et type d'étape, la regarder, et en régénérer une autre en une action.

### UF 2.6 — Défilement graphique robuste

**Contenu** : une caméra suit un point qui avance sur la route, en vue de dessus, sur toute la longueur de l'étape, avec le fond de route, ses bords et un décor minimal. C'est ici que l'on règle le « grattage » rencontré dans le premier POC et que l'on valide ou non le choix de PixiJS.

**Critères**
- [auto] Le point avance à vitesse constante (de 5 à 25 m/s) pendant 10 minutes de temps réel simulé : l'écart entre deux positions affichées successives ne varie pas de plus de 5 % hors virages (mesure de position écran à chaque image).
- [auto] Durée d'image : 99 % des images sous 20 ms et aucune image > 50 ms, sur une étape de 200 km, aux accélérations ×1, ×4, ×16 et ×64.
- [auto] Mémoire bornée : l'utilisation mémoire d'un défilement de 200 km ne croît pas après stabilisation (pas de fuite, découpage du décor chargé et libéré au fil du parcours).
- [visuel] Captures consécutives en virage serré, sur une jonction de tronçons, et à fort zoom : aucune couture, trou, ni décalage de texture visible.
- [visuel] Vidéo d'un défilement en virage et en descente rapide : aucun scintillement ni « grattage » du fond.
- [valid] Je fais défiler 10 minutes à ×1 puis un col à ×16 : rien d'anormal à l'œil.
- Décision à prendre dans l'UF et à consigner ici : orientation de la caméra (monde fixe et caméra qui tourne, ou route qui défile vers le haut) et niveau de zoom constant. Les deux sont testées sur les critères ci-dessus, on garde celle qui passe.

### UF 2.7 — Décor de bord de route (reprise de l'archive)

**Contenu** : biomes, végétation, public, bord de route. Réutilisation du décor de l'archive, revérifié, et adapté à la nouvelle route.

**Critères**
- [visuel] Aucun motif répété visible sur 5 minutes de défilement.
- [auto] Le décor suit exactement les bords de route de l'UF 2.4 (aucun élément sur la chaussée).
- [auto] Les critères de performance et de mémoire de l'UF 2.6 restent satisfaits avec le décor.
- [valid] Je valide le rendu sur les biomes retenus.

---

## 7. Chantier 3 — Coureur seul : physique et énergie

**But** : un coureur seul avance sur la route du chantier 1 avec une physique crédible et une gestion d'énergie à deux réserves.

**Critères (à décliner en UF au démarrage)**
- [auto] Vitesse d'équilibre à puissance constante cohérente avec les ordres de grandeur réels : environ 250 W sur le plat sans vent donne une vitesse de l'ordre de 38 à 42 km/h pour un coureur type ; dans une pente de 8 %, de l'ordre de 15 à 20 km/h pour 6 W/kg.
- [auto] Le vent de face, de côté et de dos modifie la vitesse dans le bon sens et dans des proportions plausibles ; la descente accélère jusqu'à un plafond raisonnable.
- [auto] Deux réserves : l'**endurance** se vide lentement avec l'effort soutenu, la **capacité d'explosion** se vide vite et se recharge lentement. Au-dessus de la puissance soutenable, la capacité d'explosion diminue ; à zéro, le coureur ne peut plus dépasser son seuil.
- [auto] Conservation : sur un parcours donné, l'énergie dépensée correspond à la somme des puissances sur le temps, sans création ni perte.
- [visuel] Courbes de vitesse, puissance et réserves le long de l'étape, lisibles.
- [valid] Je règle la puissance et je vois le coureur monter, descendre, se fatiguer comme je l'attends.

## 8. Chantier 4 — Coureur seul : estimation du reste à parcourir

**But** : le coureur régule son effort en fonction de ce qu'il croit rester à parcourir (distance et profil), avec une connaissance imparfaite.

**Critères (à décliner en UF au démarrage)**
- [auto] Sur une étape « 15 km de plat puis 15 km de montée dure », un coureur qui connaît le profil termine plus vite et avec moins de réserve gaspillée qu'un coureur qui l'ignore (écart de temps minimal à fixer au démarrage).
- [auto] Trois niveaux de connaissance comparés sur les mêmes étapes (profil complet, profil partiel, aucun profil) : ordre des performances attendu (complet ≥ partiel ≥ aucun) sur 100 seeds.
- [auto] L'effort instantané tient compte de la pente à venir : sur la même portion de plat, la puissance choisie est plus basse quand une montée dure suit que quand l'arrivée est proche.
- [auto] Une erreur d'estimation volontaire (par exemple croire qu'il reste 10 % de moins) provoque une fin d'étape plus difficile, de façon mesurable.
- [visuel] Courbes de puissance planifiée contre puissance réalisée, avec l'estimation affichée.
- [valid] Je vois le coureur « garder des forces » avant la montée et « lâcher » juste avant la fin.

## 9. Chantier 5 — Coureur seul : trajectoire

**But** : le coureur choisit sa ligne sur la route (décalage latéral, ligne de virage), avec des conséquences réelles sur la vitesse et la distance.

**Critères (à décliner en UF au démarrage)**
- [auto] Distance parcourue en virage : la ligne qui coupe le virage est plus courte que la ligne extérieure, dans les proportions géométriques attendues.
- [auto] Vitesse en virage et en descente : la ligne choisie influence la vitesse maximale sans sortir de la route ; aucune sortie de chaussée sur 1 000 routes.
- [auto] Pas de variations brusques : accélération latérale bornée, trajectoire continue et lissée.
- [auto] Le même virage pris de trois façons (extérieur, médian, ligne de course) donne des temps ordonnés de façon cohérente.
- [visuel] Capture de la trajectoire superposée à la route : crédible et sans zigzag.
- [valid] Je vois le coureur choisir sa ligne de façon naturelle.

## 10. Chantier 6 — Deux coureurs : aspiration

**Critères (à décliner en UF au démarrage)**
- [auto] La puissance économisée dans la roue d'un autre suit la loi documentée (voir `archives/v0.1.2/docs/v0.0.2-aspiration.md`) en fonction de la distance entre roues, et disparaît au-delà d'une distance donnée.
- [auto] Un suiveur peut rester dans la roue à puissance inférieure à celle du meneur, et un meneur seul garde sa puissance.
- [auto] Prise de roue : un coureur qui revient sur un autre se place dans son sillage sans oscillation ni dépassement brutal.
- [visuel] Visualisation du sillage (curseur d'aspiration), cohérente avec les chiffres.
- [valid] Je vois deux coureurs se relayer ou se laisser dépasser de façon crédible.

## 11. Chantier 7 — Le groupe

**Critères (à décliner en UF au démarrage)**
- [auto] Des rotations de relais apparaissent sans avoir été écrites, avec un partage de l'effort non dégénéré sur de nombreuses courses.
- [auto] Vent de côté : formation d'éventails et de bordures cohérents avec la direction du vent.
- [auto] Aucune collision ni chevauchement de coureurs ; placement continu et stable.
- [auto] Les statistiques de course (écart, vitesse moyenne, nombre de changements de tête) restent dans des fourchettes plausibles, avec un batch sans affichage.
- [visuel] Capture d'un groupe en file, en éventail et en peloton.

## 12. Chantier 8 — La décision

**Critères (à décliner en UF au démarrage)**
- [auto] Chaque décision produit une trace complète (perçu, réel, intentions évaluées avec leurs raisons et vetos, action) ; aucune décision sans trace.
- [auto] Pas de comportement absurde sur un grand nombre de courses (coureur seul en tête sans raison, attaques en rafale permanentes, blocage de la course).
- [auto] Les profils de coureurs (rouleur, sprinteur, attaquant, opportuniste) se comportent de façon différente et crédible ; le sprinteur gagne souvent, mais pas toujours.
- [valid] J'interroge « pourquoi ? » sur n'importe quel coureur à n'importe quel moment et la réponse a du sens pour moi.

## 13. Chantier 9 — Le joueur

**Critères (à décliner en UF au démarrage)**
- [auto] Le joueur remplace « Vouloir » et « Agir » de son coureur, et reste soumis à la perception : il n'accède pas à l'état exact des autres.
- [auto] Brouillard de perception : biais durable, retard, imprécision, reproductibles par seed.
- [valid] Une course jouable de bout en bout, avec accélération du temps et pauses sur les événements.
- [valid] Le conseiller (« à ta place, mon coureur ferait ça, parce que… ») est utile et désactivable.

---

## 14. Journal de validation

À remplir au fil de l'eau : pour chaque UF ou chantier, date, critères validés, chiffres, décisions prises.

| Date | UF / chantier | Résultat | Décision / remarque |
|---|---|---|---|
| 2026-11-27 | UF 1.1 | Critères [auto] passés (clone neuf, violation volontaire refusée, générateur seedé, pas de `Math.random`/`Date` dans `sim`) | — |
| 2026-11-27 | UF 1.2 | Critères [auto] passés ; types relus et validés par le propriétaire | Ajout d'un champ `etage` sur chaque type (sinon `Observation` et `Percu` seraient interchangeables) |
| 2026-11-27 | UF 1.3 | Critères [auto] passés (étages seuls, état caché, pureté sur 1 000 pas, ordre d'appel) | Ajout de `Visee` aux Volontés : sans elle, Agir ne peut pas produire de Commandes |
| 2026-11-27 | UF 1.4 | Critères [auto] passés (cadre respecté sur 1 000 tirages, remontée au niveau juste au-dessus, cadences, raisons de chaque niveau dans la trace) | Impossibilité = le cadre ne suffit pas à *tenir* la vitesse visée (pas : la puissance demandée dépasse le plafond) ; seule une impossibilité nouvelle remonte |
| 2026-11-27 | UF 1.5 | Critères [auto] passés (une trace par décision, perçu et réel côte à côte, mémoire bornée sur 100 000 pas, même trace à ×1, ×10 et ×64). Critère [visuel] : capture `docs/captures/uf-1-5-panneau-pourquoi.png`, validée par le propriétaire | La façade `Simulation` est le seul moyen d'avancer le temps : l'enregistrement des traces ne dépend donc pas de la discipline de l'appelant |
| 2026-11-27 | UF 1.6 | Critères [auto] passés (un pilote rejouant les Commandes ou les Volontés de l'IA donne exactement la même trajectoire ; la source externe ne reçoit que Perçu et Croyances, y compris quand un état caché change) | Point d'injection après Interpréter ; le type d'entrée du pilote n'a aucun champ pour le monde, donc la garantie est aussi vérifiée par la compilation |
