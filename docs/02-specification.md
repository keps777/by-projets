# 02 — Spécification fonctionnelle (v2)

> **Statut : v2.0 du 5 oct. 2026, à valider.** Elle remplace la v0.1. Elle décrit **quoi** construire ; le **comment** viendra dans `04-architecture.md`.
> Sources : les maquettes (https://claude.ai/artifact/5ZgqUjisYTEMRLL3w6d2F6, pages « Version 2 · Nuit » et « Jour »), `04-mes-projets.md` (les projets par défaut), `05-exigences-v2.md` (décisions successives) et `06-analyse-avant-developpement.md` (risques).
> Les mots **doit** et **ne doit pas** sont impératifs ; **peut** désigne une option.

## 1. Principes

1. **Une seule saisie, tout est alimenté.** Ce qui est noté une fois (dans un bloc, le Mode Focus ou le volet) alimente tous les sous-projets concernés, le rapport, les barres de progression et le document. Rien ne se ressaisit.
2. **Le serveur est la source de vérité** (Supabase). Un cache local permet de consulter et de saisir sans réseau ; tout se synchronise ensuite.
3. **Privé par conception.** Aucune donnée n'est envoyée par e-mail. Aucun traceur, aucune publicité. Chaque utilisateur ne voit que ses données.
4. **Les rappels passent uniquement par des notifications push** (application installée sur l'écran d'accueil de l'iPhone).
5. **La progression se mesure par mois.** Les objectifs peuvent durer 7, 21 ou 40 jours ; on les ramène au mois par une règle de trois (§5).
6. **Aucun jour de repos par défaut.** L'utilisateur décide lui-même des tâches qu'il ajoute ou non à chaque jour.
7. **Discipline avec grâce.** Un bloc non fait s'estompe et reste à rattraper ; aucun message n'accuse. Pas de rouge punitif.
8. **Mobile d'abord** (iPhone, écran de 390 px), **nuit par défaut**, mode jour et mode automatique.
9. **Tout est personnalisable, mais avec des bases solides** : modèles de sous-projets par rubrique, métriques au choix, points du rapport au choix.

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Rubrique** | Grand domaine de vie (ex. « Ma relation avec Dieu »). Remplace le mot « thème ». Couleur propre. |
| **Projet** | Ensemble durable dans une rubrique (ex. « La lecture de la Bible »). Numéro du carnet conservé (« Projet 1 »). |
| **Sous-projet** | Objectif chiffré et daté dans un projet (ex. « 7 chapitres par jour », « Étudier le Nouveau Testament en octobre »). Un projet en a **0 à N**. |
| **Métrique** | Une mesure suivie par un sous-projet (temps, chapitres, dollars…). Elle a un type, une unité, un objectif et une période. |
| **Clé de métrique** | Identifiant qui relie une valeur saisie aux métriques qui la lisent (ex. `nombre:chapitres`, `temps`). Deux sous-projets qui ont la même clé lisent la même saisie. |
| **Tâche** | Ce qu'on ajoute au Fil : titre, heure, durée, récurrence, projet (facultatif), rappel. |
| **Occurrence** (ou **bloc**) | Une tâche à une date précise. C'est ce qu'on voit dans Le Fil, qu'on lance, qu'on coche, qu'on reporte. |
| **Saisie** | Ce qui a été réellement fait : valeurs (temps, chapitres, montant…), note, date. Rattachée au **projet**. |
| **Point du rapport** | Une ligne du rapport (code, libellé, métriques affichées). Ex. `BR` = lecture de la Bible. |
| **Rapport** | Texte généré chaque soir à partir des saisies, avec des récapitulatifs de semaine et de mois. |
| **Préréglage d'export** | Sélection nommée de points à exporter (« Groupe de prière · 5 », « Mentor · 12 »…). |
| **Archive** | Sous-projets accomplis et validés (anciennement « Ebenezer »), et rapports passés. |

## 3. Modèle de données

Toutes les tables ont `id uuid` (généré par le client pour permettre la saisie hors ligne), `user_id uuid` (propriétaire), `created_at` et `updated_at`. Les règles d'accès (§11) imposent `user_id = auth.uid()` partout.

| Table | Colonnes principales | Remarques |
|---|---|---|
| `profils` | `prenom`, `nom_rapport`, `langue_rapport` (`en`/`fr`), `fuseau` (défaut `America/Toronto`), `apparence` (`nuit`/`jour`/`auto`), `heure_rapport` (défaut 21:15), `rappel_defaut_min` (0/5/10/15, défaut 10), `titres_visibles` (bool), `devise` (défaut `CAD`) | Un par utilisateur. Titre de l'app = `prenom` + « Life ». |
| `rubriques` | `nom`, `couleur`, `ordre`, `archivee` | Ajout et retrait libres. |
| `projets` | `rubrique_id`, `numero`, `nom`, `ordre`, `statut` (`actif`/`pause`/`archive`) | Les 24 projets de départ : voir `04`. |
| `sous_projets` | `projet_id`, `nom`, `debut`, `fin` (peut être nulle), `statut`, `metrique_pilote_id`, `reprise_passe` (bool), `fiche` (json : quoi, pourquoi, qui, où, quand, comment, combien), `termine_le` | `statut` : `brouillon`, `en_cours`, `a_valider`, `termine`, `archive`. |
| `metriques` | `sous_projet_id`, `cle`, `type`, `nom`, `unite`, `cible`, `periode_cible` (`jour`/`semaine`/`mois`/`total`), `sens` (`plus`/`moins`), `options` (json, pour `choix`), `dans_rapport` (bool), `ordre` | Unique sur (`sous_projet_id`, `cle`). `cible` est en **unité de base** (§4). |
| `taches` | `titre`, `projet_id` (nul = rendez-vous), `regle` (json, §7), `heure_debut` (heure locale), `duree_min`, `rappel_min` (nul = aucun), `actif` | Les sous-projets alimentés sont dans `tache_alimente`. |
| `tache_alimente` | `tache_id`, `sous_projet_id` | Une ligne par sous-projet activé dans l'ajout de tâche. |
| `tache_attendus` | `tache_id`, `cle`, `valeur_prevue` | Valeurs proposées à chaque occurrence (ex. 45 min, 1 rencontre). |
| `occurrences` | `tache_id`, `debut`, `fin` (horodatages avec fuseau), `etat` (`prevue`/`en_cours`/`pause`/`faite`/`ignoree`), `demarree_a`, `pause_cumulee_s`, `terminee_a`, `exception` (bool) | Matérialisées sur 90 jours glissants (§7). |
| `saisies` | `projet_id` (nul si sans projet), `occurrence_id` (nul si saisie libre), `jour` (date), `source` (`bloc`/`focus`/`minuteur`/`manuel`/`rattrapage`), `note`, `approx` (bool) | **Une saisie par projet, par occurrence.** |
| `saisie_valeurs` | `saisie_id`, `cle`, `valeur_num`, `valeur_txt`, `detail` (json) | `detail` : passages lus `[{livre, de, a}]`, séances `[{min, approx}]`, catégorie d'un montant, etc. |
| `points_rapport` | `ordre`, `code`, `libelle`, `projet_id`, `mesures` (json : liste de `{cle, sous_projet_id, format}`), `actif` | Le code est libre et modifiable (BR, DDEWG, JEÛNE…). |
| `presets_export` | `nom`, `points` (liste d'identifiants de `points_rapport`) | |
| `rapports` | `jour`, `contenu` (json structuré), `genere_a`, `maj_a`, `envoye_a` | Le texte est composé à l'affichage, selon le préréglage et la langue. |
| `rappels` | `type` (`bloc`/`rapport`/`recap_semaine`/`recap_mois`), `occurrence_id`, `envoyer_a`, `etat` (`en_attente`/`envoye`/`echec`/`annule`), `cle_unique` | Clé unique : un rappel ne part qu'une seule fois. |
| `abonnements_push` | `endpoint`, `cle_p256dh`, `cle_auth`, `appareil`, `dernier_succes` | Un par appareil autorisé. |
| `modeles` | `rubrique`, `nom`, `definition` (json : sous-projet + métriques + calculs) | Fournis par l'app, en lecture seule. Le choix d'un modèle **copie** ses valeurs dans un nouveau sous-projet. |

## 4. Catalogue des métriques

Chaque valeur est stockée dans une **unité de base** exacte et convertie seulement à l'affichage. C'est ce qui évite les erreurs d'arrondi et les ressaisies.

| Type | Exemples | Unité de base | Affichage | Agrégation par défaut |
|---|---|---|---|---|
| **Temps** | prière 2 h, lecture 45 min | secondes | `2h15`, `0h28`, `~0h28` si approximatif | somme |
| **Fois** | rencontre dynamique 3 fois par jour | entier | `2/3` | somme |
| **Nombre** | chapitres, pages, versets, personnes, âmes, séances, pièces, articles (unité libre) | décimal | `166/417 p.` | somme |
| **Montant** ($) | entrées, sorties, épargne, dons | centimes + devise | `1 380,00 $` | somme |
| **Oui / Non** | don fait, lever à l'heure | 0 ou 1 | coche | somme (jours « oui ») |
| **Choix** | jeûne **complet** ou **partiel** | valeur de l'option (Complet = 1, Partiel = 0,5, Aucun = 0) | libellé de l'option | somme des valeurs |
| **Distance** | course de 5 km | mètres | `5,0 km` | somme |
| **Poids** | 75 kg | grammes | `75,5 kg` | **dernière valeur** (c'est un état) |
| **Note /10** | énergie, humeur | entier 0 à 10 | `8/10` | moyenne |
| **Pourcentage** | avancement d'un livrable | 0 à 100 | `60 %` | dernière valeur |
| **Heure** | heure du lever | minutes depuis minuit | `05:10` | moyenne ; peut viser « plus tôt = mieux » |
| **Référence** | passages lus, livre et auteur | texte | `Mt 8–10` | aucune (texte) |

**Règles**
- Une métrique a : un **type**, un **nom**, une **unité**, un **objectif** (facultatif) avec sa **période** (par jour, par semaine, par mois, au total), un **sens** (plus = mieux ou moins = mieux ; ex. dépenses), et l'option **« dans le rapport »**.
- L'utilisateur peut ajouter autant de métriques qu'il veut à un sous-projet, et choisir ou taper l'unité (des unités rapides sont proposées pour le type Nombre).
- **Passages** : une saisie de passages (Mode Focus) remplit à la fois la **Référence** (texte) et le **Nombre de chapitres**, calculé à partir du nombre de chapitres de chaque livre. Le total reste modifiable à la main.
- **Calculs automatiques** (catalogue fermé en v1, formules libres plus tard) :

| Calcul | Formule |
|---|---|
| Solde | Entrées − Sorties |
| Reste du budget | Budget − Sorties, et reste par jour jusqu'à la fin de la période |
| Taux d'épargne | Épargne ÷ Entrées |
| Rythme | Valeur cumulée ÷ jours écoulés |
| Durée moyenne | Temps ÷ Fois |
| Allure | Temps ÷ Distance |
| Personnes par heure | Personnes ÷ Temps |
| Chiffre d'affaires par heure | Montant ÷ Temps |
| Reste à épargner | Objectif − Épargné |
| Écart à la cible | Valeur − Cible (ex. heure du lever − 05:00) |
| Jours de jeûne | Complets + 0,5 × Partiels |

- **Modèles proposés par rubrique** (copiés puis ajustables) :
  - *Relation avec Dieu* : lecture biblique, rencontre quotidienne, prière, mémorisation de versets, jeûne, don à Dieu.
  - *Service à Dieu* : évangélisation, suivi de disciple, dons.
  - *Travail et études* : livrable à rendre, étude ou cours, entrepreneuriat.
  - *Vie personnelle* : budget du mois, sport, poids et santé, épargne maison, rangement du logement, réveil et sommeil, garde-robe.
  - Tout peut aussi partir de zéro.

## 5. Règles de progression

**Base : le mois civil.** La barre d'un sous-projet, d'un projet et d'une rubrique montre l'avancement **du mois en cours** par rapport à ce qui était attendu **ce mois-là**.

**Définitions** pour un sous-projet S, une métrique M de S et un mois X :
1. **Fenêtre** = période commune à S et à X : de `max(début de S, 1er du mois)` à `min(fin de S, dernier jour du mois)`. `jours_fenêtre` = nombre de jours de la fenêtre, bornes incluses.
2. **Cible du mois** (règle de trois) :

| Période de la cible | Cible du mois |
|---|---|
| Au total (ex. 40 jours, 260 chapitres) | `cible × jours_fenêtre ÷ jours_totaux_de_S` |
| Par jour | `cible × jours_fenêtre` |
| Par semaine | `cible × jours_fenêtre ÷ 7` |
| Par mois | `cible × jours_fenêtre ÷ jours_du_mois` |

3. **Réalisé** = agrégation des valeurs saisies pour la clé de M, aux jours de la fenêtre.
4. **Progression** = `réalisé ÷ cible du mois`. On **affiche** au plus 100 %, mais la valeur réelle est conservée (pour le rapport et l'Archive).
5. **Où je devrais être aujourd'hui** (le trait sur la barre) = `cible du mois × jours_écoulés ÷ jours_fenêtre`, aujourd'hui compris. **Retard** = attendu − réalisé, jamais présenté comme un échec : « à rattraper à 9,1 ch. par jour » (= ce qui reste ÷ jours restants).
6. **Cas particuliers**
   - *Sens « moins = mieux »* (dépenses) : la barre se remplit de la même façon, mais dépasser 100 % est signalé, et rester sous le trait est bon.
   - *Agrégation « dernière valeur »* (poids, pourcentage) : progression = `(valeur de départ − valeur actuelle) ÷ (valeur de départ − cible)`.
   - *Heure* : progression = part des jours où l'heure respecte la cible.
   - *Sous-projet sans objectif* : affiche « à définir », exclu des moyennes.
   - *Période « au total » sans date de fin* : interdit (la fin est obligatoire).

**Agrégation**
- **Sous-projet** : sa progression est celle de sa **métrique pilote** (choisie à la création, par défaut la première métrique qui a un objectif).
- **Projet** : moyenne simple des sous-projets qui ont une progression.
- **Rubrique** : moyenne simple de ses projets.

**Exemples vérifiables**
- *7 chapitres par jour*, du 1er au 31 octobre : cible du mois = 7 × 31 = **217** ; 23 lus → 10,6 % (affiché 11 %) ; au 5 octobre, attendu = 217 × 5 ÷ 31 = 35.
- *Étudier le Nouveau Testament*, 260 chapitres sur octobre : cible du mois = **260** ; au 5 octobre, attendu = 260 × 5 ÷ 31 = 42 ; objectif quotidien = 8,4.
- *Jeûne de 40 jours* du 15 octobre au 23 novembre : en octobre, cible = 40 × 17 ÷ 40 = **17** jours ; en novembre, 23.
- Un sous-projet de **7 jours** ou de **21 jours** suit la même règle, sur sa fenêtre.

## 6. Cycle de vie d'un sous-projet

`brouillon → en cours → à valider → terminé → archivé`

1. **En cours** : à partir de la date de début.
2. **À valider** : dès que la date de fin est passée, ou quand la cible « au total » est atteinte. L'app propose « Valider ce sous-projet ? » (notification et carte). Rien ne se termine en silence.
3. **Validation** : écran récapitulatif (réalisé et cible, durée, note finale facultative). L'utilisateur confirme → **terminé**. Il peut ensuite **signer** le document (PDF) ; le sous-projet entre dans l'**Archive**.
4. Un sous-projet **sans fin** ne se termine qu'à la main.
5. On peut **mettre en pause** un sous-projet (il sort des moyennes) et **le rouvrir** depuis l'Archive.
6. Au changement de mois, aucune clôture : les barres repartent de zéro pour le nouveau mois ; les sous-projets continuent.

**Création en cours de route et reprise du passé**
- Les saisies appartiennent au **projet**, pas au sous-projet. Un sous-projet lit les saisies de son projet qui portent **la même clé de métrique**, aux dates de sa période.
- À la création, l'option **« Reprendre les saisies existantes »** (activée par défaut) compte les saisies déjà faites sur la période du sous-projet, y compris avant sa création. L'écran annonce ce qui sera repris (ex. « 5 jours : 23 chapitres, 2 h 30 »). Désactivée, le sous-projet commence à zéro à sa date de création.
- Une métrique dont la clé n'a encore jamais été saisie démarre à zéro ; elle apparaît dans le volet des prochaines occurrences.

## 7. Tâches, occurrences et récurrences

**Ajout d'une tâche** (bouton **+** du Fil), dans cet ordre :
1. **Quoi** : titre (ex. « Rencontre avec Christopher »).
2. **Projet associé** : interrupteur. Activé : choisir la rubrique, puis le projet. Désactivé : **rendez-vous / réunion sans projet** (gris dans Le Fil, rappel actif, aucune saisie chiffrée sauf le temps).
3. **Sous-projets alimentés** : un interrupteur par sous-projet du projet, avec les mesures de chacun.
4. **Ce que la tâche enregistre** : l'union des métriques des sous-projets activés (sans doublon), avec une **valeur prévue** par occurrence (ex. 1 rencontre, 45 min).
5. **Quand** : jour de début, **récurrence**, heure de début (par pas de 15 min), durée (15, 30, 45, 60, 90 min), **vérification de disponibilité** (§7.3).
6. **Rappel** : à l'heure, 5, 10 ou 15 minutes avant.

### 7.1 Récurrences
| Choix | Détail |
|---|---|
| **Ce jour seulement** | Une occurrence, à la date choisie. |
| **Tous les jours** | À partir du jour de début. |
| **Chaque semaine** | Un ou plusieurs jours parmi L M M J V S D, et on lit « *N fois par semaine* ». Raccourcis : Lun. – Ven., Week-end, Tous les jours. |
| **Chaque mois** | « Le 8 de chaque mois » ou « le 2ᵉ jeudi du mois ». |
| **Fin** | Sans fin · jusqu'à une date · après N fois. |

Le tout apparaît dans les vues Jour, Semaine et Mois.

### 7.2 Occurrences
- Stockage de la règle : fréquence, intervalle, jours de semaine, jour du mois ou rang du jour, fin, **fuseau**. L'heure locale est conservée (05:00 reste 05:00 à l'heure d'été).
- Les occurrences sont **matérialisées sur 90 jours glissants** (à chaque modification et chaque nuit). Les occurrences passées ne changent plus.
- **Modifier ou supprimer** : « cette occurrence », « celle-ci et les suivantes » ou « toute la série ».
- **Reporter** (volet d'un bloc) : choisir le jour et l'heure, régler le rappel ; l'occurrence devient une exception de la série.
- L'utilisateur peut **associer plus tard** à un projet une tâche sans projet.

### 7.3 Disponibilité
- Le créneau choisi est comparé à **toutes** les occurrences du jour. S'il est libre : « Créneau libre ».
- S'il est occupé : l'app nomme la tâche en conflit et propose le créneau libre **le plus proche après** et **le plus proche avant**, de même durée, au pas de 5 min, dans la même journée. L'utilisateur peut accepter une suggestion ou **garder l'heure** (chevauchement permis).
- Une journée de plus de 12 h planifiées déclenche une alerte douce (« journée très chargée »).

## 8. La saisie unique

**Sources** : le volet d'un bloc, le minuteur, le Mode Focus, la saisie manuelle depuis un sous-projet (« Saisir un autre jour »), le rattrapage d'un jour passé.

**Règles**
1. Une saisie est rattachée au **projet** de la tâche ; tous ses sous-projets la lisent (§6).
2. **Correction manuelle** à tout moment : le volet permet de changer le temps (± 5 min ou saisie directe), les quantités, la référence, la note. Les barres et le rapport se recalculent aussitôt. La correction affiche d'abord ce qui était prévu et ce qui a été enregistré.
3. Une occurrence est **faite** quand l'utilisateur confirme (bouton « Fait », fin du minuteur, ou saisie). Sinon le cercle reste vide.

**Minuteur**
- Boutons ▶ (Lancer), ⏸ (Pause), ■ (Terminer), sur le bloc, dans la carte du bas, dans le volet et dans le Mode Focus.
- L'état est enregistré par **horodatage** : `demarree_a`, `pause_cumulee_s`. Le temps écoulé = maintenant − `demarree_a` − pauses. Il reste exact si l'app est fermée ou en arrière-plan.
- Le bloc **se remplit de gauche à droite**. À la fin prévue : « As-tu terminé ? » → **Oui** (bloc plein avec la coche, valeurs enregistrées) · **Corriger le temps** (ouvre le volet) · **Pas encore** (le minuteur continue). Si l'app était fermée, le message s'affiche à l'ouverture.

**Mode Focus**
- Anneau de temps, Pause, Terminer.
- **Passages lus** : livre (liste de suggestions), chapitre de début, chapitre de fin ; plusieurs entrées (ex. Matthieu 8–10, Luc 22). Le total de chapitres est calculé et comparé à l'objectif ; chaque entrée peut être retirée.
- Champ « Ce que Dieu me dit » (note).

## 9. Les rapports

**Points paramétrables** (Réglages)
- Un nombre quelconque de points (5, 10, 12…). Pour chaque point : **code** (libre, modifiable), nom, **projet lié**, métriques affichées avec, pour chacune, le sous-projet qui fournit l'objectif, et l'ordre.
- Codes par défaut : DDEWG (RDQD), PA (prière seule), BR (lecture de la Bible), CL (littérature chrétienne), PWO (prière avec d'autres), JEÛNE, DON-DIEU, DON-HOMME, EVANG, ÂMES, DISCIPLES, FRÈRES.

**Format du texte** : **toutes les métriques d'un point sont visibles, l'une après l'autre, séparées par des points-virgules**, sous la forme *fait / attendu*.
```
*Report · October 4, 2026 · Luther Kevin K.*

1. *DDEWG* : 2/3; ~0h28 (0h12; ~0h16)
2. *PA* : ~2h15/2h00
3. *BR* : 0/7 ch; réf. —; 0h00/0h45
4. *CL* :
   • _L’agressivité spirituelle_ (ZTF) : 166/417 p.; +24 p.; 0h35/0h30
5. *PWO* : 0h00/1h00
```
- `*gras*` et `_italique_` suivent la mise en forme de WhatsApp. `~` marque un temps approximatif. Les parenthèses détaillent les séances. Le titre et les libellés suivent la **langue du rapport** (English ou Français).

**Génération**
- Le **serveur** génère le rapport chaque jour à l'heure choisie (21:15 par défaut), même app fermée, puis envoie une notification « Ton rapport est prêt ».
- On peut le **régénérer** à la demande. Une saisie corrigée après l'envoi marque le rapport « modifié depuis l'envoi » ; l'ancien texte reste consultable.

**Récapitulatifs** : un onglet **Semaine** et un onglet **Mois** résument les rapports de la période (fait / attendu cumulé par point). Ils sont aussi exportables.

**Export**
- Bouton « Exporter le rapport » : choix des points (interrupteurs), **préréglages** nommés, aperçu du message, **Copier** et **Partager** (menu de partage du téléphone, donc WhatsApp).
- **Archives des rapports** : liste par jour, semaine, mois, avec recherche et marque « envoyé ».

## 10. Notifications et rappels

**Canal unique : notifications push.** Aucun e-mail.

| Type | Quand | Contenu | Au toucher |
|---|---|---|---|
| Rappel de bloc | Selon le réglage de la tâche (à l'heure, 5, 10, 15 min avant) | « Dans 10 min : RDQD du matin » | Ouvre l'écran **Action rapide** du bloc : Lancer · Reporter |
| Rapport prêt | À l'heure du rapport | « Ton rapport du 4 octobre est prêt » | Ouvre le rapport : Relire · Envoyer |
| Récap de la semaine | Dimanche 20:00 (réglable) | Score et point fort | Ouvre l'onglet Semaine |
| Récap du mois | Le 1er à 08:00 (réglable) | Score du mois | Ouvre l'onglet Mois |
| Sous-projet à valider | À la fin de la période | « Valider “Étudier le NT” ? » | Ouvre l'écran de validation |

**Contenu à l'écran verrouillé** : un réglage permet de masquer les titres (« Un bloc commence dans 10 min »).

**Limite connue de l'iPhone** : à ma connaissance, une notification d'app web **ne peut pas afficher de boutons d'action** sur iPhone. Toucher la notification ouvre donc directement l'écran **Action rapide** (Lancer en un geste). Des boutons sur la notification seraient possibles avec une enveloppe d'app native, plus tard. Ceci est à **vérifier sur ton iPhone** dès la première tranche des notifications.

**Fonctionnement**
- Le serveur lit les rappels à envoyer **chaque minute** et les envoie par Web Push. Chaque rappel a une **clé unique** : il ne part qu'une fois, même si le serveur relance.
- Modifier, reporter ou supprimer une occurrence **annule ou déplace** son rappel ; si la modification a eu lieu hors ligne, le rappel est mis à jour à la synchronisation (l'écran l'indique).
- Si le téléphone refuse la livraison (abonnement expiré), l'abonnement est supprimé et l'app affiche un bandeau « Notifications désactivées ».
- **Parcours de départ** : connexion → installation sur l'écran d'accueil (pas à pas) → demande d'autorisation (déclenchée par un appui) → test.
- Rappel de la contrainte iPhone : les notifications ne fonctionnent que si l'app est ouverte depuis son icône d'écran d'accueil (iOS 16.4 ou plus).

## 11. Authentification et vie privée

- **Connexion par e-mail et mot de passe** (Supabase Auth). Mot de passe d'au moins 12 caractères. L'inscription demande le **prénom**, qui devient le titre « {Prénom} Life ».
- **Seuls e-mails envoyés : ceux de gestion du compte** (réinitialisation du mot de passe, et confirmation d'adresse si activée). Ils ne contiennent aucune donnée de l'app.
- **Règles d'accès par ligne** sur toutes les tables : chaque utilisateur lit et écrit uniquement ses lignes. La clé de service n'est utilisée que par les fonctions du serveur.
- Aucun traceur ni statistique d'usage. Polices hébergées par l'app. Journal d'erreurs **sans contenu personnel**.
- **Export complet** des données (JSON) et **suppression du compte** sur demande, depuis les Réglages (Loi 25 du Québec et RGPD).

## 12. Écrans

| Écran | Planche des maquettes | Contenu et règles |
|---|---|---|
| **Connexion** | Connexion | Se connecter / Créer un compte, e-mail, mot de passe (afficher), prénom à la création, mot de passe oublié. |
| **Installation** | Installer | 4 étapes à cocher pour ajouter l'app à l'écran d'accueil. |
| **Autorisation des notifications** | AutoriserNotifications | Aperçu, délai par défaut, titres visibles, bouton qui ouvre la demande du système. |
| **Le Fil** (accueil) | Main, FilLance, FilConfirmer, FilVolet, FilReporter | Titre « {Prénom} Life », recherche, notifications, **+**. Sélecteur **Jour · Semaine · Mois**. Bandeau des jours **cliquable**. Journée de 24 h avec **ligne de l'heure en direct** et pastille de l'heure. Blocs de la couleur de la rubrique, ▶ pour lancer, bloc plein et coche si fait, cercle vide sinon, progression du mois du projet sur chaque bloc. Carte du bas : « En ce moment » / « Ensuite » avec Lancer, Pause, Terminer. |
| **Volet d'un bloc** | FilVolet | Fil d'Ariane, minuteur, **valeurs réalisées corrigeables** (avec réalisé / prévu), Marquer comme fait, Reporter, Mode Focus, liste des **sous-projets alimentés** avec leur barre et le trait « où je devrais être ». |
| **Reporter** | FilReporter | Jour, heure, rappel, disponibilité, créneaux libres juste avant et après. |
| **Mode Focus** | Focus | Voir §8. |
| **Action rapide** | ActionRapide | Ouverte par une notification : compte à rebours, Lancer maintenant, Reporter, Voir le Fil. |
| **Semaine** | Semaine | Grille de 7 colonnes avec les blocs placés à leur heure (fait, prévu, non fait), ligne de l'heure, légende, « Remplis ma semaine ». Les récapitulatifs chiffrés sont dans **Rapports**. |
| **Mois** | Mois | Grille du mois. Couche **Charge** : barre de proportions par rubrique dans chaque jour. Couche **Accompli** : intensité selon le % fait. Statistiques du mois et progression par rubrique. Toucher un jour ouvre Le Fil de ce jour. |
| **Recherche** | Recherche | Projets, sous-projets, tâches, saisies et notes, rapports ; filtres ; recherches récentes ; insensible aux accents. |
| **Rapports** | Rapport, RapportSemaine, RapportMois, RapportExport, Archives | Voir §9. |
| **Projets** | Projets, ProjetsEdition | Progression du mois par rubrique, projets avec leurs sous-projets dépliables, mode **Modifier** (ajouter ou retirer projets, sous-projets, rubriques). |
| **Sous-projet** | SousProjet, SousProjetNT, SousProjetFiche, SousProjetDocument, SousProjetTemps, SousProjetFinances | Onglets **Suivi** (objectif et réalisé du jour, graphique du mois, retard et rattrapage), **Fiche** (7 questions, métriques, tâches liées, statut), **Document** (aperçu vivant, PDF, signature), **Temps** (à venir, historique). Exemple en dollars : solde, entrées, sorties, catégories, mouvements. |
| **Nouveau sous-projet** | NouveauSousProjet, NouveauSousProjetFinances | Modèles par rubrique, nom, période, **reprise du passé**, métriques éditables, calculs automatiques. |
| **Ajouter une tâche** | AjouterTache, AjouterTacheSansProjet | Voir §7. |
| **Archive** | Archive, ArchiveRapports | Onglets **Accomplis** (avec le verset 1 Samuel 7:12) et **Rapports**. |
| **Réglages** | Reglages | Prénom, nom dans le rapport, langue du rapport, points du rapport et mesures, exports enregistrés, notifications (appareil, titres visibles), quels rappels recevoir, apparence. |

## 13. Hors ligne et synchronisation

- **Lecture** sans réseau : les 90 jours de blocs, les projets, les saisies récentes et les rapports sont en cache sur l'appareil.
- **Écriture** sans réseau : cocher, lancer le minuteur, saisir, corriger, reporter. Les modifications entrent dans une **file d'attente** et partent au retour du réseau. Les identifiants sont créés sur l'appareil, donc rejouer la file ne crée pas de doublon.
- **Conflits** : le dernier enregistrement gagne, champ par champ, selon l'horloge du serveur. Une suppression l'emporte sur une modification plus ancienne.
- Un indicateur discret montre l'état : « synchronisé », « en attente (3) », « hors ligne ».
- Ce qui dépend du serveur (rappels, rapport du soir) est indiqué comme tel quand l'appareil est hors ligne.

## 14. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| **Performance** | Le Fil s'affiche en moins de 1 s depuis le cache, et en moins de 2,5 s au premier chargement sur 4G. Animations à 60 images par seconde. Poids du code de l'app inférieur à 150 Ko compressés (hors polices). |
| **Accessibilité** | Contraste AA (4,5:1 pour le texte courant). Cibles tactiles d'au moins 44 px. Étiquettes pour VoiceOver sur tous les boutons-icônes. Taille de texte dynamique. Respect de « réduire les animations ». Les couleurs ne portent jamais seules une information (la coche et le cercle s'ajoutent à la couleur). |
| **Langue et formats** | Interface en français canadien. Dates « 5 oct. 2026 », heures sur 24 h, montants « 1 380,00 $ », semaine du lundi au dimanche. Rapport en English ou Français. |
| **Fiabilité** | Aucune saisie perdue : écriture locale d'abord, puis envoi. Sauvegardes quotidiennes du serveur. Export complet disponible. |
| **Sécurité** | Règles d'accès par ligne sur toutes les tables ; secrets hors du dépôt ; communications chiffrées ; mots de passe jamais lus par l'app (gérés par le service d'authentification). |
| **Installation** | PWA : icône, nom, écran de lancement, plein écran, mise à jour avec message « nouvelle version disponible ». |
| **Testabilité** | Les calculs (progression, récurrence, disponibilité, rapport, passages) sont des fonctions pures couvertes par des tests unitaires ; les parcours clés sont couverts par des tests de bout en bout. |

## 15. Histoires utilisateur et critères d'acceptation

Format : *En tant que moi, je veux… afin de…*. Chaque critère est vérifiable.

**US-01 · Compte.** Je veux créer un compte et me connecter avec e-mail et mot de passe.
- La création demande prénom, e-mail et mot de passe de 12 caractères au moins ; le prénom devient le titre « {Prénom} Life ».
- Après connexion, mes projets par défaut (voir `04`) et mes modèles sont déjà présents.
- Je peux réinitialiser mon mot de passe.

**US-02 · Installation.** Je veux ajouter l'app à l'écran d'accueil de mon iPhone.
- Un pas à pas en 4 étapes s'affiche au premier lancement.
- L'icône et le nom « {Prénom} Life » apparaissent sur l'écran d'accueil ; l'app s'ouvre en plein écran.

**US-03 · Notifications.** Je veux autoriser les notifications.
- La demande du système n'apparaît qu'après un appui sur « Autoriser les notifications ».
- Je choisis le délai par défaut (à l'heure, 5, 10 ou 15 min) et l'affichage des titres.
- Si j'ai refusé, un bandeau me l'indique dans les Réglages avec la marche à suivre.

**US-04 · Le Fil du jour.** Je veux voir ma journée sur 24 h.
- La ligne de l'heure descend en direct avec une pastille de l'heure ; l'écran s'ouvre sur « maintenant ».
- Chaque bloc a la couleur de sa rubrique, un cercle (vide) ou une coche (fait), et la progression du mois de son projet.
- Un bloc sans projet est gris.

**US-05 · Jours, semaine, mois.** Je veux changer de jour, de semaine et de mois.
- Toucher un jour du bandeau affiche ce jour ; les jours passés montrent ce qui a été fait, les jours futurs ce qui est prévu.
- La vue **Semaine** place chaque bloc à son heure dans 7 colonnes.
- La vue **Mois** montre, au choix, la charge (proportions par rubrique) ou l'accompli (intensité) ; toucher un jour ouvre ce jour.

**US-06 · Minuteur.** Je veux lancer, mettre en pause et terminer un bloc.
- ▶ sur un bloc : il se remplit de gauche à droite ; le temps est exact même app fermée (calcul par horodatage).
- Pause et reprise sont possibles depuis le bloc, la carte du bas, le volet et le Mode Focus.
- À la fin prévue : « As-tu terminé ? » avec Oui, Corriger le temps, Pas encore.

**US-07 · Saisir et corriger.** Je veux noter ce que j'ai fait, une seule fois, et le corriger au besoin.
- Le volet affiche chaque métrique avec « réalisé / prévu » et des boutons − et +.
- Après correction (ex. 20 min au lieu de 30), les barres de tous les sous-projets liés et le rapport changent immédiatement.

**US-08 · Mode Focus et passages.** Je veux saisir librement mes lectures.
- Je saisis livre, chapitre de début, chapitre de fin, autant de fois que nécessaire ; le total de chapitres se calcule et se compare à l'objectif.
- Le total et la référence alimentent les sous-projets de lecture et le rapport.

**US-09 · Ajouter une tâche.** Je veux ajouter une tâche liée à un projet.
- Le parcours suit §7 : titre → projet → sous-projets alimentés → valeurs prévues → quand → rappel.
- La récurrence propose ce jour seulement, tous les jours, chaque semaine (jours choisis, « N fois par semaine »), chaque mois (jour du mois ou rang du jour), avec une fin.
- La tâche apparaît dans les vues Jour, Semaine et Mois à toutes ses occurrences.

**US-10 · Rendez-vous sans projet.** Je veux ajouter une réunion qui n'alimente aucun projet.
- Désactiver « Associer à un projet » masque les sous-projets et les métriques.
- Le rendez-vous apparaît en gris, avec son rappel ; je peux l'associer à un projet plus tard.

**US-11 · Disponibilité.** Je veux savoir si un créneau est libre.
- Libre : message « Créneau libre ».
- Occupé : l'app nomme la tâche en conflit et propose le créneau libre le plus proche **après** et **avant**, de même durée.
- Je peux garder l'heure malgré le chevauchement.

**US-12 · Reporter.** Je veux déplacer un bloc.
- Je choisis le jour et l'heure, et le rappel (5, 10, 15 min avant) ; les mêmes vérifications de disponibilité s'appliquent.
- Seule l'occurrence concernée bouge ; la série reste intacte.

**US-13 · Modifier une série.** Je veux changer ou supprimer une tâche récurrente.
- Je choisis : cette occurrence, celle-ci et les suivantes, ou toute la série.
- Les rappels des occurrences touchées sont recalculés.

**US-14 · Rubriques et projets.** Je veux ajouter et retirer des rubriques, des projets et des sous-projets.
- Le mode Modifier permet chaque ajout et chaque retrait ; retirer demande une confirmation et conserve les saisies passées (archivées).
- Les projets par défaut sont ceux de `04`, sans le projet 24.

**US-15 · Nouveau sous-projet depuis un modèle.** Je veux créer un sous-projet en quelques touches.
- Les modèles de la rubrique sont proposés ; choisir un modèle remplit nom, période, métriques et calculs.
- Tout reste modifiable ; « Partir de zéro » est possible.

**US-16 · Métriques personnalisées.** Je veux choisir et régler mes métriques.
- Je peux ajouter les 12 types du §4, nommer la métrique, choisir ou taper l'unité, fixer l'objectif et sa période, choisir le sens, et décider si elle va dans le rapport.
- Pour le type Choix, les valeurs des options (ex. complet = 1, partiel = 0,5) sont modifiables.

**US-17 · Reprise du passé.** Je veux qu'un sous-projet créé plus tard compte ce qui a déjà été fait.
- L'écran annonce ce qui sera repris (ex. « 5 jours : 23 chapitres, 2 h 30 »).
- Activé : ces valeurs sont comptées sans ressaisie. Désactivé : le sous-projet commence à zéro.

**US-18 · Progression mensuelle.** Je veux voir où j'en suis ce mois-ci.
- Les barres suivent les règles du §5 ; les exemples chiffrés du §5 sont des tests d'acceptation (217 → 11 %, 260 → 42 attendus au 5 oct., 17 jours de jeûne en octobre).
- Le trait montre où je devrais être ; le retard s'énonce « à rattraper à X par jour ».

**US-19 · Valider un sous-projet.** Je veux clore un sous-projet.
- À la fin de la période ou quand la cible est atteinte, l'app propose de valider ; rien ne se termine seul.
- Après validation, le sous-projet est dans l'Archive, avec son PDF si je l'ai signé.

**US-20 · Fiche et document.** Je veux une fiche de suivi qui se remplit seule.
- La fiche contient les 7 questions (quoi, pourquoi, qui, où, quand, comment, combien).
- Le document aperçu se met à jour à chaque saisie ; je peux l'exporter en PDF et le signer au doigt.

**US-21 · Finances.** Je veux suivre entrées, sorties et épargne en dollars.
- Les montants sont exacts au cent ; le solde, le reste du budget et les sorties par catégorie se calculent seuls.
- Les mouvements saisis dans un bloc apparaissent dans le sous-projet sans ressaisie.

**US-22 · Rapport du jour.** Je veux un rapport chaque soir.
- Il est généré à l'heure choisie, même app fermée ; il suit le format du §9 (métriques séparées par des points-virgules).
- Une notification m'avertit qu'il est prêt.

**US-23 · Paramétrer les points.** Je veux choisir les points du rapport et leurs mesures.
- Je peux ajouter, retirer, réordonner les points, renommer leur code, choisir les métriques affichées.
- Le changement s'applique aux prochains rapports et à l'aperçu.

**US-24 · Exporter.** Je veux envoyer seulement certains points.
- Je choisis les points ou un préréglage ; l'aperçu montre le message exact ; Copier et Partager fonctionnent.
- Les préréglages sont enregistrables.

**US-25 · Récapitulatifs.** Je veux le bilan de la semaine et du mois.
- Les onglets Semaine et Mois totalisent chaque point (fait / attendu) et sont exportables.
- Les archives listent tous les rapports, avec recherche.

**US-26 · Rappels.** Je veux être prévenu avant chaque bloc.
- La notification arrive au délai choisi ; la toucher ouvre l'écran Action rapide (Lancer, Reporter).
- Un rappel ne part jamais deux fois ; reporter ou supprimer un bloc corrige son rappel.

**US-27 · Recherche.** Je veux retrouver n'importe quoi.
- Un champ unique cherche dans projets, sous-projets, tâches, saisies et notes, rapports ; il ignore les accents et la casse.
- Je peux filtrer par type et relancer une recherche récente.

**US-28 · Hors ligne.** Je veux utiliser l'app sans réseau.
- Je peux consulter, cocher, saisir, lancer le minuteur et reporter ; tout se synchronise au retour du réseau, sans doublon.
- L'état de synchronisation est visible.

**US-29 · Mes données.** Je veux garder le contrôle de mes données.
- Je peux exporter toutes mes données et supprimer mon compte.
- Aucun e-mail contenant mes données n'est jamais envoyé.

**US-30 · Apparence.** Je veux choisir nuit, jour ou automatique.
- Le choix s'applique à tous les écrans et se mémorise.

## 16. Hors périmètre de la v1

- Import de calendriers externes (Apple, Google) ; la question reste ouverte (§17).
- Partage avec un mentor, co-signature.
- Formules de calcul libres ; objectifs annuels détaillés.
- Widgets d'écran d'accueil ; minuteur en direct sur l'écran verrouillé ; boutons d'action sur les notifications iPhone (nécessitent une app native).
- Assistant IA qui crée un sous-projet à partir d'une phrase.
- Notifications par e-mail ou SMS (écartées par choix de confidentialité).

## 17. Questions ouvertes

| # | Question | Impact |
|---|---|---|
| Q1 | Tes rendez-vous sont-ils déjà dans Apple ou Google Calendar ? Veux-tu les voir dans Le Fil en lecture seule ? | Import de calendrier |
| Q2 | Les e-mails de gestion du compte (réinitialisation du mot de passe, confirmation d'adresse) sont-ils acceptés ? Ils ne contiennent aucune donnée de l'app. | Authentification |
| Q3 | Un seul utilisateur au départ, ou d'autres personnes auront-elles leur compte ? | Jeu de données initial, inscription ouverte ou fermée |
| Q4 | Le document final signé (modèle LaTeX d'origine) doit-il être reproduit à l'identique ? | Technique de génération du PDF |
| Q5 | Les boutons d'action sur la notification sont-ils indispensables ? Sur iPhone, il faudrait une app native. | Choix web ou enveloppe native |
| Q6 | Quel hébergement et quel nom de domaine pour l'app ? | Mise en ligne, notifications |
