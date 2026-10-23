# AssureMe

Toutes les grosses dépenses de la famille (santé, école, loyer, auto, énergie…) en **une seule mensualité** prélevée sur le salaire. PWA mobile d'abord (Svelte 5 + TypeScript + Vite), avec les portails web des partenaires.

> État : application complète construite à partir des 61 maquettes, avec un **backend simulé** (tout vit dans `localStorage`). Le schéma Postgres/Supabase cible est décrit dans `supabase/schema.sql` (non appliqué).

## Démarrer
```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # svelte-check + tests unitaires (commande unique de vérification)
npm run build && npm run preview   # PWA de production, port 4180
npm run e2e          # parcours Playwright (Chromium)
```
Essayer sans créer de compte : sur l'écran d'accueil, **« Essayer avec un compte de démonstration »** (Aïcha Ndiba, code `482916`). Le SMS de vérification de la démo est toujours `123456`.
Rejouer une paie : ajouter `?maintenant=2026-11-28T10:00` à l'URL.

## Ce qu'il y a dedans
| Zone | Écrans |
|---|---|
| Compte | splash, inscription (OTP, identité, Pass, code), connexion, biométrie WebAuthn, appareils, profil |
| Accueil | solde, recharge, historique, notifications, piliers, scan / carte / envoi, paiement de facture, reçu, prélèvement sur salaire |
| Piliers | santé, école, logement (avance de loyer), auto, énergie solaire, coffres, diaspora, commerce, protection famille |
| Confiance | AssureScore 400–900, niveaux START/PLUS/PRO/ELITE, conseils |
| Portails (`/portail/…`) | hôpital, école, concession, entreprise, pilotage |

## Règles métier clés
* **33 %** : la somme de toutes les mensualités de crédit ne dépasse jamais 33 % du salaire net (`src/core/credit.ts`).
* Annuités à 1,5 %/mois (Pass Premium 1,2 %, Essentiel 1,8 %, ELITE −0,1 pt). Tiers payant 80 % / 70 % avec plafonds annuels. Coffres à 3,5 %/an. Euro à 655,957 FCFA.
* Sécurité : code PBKDF2, 3 essais puis 15 min de verrou, session de 5 min, OTP 5 min / 5 essais.

## Organisation
Voir `CONTRIBUER.md` (contrat d'architecture) et `docs/architecture.md`. Les écarts constatés dans les maquettes sont dans `docs/ecarts-maquettes.md`.
