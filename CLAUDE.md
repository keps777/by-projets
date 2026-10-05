# CLAUDE.md

Projet **Luther Life** (nom de dépôt : By Projets) : PWA personnelle de pilotage de vie par projets (Rubrique → Projet → Sous-projet → Métriques → Saisie → Rapport).

## Langue et approche
- **Français** partout (interface, docs, messages de commit).
- **Spec-driven** : toute fonctionnalité existe d'abord dans `docs/spec/` ; mettre la spec à jour avant ou avec le code.
- Principes : mobile d'abord (iPhone, PWA), nuit par défaut, données sur Supabase avec cache hors ligne, rappels par notifications push uniquement, **aucun e-mail**, « discipline avec grâce ». Ne jamais committer de clé secrète ni l'adresse e-mail de l'utilisateur.

## Carte
- `docs/02-specification.md` : index de la spec (17 sections dans `docs/spec/`, ne lire que les sections utiles).
- `docs/07-architecture.md` : stack (Svelte + TypeScript + Vite · Supabase · Vercel) et organisation du dépôt.
- `docs/08-methode-de-travail.md` : règles pour travailler à peu de tokens.
- `docs/journal.md` : **lire en début de session**, mettre à jour en fin de session.
- `docs/04-mes-projets.md` : projets par défaut. `docs/05`, `docs/06` : décisions et risques.
- `design/maquettes-v2/` : sources des maquettes (une planche par écran, voir spec §12). Référence en lecture seule.
- `prototype/` : maquette jetable de la première heure, ne pas la faire évoluer.

## Règles de travail
1. Une tranche (`docs/03-feuille-de-route.md`) par session ; finir par tests verts, commit, entrée de journal.
2. Chercher avant de lire ; lire la partie utile ; ne pas relire ce qu'on vient d'écrire ; couper les longues sorties.
3. Le noyau de calcul (`supabase/functions/_shared/core/`) est en fonctions pures, de moins de 200 lignes par fichier, testées.
4. Commande de vérification unique : `npm run check` (à créer en T0).
5. Les maquettes s'ouvrent par planche, jamais en bloc.
