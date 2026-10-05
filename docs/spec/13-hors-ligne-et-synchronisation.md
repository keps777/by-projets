# §13 — Hors ligne et synchronisation

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

- **Lecture** sans réseau : les 90 jours de blocs, les projets, les saisies récentes et les rapports sont en cache sur l'appareil.
- **Écriture** sans réseau : cocher, lancer le minuteur, saisir, corriger, reporter. Les modifications entrent dans une **file d'attente** et partent au retour du réseau. Les identifiants sont créés sur l'appareil, donc rejouer la file ne crée pas de doublon.
- **Conflits** : le dernier enregistrement gagne, **ligne par ligne** (et non champ par champ), selon l'horloge du serveur (`updated_at`, posé par le serveur). Les écritures se font dans l'ordre parents → enfants. Une suppression l'emporte sur une modification plus ancienne.
- Un indicateur discret montre l'état : « synchronisé », « en attente (3) », « hors ligne ».
- Ce qui dépend du serveur (rappels, rapport du soir) est indiqué comme tel quand l'appareil est hors ligne.

## Précisions issues de la construction (5 oct. 2026)
- Chaque tirage relit une marge de 5 minutes avant le curseur (transactions lentes) ; les lignes déjà connues à l'identique sont ignorées.
- Une ligne refusée par le serveur ne bloque pas les autres : le lot est renvoyé ligne par ligne, la ligne refusée reste en file et l'état passe à « erreur ».
- Une suppression l'emporte sur une modification plus ancienne (comparée à l'heure de l'appareil, déclencheur `horodater`).
- Avec le serveur, l'horizon de 90 jours des occurrences n'est prolongé qu'après la première synchronisation réussie.
- Une heure locale absente (passage à l'heure d'été) avance ; une heure qui existe deux fois prend la première.
