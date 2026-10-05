# Journal de reprise

> Lire ce fichier en début de session (après `CLAUDE.md`). Ajouter une entrée en fin de session.

## 5 oct. 2026 — fin de la phase de spécification

**Fait**
- Vision, spécification v2 (17 sections dans `docs/spec/`), architecture (`07`), méthode (`08`).
- 54 planches de maquettes (nuit, jour, version 1 archivée) copiées dans `design/`.
- Décisions : Supabase + Vercel ; notifications push uniquement ; aucun e-mail ; un seul utilisateur ; connexion e-mail et mot de passe ; PDF au format type adaptatif ; pas de calendrier externe.

**Prochaine étape : T0** (voir `docs/03-feuille-de-route.md`)
1. L'utilisateur crée le projet Supabase (développement) et connecte le dépôt à Vercel ; il donne l'adresse Supabase et la clé publique (jamais la clé secrète).
2. Créer `app/` (Vite + Svelte + TypeScript + PWA), `supabase/` (migrations, règles d'accès), l'intégration continue.
3. Essai de notification push sur l'iPhone de l'utilisateur.
4. Rédiger `docs/spec/` → rien à changer sauf si l'essai révèle un écart.

**Pièges connus**
- iPhone : pas de boutons d'action sur les notifications d'app web ; la notification ouvre l'écran Action rapide.
- Les notifications exigent l'app ouverte depuis l'icône de l'écran d'accueil (iOS 16.4 ou plus).
