# §11 — Authentification et vie privée

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

- **Connexion par e-mail et mot de passe** (Supabase Auth). Mot de passe d'au moins 12 caractères. L'inscription demande le **prénom**, qui devient le titre « {Prénom} Life ».
- **Un seul utilisateur en v1.** L'inscription n'est ouverte que le temps de créer le compte, puis elle est fermée.
- **Aucun e-mail n'est envoyé**, pas même pour gérer le compte : pas de confirmation d'adresse, pas de récupération de mot de passe en v1. En cas d'oubli, l'administrateur change le mot de passe depuis le tableau de bord de Supabase.
- **Règles d'accès par ligne** sur toutes les tables : chaque utilisateur lit et écrit uniquement ses lignes. La clé de service n'est utilisée que par les fonctions du serveur.
- Aucun traceur ni statistique d'usage. Polices hébergées par l'app. Journal d'erreurs **sans contenu personnel**.
- **Export complet** des données (JSON) et **suppression du compte** sur demande, depuis les Réglages (Loi 25 du Québec et RGPD).

## Précisions issues de la construction (5 oct. 2026)
- La base elle-même refuse un deuxième compte (déclencheur sur `auth.users`) : l'inscription reste fermée même si le réglage du tableau de bord est oublié.
