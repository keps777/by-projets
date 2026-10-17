# Revue de fidélité des 77 planches (AM-182)

Banc : `pnpm fidelite --all` (AM-004), Chromium, horloge figée au 05/01/2027 07:38 (Africa/Douala), flag conception actif.
Code mesuré : branche `claude/project-thread-4tov6d` au commit `99a27cb`, plus la correction d'AM-182 décrite plus bas
(`tools/fidelite/ecrans.json`, planche `CadenceBillet`). Seuil : 3 % des pixels pour toutes les planches (`tools/fidelite/seuils.json`
ne contient aucun seuil propre à une planche, donc aucune justification de seuil à examiner). Mesure du 17/10/2026.

## Bilan

|                                                            | Planches                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| Conformes (écart ≤ 3 %)                                    | 75                                                       |
| Hors seuil                                                 | 0                                                        |
| Écran absent                                               | 2 (`Parcours`, `Systeme`, par conception, voir plus bas) |
| Erreurs du banc, avertissements (police, badge conception) | 0                                                        |

La passe de mesure finale (une seule exécution complète, code de sortie 0) donne 75 conformes sur les 75 planches qui ont un écran.
Écart le plus élevé : `SuperviseurVoir` 2,80 %, puis `Pass` 1,85 %, `GuichetColis` 1,70 %, `Proche` 1,63 %, `Config` 1,33 %.
Toutes les autres sont sous 1,25 %. Marge la plus faible par rapport au seuil : `SuperviseurVoir` (0,20 point), à surveiller si l'écran bouge.

## Tableau planche, écart, statut

Les captures (`maquette.png`, `app.png`, `diff.png`) et `rapport.html` sont dans `tools/fidelite/sortie/`, dossier ignoré par git :
elles ne sont pas versionnées et se régénèrent avec la commande en fin de document.

| Planche                | Écart  | Seuil | Statut       | Captures (non versionnées)                      |
| ---------------------- | ------ | ----- | ------------ | ----------------------------------------------- |
| Analyses               | 0,40 % | 3 %   | Conforme     | `tools/fidelite/sortie/Analyses/`               |
| AnalysesBus            | 0,75 % | 3 %   | Conforme     | `tools/fidelite/sortie/AnalysesBus/`            |
| AnalysesLigne          | 0,00 % | 3 %   | Conforme     | `tools/fidelite/sortie/AnalysesLigne/`          |
| Arret                  | 0,00 % | 3 %   | Conforme     | `tools/fidelite/sortie/Arret/`                  |
| Assistant              | 0,18 % | 3 %   | Conforme     | `tools/fidelite/sortie/Assistant/`              |
| AssistantReponse       | 0,53 % | 3 %   | Conforme     | `tools/fidelite/sortie/AssistantReponse/`       |
| Cadence                | 0,21 % | 3 %   | Conforme     | `tools/fidelite/sortie/Cadence/`                |
| CadenceBillet          | 0,82 % | 3 %   | Conforme     | `tools/fidelite/sortie/CadenceBillet/`          |
| CadenceQuai            | 0,02 % | 3 %   | Conforme     | `tools/fidelite/sortie/CadenceQuai/`            |
| Caisse                 | 0,10 % | 3 %   | Conforme     | `tools/fidelite/sortie/Caisse/`                 |
| Chauffeur              | 0,56 % | 3 %   | Conforme     | `tools/fidelite/sortie/Chauffeur/`              |
| ColisCode              | 0,46 % | 3 %   | Conforme     | `tools/fidelite/sortie/ColisCode/`              |
| ColisEnvoi             | 0,94 % | 3 %   | Conforme     | `tools/fidelite/sortie/ColisEnvoi/`             |
| Comptable              | 0,19 % | 3 %   | Conforme     | `tools/fidelite/sortie/Comptable/`              |
| ComptableApercu        | 0,11 % | 3 %   | Conforme     | `tools/fidelite/sortie/ComptableApercu/`        |
| ComptableCloture       | 0,17 % | 3 %   | Conforme     | `tools/fidelite/sortie/ComptableCloture/`       |
| ComptableRapprochement | 0,06 % | 3 %   | Conforme     | `tools/fidelite/sortie/ComptableRapprochement/` |
| Conducteur             | 0,03 % | 3 %   | Conforme     | `tools/fidelite/sortie/Conducteur/`             |
| Config                 | 1,33 % | 3 %   | Conforme     | `tools/fidelite/sortie/Config/`                 |
| ConfigEquipeListe      | 0,05 % | 3 %   | Conforme     | `tools/fidelite/sortie/ConfigEquipeListe/`      |
| ConfigLigne            | 0,00 % | 3 %   | Conforme     | `tools/fidelite/sortie/ConfigLigne/`            |
| ConfigPersonne         | 0,32 % | 3 %   | Conforme     | `tools/fidelite/sortie/ConfigPersonne/`         |
| ConfigRegles           | 0,02 % | 3 %   | Conforme     | `tools/fidelite/sortie/ConfigRegles/`           |
| Connexion              | 0,08 % | 3 %   | Conforme     | `tools/fidelite/sortie/Connexion/`              |
| Controle               | 0,01 % | 3 %   | Conforme     | `tools/fidelite/sortie/Controle/`               |
| Controleur             | 0,50 % | 3 %   | Conforme     | `tools/fidelite/sortie/Controleur/`             |
| Convoyeur              | 0,18 % | 3 %   | Conforme     | `tools/fidelite/sortie/Convoyeur/`              |
| Course                 | 0,29 % | 3 %   | Conforme     | `tools/fidelite/sortie/Course/`                 |
| Covoit                 | 0,94 % | 3 %   | Conforme     | `tools/fidelite/sortie/Covoit/`                 |
| CovoitConducteur       | 0,56 % | 3 %   | Conforme     | `tools/fidelite/sortie/CovoitConducteur/`       |
| CovoitVille            | 0,47 % | 3 %   | Conforme     | `tools/fidelite/sortie/CovoitVille/`            |
| Depot                  | 0,03 % | 3 %   | Conforme     | `tools/fidelite/sortie/Depot/`                  |
| Direct                 | 0,54 % | 3 %   | Conforme     | `tools/fidelite/sortie/Direct/`                 |
| Financement            | 0,10 % | 3 %   | Conforme     | `tools/fidelite/sortie/Financement/`            |
| FinancementDemande     | 0,09 % | 3 %   | Conforme     | `tools/fidelite/sortie/FinancementDemande/`     |
| Groupe                 | 0,82 % | 3 %   | Conforme     | `tools/fidelite/sortie/Groupe/`                 |
| Guichet                | 0,00 % | 3 %   | Conforme     | `tools/fidelite/sortie/Guichet/`                |
| GuichetColis           | 1,70 % | 3 %   | Conforme     | `tools/fidelite/sortie/GuichetColis/`           |
| InterAgences           | 0,33 % | 3 %   | Conforme     | `tools/fidelite/sortie/InterAgences/`           |
| InterAgencesConvention | 0,14 % | 3 %   | Conforme     | `tools/fidelite/sortie/InterAgencesConvention/` |
| Livraison              | 0,35 % | 3 %   | Conforme     | `tools/fidelite/sortie/Livraison/`              |
| Livreur                | 0,24 % | 3 %   | Conforme     | `tools/fidelite/sortie/Livreur/`                |
| LivreurDevenir         | 0,78 % | 3 %   | Conforme     | `tools/fidelite/sortie/LivreurDevenir/`         |
| LivreurVerification    | 0,12 % | 3 %   | Conforme     | `tools/fidelite/sortie/LivreurVerification/`    |
| Main                   | 0,73 % | 3 %   | Conforme     | `tools/fidelite/sortie/Main/`                   |
| MainFiltres            | 1,18 % | 3 %   | Conforme     | `tools/fidelite/sortie/MainFiltres/`            |
| MainVille              | 1,23 % | 3 %   | Conforme     | `tools/fidelite/sortie/MainVille/`              |
| Modules                | 0,00 % | 3 %   | Conforme     | `tools/fidelite/sortie/Modules/`                |
| Moi                    | 0,57 % | 3 %   | Conforme     | `tools/fidelite/sortie/Moi/`                    |
| Paiement               | 0,02 % | 3 %   | Conforme     | `tools/fidelite/sortie/Paiement/`               |
| Parcours               | —      | 3 %   | Écran absent | aucune capture (pas d’écran)                    |
| Pass                   | 1,85 % | 3 %   | Conforme     | `tools/fidelite/sortie/Pass/`                   |
| Patron                 | 0,84 % | 3 %   | Conforme     | `tools/fidelite/sortie/Patron/`                 |
| PatronEquipe           | 0,10 % | 3 %   | Conforme     | `tools/fidelite/sortie/PatronEquipe/`           |
| PatronGare             | 0,40 % | 3 %   | Conforme     | `tools/fidelite/sortie/PatronGare/`             |
| PatronPersonne         | 0,11 % | 3 %   | Conforme     | `tools/fidelite/sortie/PatronPersonne/`         |
| Proche                 | 1,63 % | 3 %   | Conforme     | `tools/fidelite/sortie/Proche/`                 |
| Quai                   | 0,02 % | 3 %   | Conforme     | `tools/fidelite/sortie/Quai/`                   |
| RapportSoir            | 0,57 % | 3 %   | Conforme     | `tools/fidelite/sortie/RapportSoir/`            |
| Relais                 | 0,00 % | 3 %   | Conforme     | `tools/fidelite/sortie/Relais/`                 |
| RelaisApp              | 0,24 % | 3 %   | Conforme     | `tools/fidelite/sortie/RelaisApp/`              |
| RelaisDevenir          | 0,18 % | 3 %   | Conforme     | `tools/fidelite/sortie/RelaisDevenir/`          |
| RelaisInscription      | 0,20 % | 3 %   | Conforme     | `tools/fidelite/sortie/RelaisInscription/`      |
| RelaisVerification     | 0,09 % | 3 %   | Conforme     | `tools/fidelite/sortie/RelaisVerification/`     |
| Reseau                 | 0,53 % | 3 %   | Conforme     | `tools/fidelite/sortie/Reseau/`                 |
| SiegePay               | 0,38 % | 3 %   | Conforme     | `tools/fidelite/sortie/SiegePay/`               |
| Splash                 | 0,28 % | 3 %   | Conforme     | `tools/fidelite/sortie/Splash/`                 |
| Superviseur            | 0,00 % | 3 %   | Conforme     | `tools/fidelite/sortie/Superviseur/`            |
| SuperviseurDebloquer   | 0,97 % | 3 %   | Conforme     | `tools/fidelite/sortie/SuperviseurDebloquer/`   |
| SuperviseurEquipe      | 0,38 % | 3 %   | Conforme     | `tools/fidelite/sortie/SuperviseurEquipe/`      |
| SuperviseurValider     | 0,74 % | 3 %   | Conforme     | `tools/fidelite/sortie/SuperviseurValider/`     |
| SuperviseurVoir        | 2,80 % | 3 %   | Conforme     | `tools/fidelite/sortie/SuperviseurVoir/`        |
| Systeme                | —      | 3 %   | Écran absent | aucune capture (pas d’écran)                    |
| Tuto                   | 0,00 % | 3 %   | Conforme     | `tools/fidelite/sortie/Tuto/`                   |
| USSD                   | 0,42 % | 3 %   | Conforme     | `tools/fidelite/sortie/USSD/`                   |
| Vendeur                | 0,12 % | 3 %   | Conforme     | `tools/fidelite/sortie/Vendeur/`                |
| Vente                  | 0,71 % | 3 %   | Conforme     | `tools/fidelite/sortie/Vente/`                  |

## Planche corrigée pendant la revue : CadenceBillet

Première passe : 18,37 % (relance seule : 19,23 %, donc pas un faux positif lié à la charge de la machine). Après correction : 0,82 %.

Cause précise : l'écran `apps/web/src/ecrans/CadenceBillet/EcranCadenceBillet.tsx` n'est pas en cause. Ouvert sans paramètre `billet`
(c'était l'adresse déclarée au banc, `/guichet/cadence/vendu`), il retombe volontairement sur « le dernier billet vendu sur cet appareil »,
lu par `useCadenceEtat`. Or, sous `?scenario=CadenceBillet`, cette lecture est servie par le scénario de la planche `Cadence`, dont le dernier
billet est le 0231, alors que le scénario `CadenceBillet` ne connaît que le billet 0232 (`billet-alp-dla-270105-0232`). La relecture du 0231
répond 404 et les nouvelles tentatives de la requête laissent le squelette de chargement à l'écran pendant la capture : une app vide face à
une maquette pleine. Ce n'est ni un défaut de mise en page ni un écart de design : l'adresse déclarée n'identifiait pas le billet.

Correction : `tools/fidelite/ecrans.json`, route de `CadenceBillet` passée à
`/guichet/cadence/vendu?billet=billet-alp-dla-270105-0232`, exactement l'adresse que l'écran `Cadence` ouvre après une vente
(`?billet=<billetId>`). Aucun changement de code d'écran, aucun changement de design. Ce fichier est hors du périmètre strict du ticket
(`docs/fidelite/**`) : une ligne, à valider à la fusion.

Point hors fidélité : sur l'adresse ouverte à la main sans `billet`, quand le dernier billet n'est pas relisible (404), l'écran affiche
le squelette le temps des nouvelles tentatives avant l'état vide. À regarder si l'on veut un état vide immédiat sur 404.

## Planches sans écran livré

Aucune planche qui devrait avoir un écran n'en est dépourvue : les 75 planches qui ont une route ont un écran livré et mesuré.
Deux planches n'ont pas d'écran, et c'est voulu (`apps/web/src/coquille/planches.ts`) :

- `Parcours` (1760 × 1500) : spécification des tests de parcours, pas un écran de l'application (le dossier `tests/parcours/` existe).
- `Systeme` (1600 × 1500) : référence du design system, pas un écran de l'application.

Leur écart n'est donc pas mesuré (le banc les liste « écran absent » et ne les compte pas comme un échec). Si une comparaison visuelle de
`Systeme` avec la page de kit `/dev/kit` est souhaitée, elle demande un ticket dédié.

## Vérification : les planches ont un écran qui n'est plus un EcranVide

- Les 75 entrées de `PLANCHES` ont leur fichier `apps/web/src/routes/<route>.tsx`, et chacun importe `@/ecrans/<Planche>` (vérifié planche par
  planche par script : 75 sur 75, aucune route qui pointe vers l'écran d'une autre planche).
- Aucun fichier sous `apps/web/src/routes/` ne référence `EcranVide` : le composant `coquille/ecran-vide.tsx` n'est utilisé par aucune route.
- Il existe un dossier `apps/web/src/ecrans/<Planche>/` pour chacune des 75 planches (les deux planches sans dossier sont `Parcours` et `Systeme`).
- Preuve visuelle : les 75 écarts sont sous 3 %, ce qu'un écran vide ne peut pas atteindre face à des planches pleines.
- Écarts à signaler : aucun. Les routes `dev/kit` et `dev/roles` sont des pages de développement, hors planches.

## Reproduire

```
pnpm --filter @afrimove/web exec vite --port <port 5200-5999> --strictPort   # app en mode démo
pnpm fidelite --all --app-url http://localhost:<port>
```

Rapport HTML côte à côte : `tools/fidelite/sortie/rapport.html` ; JSON : `tools/fidelite/sortie/resultats.json`.
