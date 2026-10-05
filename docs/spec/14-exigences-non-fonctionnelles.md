# §14 — Exigences non fonctionnelles

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

| Domaine | Exigence |
|---|---|
| **Performance** | Le Fil s'affiche en moins de 1 s depuis le cache, et en moins de 2,5 s au premier chargement sur 4G. Animations à 60 images par seconde. Poids du code de l'app inférieur à 150 Ko compressés (hors polices). |
| **Accessibilité** | Contraste AA (4,5:1 pour le texte courant). Cibles tactiles d'au moins 44 px. Étiquettes pour VoiceOver sur tous les boutons-icônes. Taille de texte dynamique. Respect de « réduire les animations ». Les couleurs ne portent jamais seules une information (la coche et le cercle s'ajoutent à la couleur). |
| **Langue et formats** | Interface en français canadien. Dates « 5 oct. 2026 », heures sur 24 h, montants « 1 380,00 $ », semaine du lundi au dimanche. Rapport en English ou Français. |
| **Fiabilité** | Aucune saisie perdue : écriture locale d'abord, puis envoi. Sauvegardes quotidiennes du serveur. Export complet disponible. |
| **Sécurité** | Règles d'accès par ligne sur toutes les tables ; secrets hors du dépôt ; communications chiffrées ; mots de passe jamais lus par l'app (gérés par le service d'authentification). |
| **Installation** | PWA : icône, nom, écran de lancement, plein écran, mise à jour avec message « nouvelle version disponible ». |
| **Testabilité** | Les calculs (progression, récurrence, disponibilité, rapport, passages) sont des fonctions pures couvertes par des tests unitaires ; les parcours clés sont couverts par des tests de bout en bout. |
