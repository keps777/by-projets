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
