# §9 — Les rapports

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

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

## Précisions issues de la construction (5 oct. 2026)
- L'écran Rapports s'ouvre toujours sur l'onglet **Jour** et sur **la journée en cours** ; avant l'heure du rapport (21 h 15 par défaut) elle est présentée « en cours », sans rouge. Les flèches mènent aux jours précédents.
- **Modifier à la main** : dans l'onglet Jour, toucher la carte d'un point ouvre la saisie du jour (comme « Saisir un autre jour » d'un sous-projet) avec les mesures du point ; l'enregistrement met à jour la saisie manuelle du projet, donc tous ses sous-projets, les barres et le rapport. Un point sans projet ou sans mesure explique comment le régler.
- Archive et Archives ne comptent pas le jour en cours avant l'heure du rapport.
- Le jour en cours n'est jamais présenté comme un échec : un zéro s'affiche en encre normale et le résumé dit « Journée en cours · rapport à 21:15 ».

## Chrono sur chaque point (onglet Jour, 5 oct. 2026)
- Chaque carte de point qui a une mesure de **temps** et un projet porte un petit bouton **▶**. Le toucher **lance une session** : le chrono tourne sur la carte (et une pastille rouge marque l'onglet Rapports depuis les autres écrans) ; il survit au rechargement de l'app.
- Toucher **■** arrête la session et ouvre la **pop-up de fin** : le temps y est déjà noté ; on peut remplir les **autres mesures** du point (nombre de fois — proposé à 1 —, chapitres, pages, références ; pour la Bible, les passages se choisissent par les menus et donnent le nombre de chapitres) ou **valider tel quel**. « Plus tard » garde la session arrêtée, « à valider » ; « Annuler la session » l'oublie.
- Valider écrit une **saisie du projet** (source « minuteur »). Les sessions d'un même jour **s'additionnent** au total du point et de ses sous-projets ; la correction manuelle du jour reste possible. Un seul chrono par point à la fois ; plusieurs points peuvent chronométrer en même temps. Réservé à la journée en cours.

## Objectif du jour d'un point (6 oct. 2026)
Quand un projet a plusieurs sous-projets qui suivent la même mesure, l'objectif du jour d'un point vient **d'abord d'un sous-projet à objectif quotidien** (« 10 chapitres par jour », « 1 h par jour »), puis, à défaut, du plus récent. Un objectif « au total » ou mensuel (« Lire tout le Nouveau Testament ») n'écrase plus l'objectif quotidien : il donnerait « 0h01 » au lieu de « 1h00 ». Le choix explicite d'un sous-projet pour une mesure (Réglages → Points du rapport) reste prioritaire.
