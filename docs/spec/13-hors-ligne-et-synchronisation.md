# §13 — Hors ligne et synchronisation

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

- **Lecture** sans réseau : les 90 jours de blocs, les projets, les saisies récentes et les rapports sont en cache sur l'appareil.
- **Écriture** sans réseau : cocher, lancer le minuteur, saisir, corriger, reporter. Les modifications entrent dans une **file d'attente** et partent au retour du réseau. Les identifiants sont créés sur l'appareil, donc rejouer la file ne crée pas de doublon.
- **Conflits** : le dernier enregistrement gagne, **ligne par ligne** (et non champ par champ), selon l'horloge du serveur (`updated_at`, posé par le serveur). Les écritures se font dans l'ordre parents → enfants. Une suppression l'emporte sur une modification plus ancienne.
- Un indicateur discret montre l'état : « synchronisé », « en attente (3) », « hors ligne ».
- Ce qui dépend du serveur (rappels, rapport du soir) est indiqué comme tel quand l'appareil est hors ligne.
