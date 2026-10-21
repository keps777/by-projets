# apps/web — application web installable (PWA React + Vite), tous les rôles et la salle de contrôle (/controle)

Coquille de l'application (ticket AM-009) : React 19 + TypeScript + Vite, React Router, i18next, TanStack Query, PWA Workbox. Une seule
application pour tous les espaces (voyageur, guichet, quai, bus, contrôleur, superviseur, patron, relais, livreur, vendeur) et la
salle de contrôle `/controle`. Les écrans eux-mêmes viennent des tickets d'écran ; cette coquille leur donne leurs routes, leurs
layouts, la navigation, la langue, l'horloge et le mode hors ligne.

```
pnpm --filter @afrimove/web run dev        # http://localhost:5173 (le banc de fidélité vise ce port)
pnpm --filter @afrimove/web run build      # vite build -> apps/web/dist (+ dist/sw.js)
pnpm --filter @afrimove/web run preview    # sert dist/ (PWA installable, hors ligne)
pnpm --filter @afrimove/web run test       # Vitest + Testing Library
pnpm --filter @afrimove/web run typecheck  # tsc (application + service worker)
pnpm --filter @afrimove/web run lint       # prettier --check
```

## Où mettre quoi (règles pour les tickets d'écran)

Un ticket d'écran ne touche que **son fichier de route** et **son dossier** `src/ecrans/<Planche>/` ; jamais un `layout.tsx`, jamais
`app.tsx`, jamais `coquille/`.

| Dossier / fichier                               | Rôle                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/routes/<route>.tsx`                        | un fichier par route de la table « planche -> route » de `docs/tickets.md` (section 5), export par défaut = la page  |
| `src/routes/(espace)/layout.tsx`                | layout, garde de rôle et barre d'onglets de l'espace (AM-009 seulement)                                              |
| `src/ecrans/<Planche>/`                         | composants, hooks et textes de l'écran (`i18n.fr.json`, `i18n.en.json`, `i18n.pcm.json`, espace de noms `<Planche>`) |
| `src/coquille/`                                 | la coquille : roles, garde, cadre, onglets, modules, horloge, paramètres de démo, PWA                                |
| `src/i18n/`                                     | i18next et `fr.json` / `en.json` / `pcm.json` (clés communes)                                                        |
| `src/app.tsx`, `src/main.tsx`, `src/sw.ts`      | application, point d'entrée, service worker                                                                          |
| `public/manifest.webmanifest`, `public/icones/` | manifeste PWA et icônes (192, 512, maskable, apple-touch)                                                            |

Chaque route est un fichier : ajouter `src/routes/(patron)/xyz.tsx` suffit à créer la route `/xyz`, sans toucher à `app.tsx`
(`import.meta.glob`). Au départ chacune contient un **écran vide titré** :

```tsx
import { EcranVide } from "@/coquille/ecran-vide";

export default function Page() {
  return <EcranVide planche="Main" />;
}
```

Le ticket d'écran remplace ce contenu. La page rend **ses éléments** (`Entete`, `EcranCorps`, `EcranPied` du kit `@afrimove/ui`)
et non un `<Ecran>` : le layout de l'espace pose déjà `<Ecran>` (390 px, fond Nuit), puis la page, puis la barre d'onglets pour les
écrans qui en ont une dans les maquettes. Pour aller vers une autre planche, utiliser `urlPlanche("Caisse")` ou
`urlPlanche("SiegePay", { departId })` (`@/coquille/planches`) : on ne recopie pas d'URL à la main. Les liens `<a href="/...">` du kit sont
interceptés par le cadre : navigation sans rechargement, donc le flag conception, l'horloge et le scénario passés dans l'URL
au démarrage ne se perdent pas.

### Routes et URL

`/(voyageur)/depart/[departId]` désigne le fichier `src/routes/(voyageur)/depart/[departId].tsx` : le groupe `(voyageur)` est un
dossier (espace) absent de l'URL, `[departId]` un segment dynamique (`/depart/:departId`). Le layout appliqué à une page est le **plus
proche** : `routes/(espace)/layout.tsx`, ou `routes/<segment>/layout.tsx` pour `routes/<segment>.tsx` (cas de `/controle`), ou
`routes/layout.tsx` (routes publiques `/bienvenue`, `/connexion`, `/tutoriel`).

Écart avec la notation de `docs/tickets.md` : quatre espaces gardent leur nom en préfixe, parce que sinon deux URL se confondraient
(`/accueil` pour guichet, relais, livreur et vendeur ; `/colis` pour le voyageur et le guichet) : `/guichet/accueil`, `/guichet/colis`,
`/relais/accueil`, `/livreur/accueil`, `/vendeur/accueil`. Toutes les autres URL sont celles de la table sans le groupe
(`/voyager`, `/aujourdhui`, `/gare`, `/embarquement`, `/chauffeur`, `/inopine`...). La table est dans `coquille/planches.ts` ; un test
vérifie qu'il y a un fichier par planche, des URL uniques et que `tools/fidelite/ecrans.json` est à jour.

## Rôles, garde et mode démo

- `coquille/roles.ts` : les 10 espaces (= rôles), l'accueil de chacun, les espaces qu'un rôle peut ouvrir.
- **Garde de rôle** : un compte agent ne voit que son espace. Sans session, un espace d'agent renvoie vers `/connexion` ; l'espace
  voyageur est ouvert à tous ; avec une session, sortir de son espace renvoie à son accueil. Exceptions voulues par les onglets des
  maquettes : le guichet ouvre aussi le quai, le superviseur ouvre aussi la caisse, le quai et l'accueil du patron.
- La session est un **mock** (`coquille/session.tsx`, `localStorage["afrimove.session"]`) en attendant AM-021 (connexion) et AM-017.
- **Mode démo** : actif en développement et quand `VITE_APP_ENV` n'est pas `production` (défaut `dev`) ; `VITE_MODE_DEMO=1|0` force.
  Il ouvre la garde, affiche le sélecteur de rôle (en haut à droite sur ordinateur, `/dev/roles` sur téléphone), les pages `/dev/kit`
  (`DemoKit` du kit UI) et `/dev/roles`, et honore les paramètres d'URL ci-dessous. En production tout cela est coupé.
- **`/controle`** : salle de contrôle fluide (1280 px au plus, couleurs et polices v3), hors du cadre de 390 px. Hors démo, la page de
  connexion du patron (mock : un bouton ouvre une session patron) précède la salle.

## Paramètres de démonstration

Lus une fois au démarrage (`coquille/parametres.tsx`) ; ce sont ceux que pose le banc de fidélité (`tools/fidelite`).

| Paramètre                            | Effet                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `?conception=1` (ou `0`)             | affiche le badge « TOUCHE n » du kit (`ConceptionProvider`) ; mémorisé dans `localStorage["afrimove.conception"]` |
| `?horloge=2027-01-05T07:38:00+01:00` | fige l'**horloge injectable** à cet instant                                                                       |
| `?scenario=Main`                     | scénario de démonstration demandé (`useScenario()`, consommé par AM-011)                                          |
| `?modules-masques=covoit,ussd`       | masque ces modules (mock avant AM-126)                                                                            |

**Horloge** : aucun écran n'appelle `new Date()` ; ils lisent `useHorloge().maintenant()` ou `useMaintenant()` (`coquille/horloge.tsx`).
`<App horloge={...} />` injecte une horloge (tests) et prend le pas sur `?horloge=`.

## Modules

`coquille/modules.tsx` liste les 12 modules de la planche Modules et le module de chaque route. Un module masqué **retire ses routes**
(l'adresse tombe sur « introuvable ») **et ses onglets** au prochain chargement ; « Guichet et caisse » ne peut pas être masqué.
Mock aujourd'hui (`?modules-masques=`) ; AM-126 fournira la vraie liste, avec le même hook `useModule(id)`.

## Navigation : les quatre barres

`coquille/onglets.tsx` reprend les barres des maquettes (libellés, ordre, icônes, onglet courant) : voyageur Voyager · Colis · Covoit ·
Moi ; guichet Guichet · Vendre · Colis · Quai · Caisse ; superviseur Gare · Caisses · Quais · Patron ; patron Aujourd'hui · Analyses ·
Gares · Réglages. Comme dans les maquettes, la barre n'apparaît que sur les écrans qui en ont une (liste `ecrans` de chaque barre).
Un test relit les `<nav>` de `docs/maquettes-v3` et compare libellés, ordre, onglet courant et dessin des icônes.

## Langues

`src/i18n` : français (rempli), anglais et pidgin (mêmes clés, valeurs vides qui se replient sur le français). `useTranslation()` de
`react-i18next` ; `changerLangue()` mémorise le choix. Les textes d'un écran vont dans `src/ecrans/<Planche>/i18n.{fr,en,pcm}.json`
(chargés automatiquement dans l'espace de noms `<Planche>` : `useTranslation("<Planche>")`) pour que les tickets d'écran ne se
marchent pas dessus. Un test vérifie que `fr.json`, `en.json` et `pcm.json` ont exactement les mêmes clés.

## PWA

- `public/manifest.webmanifest` (nom, standalone, couleurs Nuit, icônes 192 / 512 / maskable) et `index.html` (thème, icône Apple).
- `src/sw.ts`, construit par `vite-plugin-pwa` (stratégie `injectManifest`) : précache de la coquille (HTML, JS, CSS, polices
  woff2, icônes), navigation hors ligne vers `index.html`, cache d'abord pour polices et images hors liste. `dist/sw.js` n'est
  enregistré qu'en production (`coquille/pwa.ts`).
- Une nouvelle version attend (`registerType: "prompt"`) : le bandeau « Nouvelle version prête » (`coquille/bandeau-mise-a-jour.tsx`)
  propose « Mettre à jour », qui active le service worker en attente et recharge.
- Vérification hors ligne : `pnpm --filter @afrimove/web run build && ... run preview`, ouvrir `/voyager`, attendre l'installation du
  service worker, couper le réseau et recharger (Lighthouse : installable ; la coquille s'ouvre sans réseau).

## Emballage Capacitor (Play Store, App Store) — AM-184

La **même** application, dans une coquille native : `capacitor.config.ts` (appId `com.afrimove.app`, `webDir: "dist"`), projets `android/` et `ios/`
(générés par Capacitor 8, personnalisés : thème Nuit, marges des barres système, liens, signature), images sources dans `resources/`. Procédure complète
de publication (comptes, signature, politique de confidentialité, fiche de boutique) : **`docs/publication-boutiques.md`**.

```
pnpm --filter web run cap:sync            # vite build + cap sync (copie dist/ dans android/ et ios/)
pnpm --filter web run cap:android         # AAB signé (variables ANDROID_KEYSTORE_PATH / _PASSWORD, ANDROID_KEY_ALIAS / _PASSWORD)
pnpm --filter web run cap:android:debug   # APK de débogage, sans signature
pnpm --filter web run cap:ios             # macOS + Xcode : archive App Store (signature à configurer)
pnpm --filter web run cap:open:android    # ou cap:open:ios : ouvre Android Studio / Xcode
pnpm --filter web run cap:assets          # icônes et écrans de lancement depuis resources/
```

- **Un seul build web** : aucune branche de code propre aux boutiques. `src/natif/` ne fait quelque chose que si `window.Capacitor.isNativePlatform()` est vrai
  (il n'embarque donc rien de natif dans le navigateur) : écran de lancement masqué dès le premier rendu, **liens entrants** (`https://<hôte>/…` et
  `com.afrimove.app://…` ouvrent la page correspondante, sans redirection ouverte), **bouton retour d'Android** (quitte sur l'accueil d'un espace, recule ailleurs).
  Le service worker n'est pas enregistré dans l'application (le build y est déjà). Hôtes des liens : `VITE_LIENS_HOTES=hote1,hote2` au build.
- **Greffons natifs** : `@capacitor/app` (liens, retour), `@capacitor/splash-screen`, `@capacitor/push-notifications` (embarqué, **aucun code ne l'appelle encore**).
  Pas d'imprimante Bluetooth native : voir §9 du document de publication, c'est le point bloquant avant mise en boutique.
- **API** : l'application emballée a pour origine `https://localhost` (Android) et `capacitor://localhost` (iOS) ; les ajouter à `CORS_ORIGINS` de l'API.
- **Tests** : `src/natif/*.test.*` (liens, retour, pont natif, et `emballage.test.ts` qui relit `android/` et `ios/` : identifiants, icônes, signature sans secret,
  greffons synchronisés). Le projet Android se compile sans Android Studio avec JDK 21 + SDK 36 (`./gradlew assembleDebug`) ; iOS exige un Mac.
- **CI** : `.github/workflows/boutiques.yml` (build web embarqué identique à `dist/` + fidélité Main, AAB signé, compilation iOS à la demande).

## Banc de fidélité

`tools/fidelite/ecrans.json` déclare les 75 planches qui ont une route (Parcours et Systeme n'en ont pas). Pour les routes à segment
dynamique, la valeur est un exemple de remplissage (`EXEMPLES_PARAMS` dans `coquille/planches.ts`) à remplacer par un identifiant des
données de démonstration quand AM-011 existera. Tant que les écrans ne sont pas faits, `pnpm fidelite <Planche>` mesure l'écran vide
(il échoue : c'est attendu) ; `pnpm fidelite --all` sans l'app lancée liste les planches comme absentes et sort en 0.
