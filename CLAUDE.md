# CLAUDE.md

Projet **By Projets** : PWA personnelle de pilotage de vie par projets (Thème → Projet → Sous-projet → Suivi → Document).

- Langue du projet : **français** (UI, docs, messages de commit en français).
- Approche **spec-driven** : `docs/01-vision.md` (pourquoi), `docs/02-specification.md` (quoi), `docs/03-feuille-de-route.md` (étapes et décisions). Toute fonctionnalité doit d'abord exister dans la spec ; mettre la spec à jour avant ou avec le code.
- Principes : mobile d'abord, données sur Supabase (source de vérité) avec cache hors ligne, « discipline avec grâce ». Ne jamais committer de clé secrète ni l'adresse e-mail de l'utilisateur.
- `prototype/` est une maquette jetable : ne pas la faire évoluer en application réelle.
