# §3 — Modèle de données

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

Toutes les tables ont `id uuid` (généré par le client pour permettre la saisie hors ligne), `user_id uuid` (propriétaire), `created_at` et `updated_at`. Les règles d'accès (§11) imposent `user_id = auth.uid()` partout.

| Table | Colonnes principales | Remarques |
|---|---|---|
| `profils` | `prenom`, `nom_rapport`, `langue_rapport` (`en`/`fr`), `fuseau` (défaut `America/Toronto`), `apparence` (`nuit`/`jour`/`auto`), `heure_rapport` (défaut 23:45), `rappel_defaut_min` (0/5/10/15, défaut 10), `titres_visibles` (bool), `devise` (défaut `CAD`) | Un par utilisateur. Titre de l'app = `prenom` + « Life ». |
| `rubriques` | `nom`, `couleur`, `ordre`, `archivee` | Ajout et retrait libres. |
| `projets` | `rubrique_id`, `numero`, `nom`, `ordre`, `statut` (`actif`/`pause`/`archive`) | Les 24 projets de départ : voir `04`. |
| `sous_projets` | `projet_id`, `nom`, `debut`, `fin` (peut être nulle), `statut`, `metrique_pilote_id` (pilote principale), `metriques_pilotes` (uuid[] : toutes les pilotes de la barre), `reprise_passe` (bool), `fiche` (json : quoi, pourquoi, qui, où, quand, comment, combien), `termine_le` | `statut` : `brouillon`, `en_cours`, `a_valider`, `termine`, `archive`. |
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

## Précisions issues de la construction (5 oct. 2026)
- `profils` porte `recevoir_bloc`, `recevoir_rapport`, `recevoir_recap_semaine`, `recevoir_recap_mois` (quels rappels recevoir) ; le serveur annule sans envoyer un rappel d'un type désactivé.
- `saisie_valeurs.detail` d'un mouvement d'argent vaut `{libelle, categorie}` (un champ vide vaut `null`).
- Les occurrences ne sont **plus uniques par (tâche, jour)** : un bloc reporté peut rejoindre un jour qui a déjà son bloc régulier. L'identifiant déterministe évite les doublons.
- `rapports.id` est déterministe : `uuid(rapport:<utilisateur>:<jour>)`, identique côté app et côté serveur.
