# §18 — Le Carnet

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

Le Carnet est **un seul livre** où se retrouvent toutes les notes de l'utilisateur, jour après jour, **numérotées sans interruption** (1, 2, 3, 4…) dans l'ordre où elles ont été écrites, quelle que soit l'activité où elles ont été prises. Il sert à garder des choses précises qui aident dans la vie.

## Règles
1. **Une note** = un texte, un jour, un **numéro** continu (le plus grand numéro + 1 au moment de l'écriture ; un numéro n'est jamais renuméroté), l'heure de l'écriture et son **origine**.
2. **Origines** : `libre` (écrite depuis Le Fil ou depuis le Carnet), `focus` (écrite pendant un bloc en Mode Focus), `bloc` (note d'un bloc fait ou lancé), `saisie` (note jointe à une saisie manuelle dans un sous-projet).
3. **Référence** : une note prise pendant un bloc garde son contexte même si le bloc est ensuite supprimé — le titre du bloc et l'heure sont copiés dans la note. Toucher la référence ouvre le bloc quand il existe encore.
4. **Chaque jour est une page.** Le Carnet s'ouvre sur la page du jour ; **glisser** vers la droite ouvre la page précédente qui contient des notes, vers la gauche la suivante. Un **sommaire** liste les pages (date, nombre de notes, numéros de … à …).
5. **Note libre** : le bouton « Carnet » du Fil mène à la page du jour avec le champ d'écriture ouvert ; la note est ajoutée au livre avec le numéro suivant.
6. **Mode Focus** : à la place de l'ancienne zone « Ce que Dieu me dit », le Focus propose d'écrire plusieurs notes numérotées, ajoutées au Carnet pendant le bloc. À la fin du bloc, le texte de ces notes est aussi gardé dans la note de la saisie (les tableaux des sous-projets la montrent toujours).
7. **Modifier / supprimer** une note : toucher la note. Supprimer laisse un trou dans la numérotation (les autres numéros ne changent pas).
8. **Recherche** : les notes sont dans la recherche (filtre « Notes »).
9. **Vie privée** : comme toutes les données, les notes sont à l'utilisateur seul (règles d'accès par ligne), jamais envoyées ailleurs ; aucun e-mail.

## Données
Table `notes` : `jour`, `texte`, `numero`, `origine`, `heure` (minutes depuis minuit, heure locale), `occurrence_id` (facultatif), `projet_id` (facultatif), `source_label` (titre du bloc, copié), `contenu` (HTML nettoyé d'une note riche, facultatif).

## Notes riches : texte mis en forme, images et vidéos (nov. 2026)

Une note du Carnet peut s'écrire comme dans un document : **paragraphes**, titres, gras, italique, souligné, listes à puces ou numérotées, citation, séparateur, liens, **images** et **vidéos** placées dans le texte.

- **Éditeur** : le bouton « Note riche » (à droite du champ d'écriture du Carnet) ouvre un éditeur plein écran avec une barre d'outils : Titre · Sous-titre · Paragraphe, **G**ras, *I*talique, Souligné, liste à puces, liste numérotée, citation, séparateur, lien, **Image**, **Vidéo**, annuler / rétablir. Entrée crée un paragraphe ; coller du texte garde les paragraphes (la mise en forme venue d'ailleurs est nettoyée). Enregistrer ajoute la note au livre (numéro suivant) ; toucher une note riche la rouvre dans l'éditeur ; le champ d'écriture rapide reste pour une note d'une ligne.
- **Images** : choisies dans la photothèque ou prises à l'appareil ; réduites à 1600 px au plus (JPEG) avant d'être gardées. **Vidéos** : choisies dans la photothèque, 50 Mo au plus par fichier, lues dans la note.
- **Données** : `notes.contenu` (HTML **nettoyé** : p, titres, listes, citation, séparateur, liens http(s), gras/italique/souligné, `figure` avec `img` ou `video`) ; `notes.texte` garde le **texte brut** équivalent (recherche, export, aperçu). Les médias sont référencés par identifiant (`data-media`) et gardés sur l'appareil (IndexedDB) ; avec le serveur, ils sont envoyés dans le bucket privé **`carnet`** (dossier = identifiant de l'utilisateur) dès que le réseau le permet, et retéléchargés à la demande sur un autre appareil. Hors ligne, tout reste lisible et modifiable.
- **Sécurité** : le HTML est nettoyé à l'écriture et à l'affichage (liste blanche de balises et d'attributs, aucun script, aucun style en ligne, liens `http(s)` seulement, `rel="noopener"`). Les médias ne sont lisibles que par leur propriétaire (règles d'accès du bucket).
- **Hors périmètre** : tableaux, couleurs de texte, dessin, partage à d'autres personnes, transcodage des vidéos.

## Bibliothèque (23 nov. 2026)
L'onglet Carnet s'ouvre sur une **bibliothèque** (étagère de couvertures en relief). Un **livre** a un titre et une **couleur de couverture** (12 teintes ou libre) ; chaque **chapitre ou sous-chapitre est une note riche** (éditeur du §18 riche) rangée dans le livre. Page d'un livre : couverture, nombre de chapitres, mots, pages estimées (250 mots = 1 page, objectif 100 pages), **table des matières** (réordonnable ↑↓), « Nouveau chapitre ». **Lecture** : liseuse papier à pages (colonnes), toucher les bords ou le curseur pour tourner, « p. n / N ». Stockage sans colonne nouvelle : couverture = note `source_label = livre-couv:<id>` (texte JSON), chapitre = note `source_label = livre:<id>` ; le journal du jour ne les montre pas. Le journal reste accessible par l'icône calendrier (`/carnet?vue=journal`).

### Thèmes (24 nov. 2026)
Un livre peut porter un **thème** (champ libre dans la couverture, avec suggestions des thèmes existants). La bibliothèque affiche des **pastilles de filtre** (Tous · thèmes · Sans thème) et range les livres en **étagères par thème** (ordre alphabétique, « Sans thème » en dernier). Les livres existants sont « Sans thème ». Un nouveau livre hérite du filtre actif.

### Pages et arborescence (24 nov. 2026)
Un chapitre peut avoir des **pages** (et une page, des sous-pages) : une page est un chapitre rangé sous un autre, son parent est la clé `p` de la partie JSON de `source_label` (aucune colonne de plus). La table des matières est une **arborescence** : numéros « 1 », « 1.1 », « 1.1.1 », retrait par niveau, ▾/▸ pour replier, « + » pour ajouter une page, ↑/↓ pour réordonner parmi les pages d'un même parent. La lecture suit l'ordre de l'arbre (« Chapitre 1 », « Page 1.1 »). Supprimer un chapitre fait remonter ses pages d'un niveau.

## La Bible (§19, 25 nov. 2026)
Écran `/bible` : lecture sombre façon YouVersion. **Le ▶ d'un bloc de lecture de la Bible** (tâche qui attend des passages / chapitres, ou projet BR) lance le chrono **et ouvre la Bible**, version Darby par défaut ; une pastille ⏱ ramène au Mode Focus.
- **Textes libres de droits** servis par livre (`/bible/<version>/<n>.json`, chapitres → versets) : **Darby** (français), **Martin 1744** (français), **King James** (anglais). Gardés hors ligne par le service worker après la première lecture de chaque livre. Position et version retenues sur l'appareil.
- **En-tête** : « Jean 3 ▾ » ouvre une feuille **Ancien / Nouveau Testament → livres → chapitres** ; pastille de version (DARBY ▾) pour changer ; flèches chapitre précédent / suivant.
- **Versets** : un appui sélectionne (plusieurs possibles) ; la barre d'actions propose **5 couleurs de soulignement** (et la gomme), **Copier** (texte + référence + version) et **Note**. Les soulignements vivent dans une note par chapitre biblique (`source_label` `bible-surl:<livre>.<chapitre>`), cachée du journal et des livres.
- **Note** : éditeur de livre ; la page créée dans le cahier **« Notes durant mes lectures bibliques »** (créé au besoin, thème « Bible ») a le **titre laissé vide** (« Sans titre » à renommer dans le cahier), **ta note d'abord, puis le(s) verset(s)** cités avec leur référence ; puis la fenêtre **Lieu et date** (propositions déjà utilisées, date d'au moins l'année).

### Étagères par thème (25 nov. 2026)
La bibliothèque affiche un bandeau (livres · thèmes · chapitres), les pastilles de thème, puis **une étagère par thème** : titre en italique serif, compteur, filet de la couleur du premier livre, couvertures en rangée défilante posée sur une planche ; un thème choisi dans les pastilles affiche ses livres en grille. Sous chaque livre, une pastille « ＋ Thème » (ou son thème) ouvre le **classement rapide** : thèmes existants et suggestions (Bible, Prière, Croisade, Lectures, Famille, Vie spirituelle), thème libre, ou retirer. Tant qu'aucun thème n'existe, un encadré invite à ranger la bibliothèque. Le cahier des notes bibliques est repris sous tout titre proche de « Notes … lectures bibliques ».

### Notes libres et filtre par thème (25 nov. 2026)
- Le bouton ✎ de l'en-tête de la bibliothèque (à la place du calendrier du journal) ouvre une **note libre** : page au titre vide dans le livre par défaut **« Notes libres à classer »** (créé au besoin), avec la fenêtre circonstance / lieu / date.
- Le filtre par thème est une **liste déroulante** (feuille : « Tous les thèmes », chaque thème avec son nombre de livres, « Sans thème ») ; il reste lisible avec beaucoup de thèmes.

Quand on **ajoute une page à un chapitre qui n'en a pas**, le contenu du chapitre devient sa **première page** (même titre, même signature, numéro « 1.1 ») ; le chapitre ne garde que son **titre**, modifiable séparément ; la page ajoutée est la « 1.2 ». À la lecture, le titre du chapitre n'est pas répété sur sa première page.

### Pages comptées pour ce qu'elles sont, thèmes ordonnables (25 nov. 2026)
Plus d'équivalents « ≈ N p. » ni de nombre de mots : **une page créée est une page**. Un livre compte ses pages écrites (un chapitre sans page compte pour une ; un chapitre qui a des pages compte celles-ci, pas lui-même). L'ordre des **thèmes** (étagères) se change dans la liste déroulante des thèmes avec ↑ ↓ ; il est gardé dans une note cachée (`biblio-ordre:themes`), « Sans thème » reste en dernier.

### Règle métier : chapitre d'une page ou chapitre à pages (25 nov. 2026)
Le type d'un chapitre se choisit **dès la création** (« Nouveau chapitre ») :
- **Une seule page** : le chapitre est la page (titre, texte, signature lieu / date). Pas de « + ».
- **Plusieurs pages** : on ne donne que le **titre** du chapitre (clé `k: 'c'` dans `source_label`, pas de signature), puis on écrit sa **première page**, dont le titre reprend celui du chapitre (modifiable à part). Seuls ces chapitres ont le « + » pour ajouter des pages ; un chapitre qui porte déjà des pages est traité comme tel.
- **Lecture** : un chapitre à pages **s'ouvre sur sa propre page, titre au centre** (horizontalement et verticalement) ; ses pages suivent (« Page 3.1 »…).
- **Compte** : seules les pages écrites comptent (un chapitre à pages ne compte pas lui-même).
Un chapitre à pages garde toujours un titre (non vide).
