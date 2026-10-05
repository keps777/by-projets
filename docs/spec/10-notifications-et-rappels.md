# §10 — Notifications et rappels

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

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

## Précisions issues de la construction (5 oct. 2026)
- Changer le délai de rappel par défaut met à jour les tâches qui suivaient l'ancien délai : les rappels futurs sont annulés puis recréés.
- Reporter propose « À l'heure », 5, 10 et 15 min.
- Le toucher d'une notification n'ouvre que des adresses de l'app.
- Se réabonner sur le même appareil réutilise la ligne `abonnements_push` existante (`supprime_le` remis à nul).
- **Plusieurs rappels par tâche** : le rappel principal (À l'heure, 5, 10 ou 15 min) plus des rappels « plus tôt » cumulables — 1 h, 2 h, 1 jour, 1 jour et 2 h, 2 jours avant (`taches.rappels_avant_min`, minutes avant le début). Chaque délai donne un rappel distinct par occurrence (clé `occurrence:délai`) ; un rappel dont l'heure est passée n'est pas créé. Le texte de la notification écrit le délai comme on le dit (« Dans 2 h », « Dans 1 jour et 2 h »). Reporter une occurrence garde ses rappels plus tôt.
