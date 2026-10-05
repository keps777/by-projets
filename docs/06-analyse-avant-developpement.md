# 06 — Analyse avant développement : ce qui manque pour que ce soit propre et complet

> Rédigé le 5 oct. 2026, après la v2 des maquettes. Classé par urgence : **A** = à trancher avant la première ligne de code, **B** = à prévoir dans la construction, **C** = peut attendre.

## A. À trancher ou à écrire avant de coder

| # | Sujet | Pourquoi c'est bloquant | Proposition |
|---|---|---|---|
| A1 | **La spécification est périmée** | `01` à `03` décrivent l'ancienne v1 (4 modes de suivi, données locales, « Ebenezer », emploi du temps en v1.1). `CLAUDE.md` exige que la spec précède le code. | Réécrire `02-specification.md` (v2) à partir de `05`, puis supprimer ce qui est obsolète. |
| A2 | **Le modèle de métriques** | C'est le cœur : tout (progression, rapport, document) en dépend. | Un seul modèle : type, unité, objectif + période, sens, « dans le rapport ». Calculs dérivés choisis dans un **catalogue** (pas de formules libres en v1). |
| A3 | **Règles de progression** | Les barres sont mensuelles, mais les objectifs sont par jour, semaine, mois, total ou sur 40 jours. | Écrire un tableau de règles (prorata d'un projet à cheval sur deux mois, mois de 28 à 31 jours, dépassement au-delà de 100 %, jours de pause, trait « où je devrais être ») et le tester. |
| A4 | **Récurrence** | « Chaque jeudi », « sauf cette semaine », « changer toute la série » : sans règles, les blocs deviennent incohérents. | Modèle de récurrence standard (RRULE), exceptions par occurrence, fuseau America/Toronto avec heure d'été. Vocabulaire fixe : *tâche* → *occurrence* → *saisie*. |
| A5 | **Qui alimente quoi** | Une saisie est lue par plusieurs sous-projets. Cas limites : unités différentes, sous-projet créé en cours de mois, saisie corrigée après coup, saisie sans tâche (imprévu). | Saisie rattachée au **projet** ; chaque sous-projet calcule ce qu'il lit. Un sous-projet créé en cours de mois peut compter ou non le passé (choix à la création). |
| A6 | **Comptes et accès** | Le titre « {Prénom} Life » suggère plusieurs utilisateurs possibles. | Connexion par lien magique envoyé par e-mail ; règles d'accès par ligne dès le départ ; un seul rôle en v1. |
| A7 | **Hors ligne et synchronisation** | À 5 h du matin, il peut ne pas y avoir de réseau. Les données vivent sur le serveur. | Cache local ; file d'attente des saisies ; en cas de conflit, le dernier écrit gagne champ par champ. **Le minuteur enregistre l'heure de départ**, pas des secondes comptées. |
| A8 | **Rappels côté serveur** | Plusieurs pièges : doublons, fuseau, app fermée, pause pendant les vacances. | Tâche planifiée chaque minute ; chaque rappel envoyé une seule fois ; liens profonds (« Lancer » ouvre le bon bloc) ; interrupteur « pause des rappels ». E-mail d'abord, push ensuite. |
| A9 | **Fournisseur d'e-mails** | Un expéditeur fiable est nécessaire pour ne pas finir dans les courriers indésirables. | Service d'envoi (Resend, offre gratuite) ; idéalement un nom de domaine à toi, sinon l'expéditeur de test, limité à ton adresse. |
| A10 | **Données de départ et premier lancement** | Les 24 projets et les modèles doivent exister dès la première ouverture. | Données initiales fournies (voir `04`) ; parcours : prénom → installer sur l'écran d'accueil → autoriser les notifications → vérifier les rappels. |

## B. À prévoir pendant la construction

**Écrans manquants dans les maquettes**
- Connexion, installation sur l'écran d'accueil (pas à pas pour iPhone), demande d'autorisation des notifications.
- États vides, chargement, erreur, **bandeau hors ligne**, annuler la dernière action.
- Modifier une tâche récurrente : « cette occurrence » ou « toute la série ».
- Recherche ; vue **Semaine** ou **Mois** du calendrier (présente en v1, retirée en v2) ; alerte de surcharge d'une journée.
- Détail d'un projet accompli dans l'Archive ; clôture de fin de mois (reporter ou archiver les sous-projets).
- Jours de repos, vacances, maladie : une pause globale qui ne compte pas comme retard.
- Export et sauvegarde des données, suppression du compte.

**Rapport**
- Générer côté serveur à l'heure choisie, même app fermée. Que devient un rapport déjà envoyé si on corrige une saisie après coup ? Proposition : version corrigée, ancienne conservée.
- Notation du temps approximatif (« ~0h28 »), détails de séances « (0h12; ~0h16) », langue (English / Français) et modèle de texte par point.
- Partage par le menu de partage du téléphone (WhatsApp) en conservant `*gras*` et `_italique_`.

**Qualité visuelle et accessibilité**
- Jetons de design partagés (couleurs nuit / jour, polices, espacements) au lieu des styles répétés des maquettes.
- Vérifier les contrastes (AA), VoiceOver, taille de texte dynamique, réduction des animations.
- Polices hébergées par l'app (pas par Google) : plus rapide, fonctionne hors ligne, respecte la vie privée.
- Dates et montants au format canadien-français (« 1 380,00 $ »), pluriels corrects.

**Technique**
- Tests : calculs (progression, récurrence, disponibilité, rapport) en tests unitaires ; parcours clés en tests de bout en bout ; intégration continue sur GitHub.
- Deux environnements Supabase (développement et production) ; migrations SQL versionnées ; secrets hors du dépôt.
- Sauvegardes : offre payante de Supabase, ou export quotidien automatique.
- PWA : icône, écran de lancement, mise à jour du service worker avec message « nouvelle version disponible », éviction du stockage sur iOS.
- Hébergement (Cloudflare Pages, Vercel ou Netlify), HTTPS, nom de domaine.
- Journal d'erreurs pour savoir ce qui casse sur ton téléphone.

**Vie privée et sécurité**
- Données spirituelles et financières : règles d'accès strictes, aucun traceur tiers, e-mails **sans notes privées**.
- Loi 25 (Québec) / RGPD : export et suppression des données à la demande.

## C. Peut attendre
- Import en lecture seule d'Apple Calendar (question toujours ouverte : tes rendez-vous sont-ils déjà ailleurs ?).
- Partage avec un mentor ou discipleur, co-signature.
- Formules libres pour les métriques, objectifs annuels détaillés.
- Widget d'écran d'accueil, minuteur en direct sur l'écran verrouillé (demanderait une app native).
- Assistant IA qui crée un sous-projet à partir d'une phrase.

## Ordre de construction proposé
0. Spécification v2, jetons de design, projet Supabase (schéma, règles d'accès, connexion).
1. Noyau de calcul avec tests : métriques, progression, récurrence, disponibilité, rapport.
2. Le Fil : blocs, minuteur, saisies, volet, report.
3. Projets, sous-projets, modèles, ajout de tâche.
4. Rapports : jour, semaine, mois, export.
5. Rappels et rapport par e-mail (serveur).
6. Application installable, hors ligne, notifications push.
7. Document, signature, Archive.
8. Finitions : accessibilité, performance, sauvegardes.
