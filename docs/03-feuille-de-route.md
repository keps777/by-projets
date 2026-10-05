# 03 — Feuille de route : de l'idée à l'exécution

## Où en est le projet ?

Le cycle de vie d'un projet logiciel, en méthode *spec-driven development* :

| # | Étape | Question | Livrable | État |
|---|---|---|---|---|
| 0 | **Idéation** | Quel est le besoin ? | Le mémo vocal | ✅ fait |
| 1 | **Cadrage / Vision** | Pourquoi, pour qui, quel périmètre ? | `01-vision.md` | ✅ brouillon, **à valider** |
| 2 | **Spécification** | *Quoi* exactement ? | `02-specification.md`, maquette | 🟡 **← tu es ici** |
| 3 | **Conception technique** | *Comment* ? (architecture, technologies) | `04-architecture.md` | ⬜ |
| 4 | **Découpage en tâches** | Dans quel ordre ? | Tâches/issues GitHub | ⬜ |
| 5 | **Réalisation itérative** | Construire, tester, livrer, tranche par tranche | Code, PWA installée | ⬜ |
| 6 | **Usage et amélioration** | Ça marche dans ma vraie vie ? | Retours, v1.1, v1.2… | ⬜ |

Tu sors de l'**idéation**. Tu entres dans la **spécification** : on transforme l'idée en une description précise et vérifiable de ce que l'app doit faire. **Ne pas coder avant la fin de cette étape** évite de reconstruire trois fois.

## Ce que tu dois faire maintenant

1. **Relire et corriger** `01-vision.md` et `02-specification.md`. Signale tout ce que j'ai mal compris ou que tu veux autrement.
2. **Envoyer ton modèle LaTeX** de fiche de suivi. C'est la pièce la plus structurante : il fixe les champs du document, donc le modèle de données et la technique de génération du PDF.
3. **Lister tes vrais contenus** : tes thèmes, et pour 3 à 5 sous-projets réels, la fiche QQOQCCP et le type de suivi. Ils serviront de données de test et vérifieront que le modèle tient la route.
4. **Répondre aux questions ouvertes** ci-dessous.
5. **Tester la maquette** (`prototype/index.html`) sur ton téléphone et noter ce qui te plaît ou te gêne.

Une fois ces 5 points faits, on passe à l'étape 3 (architecture), puis on découpe le MVP en tâches et on construit.

## Questions ouvertes

| # | Question | Pourquoi c'est important |
|---|---|---|
| Q1 | Peux-tu partager ton modèle LaTeX ? Faut-il le reproduire **à l'identique** ? | Choix de la technique PDF (voir D2) |
| Q2 | Dans « Mon service à Dieu », le 2ᵉ projet évoqué était-il **« Prière »** ? (l'audio était peu clair, on entend « des frais ») | Exactitude de la vision |
| Q3 | Évangélisation : l'objectif est-il un **nombre d'heures** par semaine ou par jour ? Faut-il aussi compter des personnes (âmes gagnées, disciples suivis) ? | Mode Quantitatif : une ou plusieurs mesures |
| Q4 | Usage sur **un seul appareil** au début, ou téléphone et ordinateur synchronisés dès la v1 ? | Hors ligne seul ou avec un serveur |
| Q5 | Signature : **au doigt dans l'app**, impression puis signature à la main, ou les deux ? | Portée de US-7 |
| Q6 | Un mentor ou discipleur doit-il un jour **voir ou co-signer** ? | Comptes utilisateurs et partage (v2) |
| Q7 | Une activité de l'emploi du temps peut-elle servir **plusieurs** sous-projets ? | Modèle de données |

## Décisions techniques à prendre (étape 3)

**D1. Socle applicatif.** Recommandation : **PWA** en TypeScript (Vite + React ou SvelteKit) avec stockage local **IndexedDB** (via Dexie), sans serveur au départ. C'est installable, ça marche hors ligne, et ça ne coûte rien à héberger (GitHub Pages, Netlify ou Vercel). La synchronisation (par exemple Supabase) pourra venir en v1.3 sans tout refaire.

**D2. Génération du document PDF.** Deux options, à trancher **après avoir vu le modèle LaTeX** :

| Option | Avantages | Inconvénients |
|---|---|---|
| **A. LaTeX côté serveur** (Tectonic dans une petite fonction) | Fidélité totale à ton modèle existant | Il faut un serveur ; pas d'export hors ligne ; aperçu plus lent |
| **B. Port du modèle vers Typst** (compilé dans le navigateur en WebAssembly) | Aperçu instantané, PDF hors ligne, aucun serveur | Il faut traduire le gabarit une fois (syntaxe proche de LaTeX) |

Préférence actuelle : **B**, qui colle aux principes « hors ligne d'abord » et « aperçu en direct ».

**D3. Hébergement et dépôt.** Code dans ce dépôt (`by-projets`), déploiement automatique à chaque push.

## Découpage indicatif du MVP (étape 5)

| Tranche | Contenu | Résultat visible |
|---|---|---|
| T1 | Squelette PWA, navigation, stockage local, export/import JSON | App installable et vide |
| T2 | Thèmes, projets, sous-projets, fiche QQOQCCP (US-1, 2, 3) | Je structure ma vie |
| T3 | Tableau de suivi, génération des lignes, coche (US-4, 5) | Je suis mes sous-projets |
| T4 | Vue Aujourd'hui (US-8) | Mon point d'entrée quotidien |
| T5 | Document : aperçu, PDF, signature, Ebenezer (US-6, 7) | Mon premier sous-projet signé |
| T6 | Finitions mobiles, hors ligne, mode sombre (US-9, 10) | **v1 utilisée au quotidien** |

Chaque tranche se termine par une version **utilisable** sur ton téléphone. Tu commences à t'en servir dès T3, et l'usage réel guide la suite.
