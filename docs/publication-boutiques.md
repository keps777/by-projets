# Publication sur le Play Store et l'App Store (AM-184)

AfriMove est une application web installable (PWA React + Vite). Les boutiques reçoivent **la même application** dans une coquille
native : [Capacitor](https://capacitorjs.com) embarque le dossier `apps/web/dist` (sortie de `vite build`) dans un projet Android
(`apps/web/android/`) et un projet iOS (`apps/web/ios/`). Aucune réécriture, aucun second code : il n'existe qu'un build web, copié dans
les deux coquilles par `cap sync`.

```
apps/web/src ──vite build──▶ apps/web/dist ──cap sync──▶ android/app/src/main/assets/public ──Gradle──▶ AAB (Play Store)
                                                     └─▶ ios/App/App/public                ──Xcode───▶ IPA (App Store)
```

La publication elle-même attend les comptes développeur (tickets administratifs de Luther). Ce document dit **ce qu'il faut avoir**, **quelles
commandes lancer** et **ce que les boutiques exigent** ; il est écrit pour que l'équipe puisse publier le jour où les comptes existent.

## 1. Ce qui est fixé, ce qui reste à décider

| Élément                          | Valeur                                                   | Remarque                                                                                                   |
| -------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Nom affiché                      | `AfriMove`                                               | `capacitor.config.ts`, `strings.xml`, `Info.plist`                                                         |
| Identifiant (`appId`, Bundle ID) | `com.afrimove.app`                                       | **Définitif après la première mise en ligne** (Play et App Store). À confirmer avant d'ouvrir les comptes. |
| Hôte des liens web               | `afrimove.exemple.org` (réserve)                         | Variable `BOUTIQUES_HOTE_LIENS` / `AFRIMOVE_APP_HOST`. À remplacer par le vrai domaine.                    |
| Schéma de lien propre            | `com.afrimove.app://voyager`                             | Identique à l'identifiant ; déjà actif sur Android et iOS.                                                 |
| Icône, écran de lancement        | logo de `apps/web/public/icone.svg`, fond Nuit `#0B1019` | Générés par `pnpm --filter @afrimove/web run cap:assets` (voir §8).                                        |
| Versions minimales               | Android 7.0 (API 24), iOS 15                             | Imposées par Capacitor 8.                                                                                  |
| Orientation                      | portrait                                                 | Comme le manifeste PWA.                                                                                    |

## 2. Prérequis

### Postes de travail

| Pour    | Il faut                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tout    | Node 22, pnpm (voir `packageManager`), `pnpm install` à la racine                                                                            |
| Android | JDK 21, Android SDK (plateforme 36, build-tools 36) : Android Studio les installe ; la CI les a déjà                                         |
| iOS     | **un Mac** avec Xcode 26 ou plus (Capacitor 8 s'appuie sur le SDK iOS 26) ; pas de CocoaPods, les greffons passent par Swift Package Manager |

### Comptes à ouvrir (hors dépôt)

| Compte                                                | Pour quoi                                      | À savoir                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Google Play Console** (frais d'inscription uniques) | publier l'AAB                                  | Un compte _organisation_ demande des justificatifs de l'entreprise et un numéro D-U-N-S. Les règles de test imposées aux comptes personnels récents (testeurs sur une période) sont à vérifier dans la console au moment de l'inscription. |
| **Apple Developer Program** (abonnement annuel)       | signer l'application, TestFlight, App Store    | Compte _organisation_ : numéro D-U-N-S et vérification par Apple, qui prend des jours. Donne accès à App Store Connect.                                                                                                                    |
| **Firebase** (projet gratuit)                         | acheminer les notifications push Android (FCM) | Fournit `google-services.json`. Sans lui l'application se compile et tourne, seule l'inscription aux notifications échoue.                                                                                                                 |
| Clé APNs (portail Apple Developer)                    | notifications push iOS                         | À téléverser chez le fournisseur de notifications (Firebase ou autre) une fois choisi.                                                                                                                                                     |

Tarifs et règles évoluent : les relire sur les pages officielles des deux boutiques avant de budgéter.

## 3. Commandes

Toutes depuis la racine du dépôt (`--filter web` suffit, c'est `@afrimove/web`).

| Commande                                                  | Effet                                                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter web run cap:sync`                          | `vite build` puis `cap sync` : copie `dist/` dans `android/` et `ios/` et met à jour les greffons                                      |
| `pnpm --filter web run cap:android`                       | build web **de production** + **AAB signé** dans `apps/web/android/app/build/outputs/bundle/release/app-release.aab` (variables du §4) |
| `pnpm --filter web run cap:android:debug`                 | APK de débogage (`app/build/outputs/apk/debug/`), sans signature                                                                       |
| `pnpm --filter web run cap:ios`                           | build web de production, `cap sync ios`, puis `cap build ios` (archive + export ; **macOS** et signature configurée, §5)               |
| `pnpm --filter web run cap:open:android` / `cap:open:ios` | ouvre Android Studio / Xcode sur le projet                                                                                             |
| `pnpm --filter web run cap:assets`                        | régénère icônes et écrans de lancement depuis `apps/web/resources/` (§8)                                                               |

Les builds de boutique sont en production (`VITE_APP_ENV=production` : mode démo coupé). Autres variables lues au build :
`VITE_API_URL` (API appelée), `VITE_LIENS_HOTES` (hôtes des liens web, séparés par des virgules), `AFRIMOVE_APP_HOST` (même hôte, côté Android).

**Après toute mise à jour d'un greffon `@capacitor/*`**, relancer `cap:sync` et valider les changements d'`android/` et `ios/` (un test
Vitest, `src/natif/emballage.test.ts`, échoue si `package.json`, `capacitor.build.gradle` et `Package.swift` ne sont plus alignés).

### API et CORS

Dans l'application emballée, la page vient de `https://localhost` (Android) et `capacitor://localhost` (iOS). L'API NestJS refuse les origines
inconnues : ajouter ces deux valeurs à `CORS_ORIGINS` (variable d'environnement de l'API, voir `apps/api/src/socle/config/config.ts`) dans
chaque environnement visé par les boutiques.

### Mises à jour

Le web est **dans** l'application : un correctif de l'interface atteint les utilisateurs des boutiques par une nouvelle version publiée
(revue Apple d'un à deux jours, revue Google variable), alors que la version navigateur se met à jour au déploiement. Les deux versions
cohabitent ; l'API doit rester compatible avec les anciennes versions installées (versionner les contrats, `packages/contrats`).

## 4. Android (Play Store)

### 4.1 Clé d'envoi

Créer **une seule fois** la clé d'envoi, hors du dépôt, et la sauvegarder à deux endroits (gestionnaire de mots de passe de l'entreprise et coffre) :

```
keytool -genkeypair -v -keystore afrimove-envoi.jks -alias afrimove-envoi \
  -keyalg RSA -keysize 2048 -validity 10000
```

Activer **Play App Signing** à la création de l'application dans la Play Console : Google garde la clé de signature définitive, notre clé n'est
que la clé _d'envoi_ (révocable en cas de perte, ce qui n'est pas le cas d'une clé de signature classique).

### 4.2 Variables de signature

`android/app/build.gradle` lit quatre variables d'environnement ; rien n'est écrit dans le dépôt (`*.jks` et `*.keystore` sont ignorés) :

| Variable                    | Contenu                            |
| --------------------------- | ---------------------------------- |
| `ANDROID_KEYSTORE_PATH`     | chemin du fichier `.jks`           |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du magasin            |
| `ANDROID_KEY_ALIAS`         | alias de la clé (`afrimove-envoi`) |
| `ANDROID_KEY_PASSWORD`      | mot de passe de la clé             |

Optionnelles : `ANDROID_VERSION_CODE` (entier **strictement croissant** à chaque envoi ; la CI prend le numéro d'exécution), `ANDROID_VERSION_NAME`
(ex. `1.0.0`). Sans clé, `cap:android` refuse de fabriquer l'AAB (message explicite) ; `-Pafrimove.sansSignature=true` autorise un AAB non signé,
utile seulement pour vérifier que ça compile.

### 4.3 Dans GitHub

Workflow `.github/workflows/boutiques.yml`, job « Android (AAB) ». Secrets du dépôt :

| Secret                                                                   | Contenu                         |
| ------------------------------------------------------------------------ | ------------------------------- |
| `ANDROID_KEYSTORE_BASE64`                                                | `base64 -w0 afrimove-envoi.jks` |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | voir §4.2                       |

Variables du dépôt (pas des secrets) : `BOUTIQUES_API_URL` (API de production) et `BOUTIQUES_HOTE_LIENS` (hôte des liens web).
Lancement : onglet _Actions → Boutiques → Run workflow_, ou étiquette `boutiques-vX.Y.Z`. L'AAB signé est joint à l'exécution (30 jours). Sur une PR
ou sans secret, le job ne fait que vérifier la compilation.

### 4.4 Premier envoi

1. Play Console → _Créer une application_ (nom, langue par défaut français, « application », gratuite).
2. Renseigner le contenu de l'application (§7) : politique de confidentialité, sécurité des données, classification, public cible, annonces.
3. _Tests internes_ → téléverser l'AAB → ajouter les testeurs. Valider sur de vrais téléphones d'entrée de gamme (§9).
4. _Production_ → fiche (§6) → envoi en examen.

### 4.5 Liens web qui ouvrent l'application (App Links)

`AndroidManifest.xml` déclare `https://<hôte>/…` avec `autoVerify`. Pour que la vérification réussisse, publier
`https://<hôte>/.well-known/assetlinks.json` (sans redirection, `Content-Type: application/json`) :

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.afrimove.app",
      "sha256_cert_fingerprints": [
        "<empreinte SHA-256 de la clé de SIGNATURE, Play Console → Intégrité de l'application>"
      ]
    }
  }
]
```

C'est l'empreinte de la clé de signature gérée par Google (Play App Signing), pas celle de la clé d'envoi. Le fichier se sert depuis le
déploiement web (`apps/web/public/.well-known/` ou la configuration du CDN, voir `infra/`).

## 5. iOS (App Store)

### 5.1 Une fois, sur un Mac

1. `pnpm install`, puis `pnpm --filter web run cap:sync` (écrit `ios/App/CapApp-SPM/Package.swift` avec les chemins des greffons).
2. `pnpm --filter web run cap:open:ios` : Xcode s'ouvre sur `ios/App/App.xcodeproj`, résout les paquets Swift (accès à GitHub nécessaire).
3. Cible **App** → _Signing & Capabilities_ : choisir l'équipe Apple Developer (signature automatique).
4. Ajouter les capacités **Push Notifications** et **Associated Domains** (`applinks:<hôte>`). Elles créent `App.entitlements` ; les ajouter
   demande le compte payant, c'est pourquoi le dépôt ne les contient pas encore.
5. _Product → Build_ sur un simulateur : **c'est la compilation de contrôle du critère « le projet iOS se compile »**. La CI la fait aussi
   (`boutiques.yml`, job iOS, déclenché à la main avec `ios: true` ou par étiquette), sans signature.

### 5.2 Envoyer une version

- Numéro de version : _General → Version_ (`MARKETING_VERSION`), numéro de build **strictement croissant** (`CURRENT_PROJECT_VERSION`).
- _Product → Archive_ → _Distribute App_ → _App Store Connect_. Ou, en ligne de commande sur le Mac : `pnpm --filter web run cap:ios` (archive + export ;
  options de signature : `cap build ios --help`).
- App Store Connect → _TestFlight_ pour les testeurs, puis _App Store_ → fiche (§6) → soumettre à la revue.

`Info.plist` déclare déjà : application sombre, portrait, `ITSAppUsesNonExemptEncryption = false` (seul le HTTPS du système est utilisé, ce
qui évite la question de conformité à l'exportation à chaque envoi) et le schéma de lien `com.afrimove.app`.

### 5.3 Liens web (Universal Links)

Après avoir ajouté `applinks:<hôte>` (5.1), publier `https://<hôte>/.well-known/apple-app-site-association` (JSON, sans extension, sans redirection) :

```json
{
  "applinks": {
    "details": [{ "appIDs": ["<ID ÉQUIPE>.com.afrimove.app"], "components": [{ "/": "/*" }] }]
  }
}
```

### 5.4 Notifications push

Le greffon `@capacitor/push-notifications` est embarqué mais **aucun code ne l'appelle encore** : le choix du fournisseur (FCM direct, ou
passerelle WhatsApp/SMS déjà prévue ailleurs) et le stockage des jetons côté API relèvent d'un ticket à ouvrir. Quand il existera : clé APNs
côté Apple, `google-services.json` dans `apps/web/android/app/` (le build Gradle l'active tout seul), puis les capacités du §5.1.

## 6. Fiche de boutique

Éléments à préparer (la fiche est saisie dans les consoles, elle n'est pas dans le dépôt). **Seuls deux textes existent aujourd'hui dans le projet** et
peuvent servir de base : « Le bus, le colis et la caisse, en 3 touches. » (`manifest.webmanifest`) et « Où que tu sois, on te trouve. » (planche Splash).
Tout le reste est à rédiger et à faire valider.

| Élément                      | Play Store                                                          | App Store                                                                                  |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Nom                          | 30 caractères max.                                                  | 30 caractères max.                                                                         |
| Accroche                     | description courte, 80 caractères max.                              | sous-titre, 30 caractères max.                                                             |
| Description                  | 4 000 caractères max.                                               | 4 000 caractères max. ; texte promotionnel 170                                             |
| Mots-clés                    | (dans la description)                                               | 100 caractères max.                                                                        |
| Icône                        | 512 × 512 px PNG : partir de `apps/web/public/icones/icone-512.png` | 1024 × 1024 sans transparence (déjà dans le projet)                                        |
| Image de présentation        | 1 024 × 500 px (obligatoire)                                        | —                                                                                          |
| Captures téléphone           | 2 à 8, mêmes proportions que l'écran                                | grand iPhone obligatoire (6,9 pouces : 1 320 × 2 868 px, ou 6,5 pouces : 1 284 × 2 778 px) |
| Catégorie                    | Voyages et infos locales (à confirmer)                              | Voyages (à confirmer)                                                                      |
| Coordonnées                  | e-mail public, site, téléphone facultatif                           | URL d'assistance, e-mail                                                                   |
| Politique de confidentialité | URL publique (obligatoire)                                          | URL publique (obligatoire)                                                                 |
| Classification               | questionnaire IARC dans la console                                  | questionnaire de classification d'âge                                                      |

**Captures** : produire les écrans de la maquette V3 les plus parlants (Main, Guichet, Quai, Caisse…) depuis l'application en mode démo, par exemple
avec Playwright (déjà installé pour le banc de fidélité) en 390 × 844 à l'échelle 3 (1 170 × 2 532 px), puis les recadrer aux gabarits ci-dessus. Ne pas
y montrer le badge « TOUCHE » (flag conception) ni de vraies données de personnes.

## 7. Conformité à fournir

### Politique de confidentialité (URL publique, en français, avant toute soumission)

À faire rédiger/valider par la personne responsable des données chez AfriMove. Elle doit au minimum couvrir ce que l'application manipule réellement :
numéro de téléphone et identité des voyageurs et des agents, billets et colis, paiements (Mobile Money : ce que l'application garde et ce qui reste chez
l'opérateur), jetons de notification, journaux techniques ; la finalité, les destinataires (compagnies partenaires, opérateurs de paiement), la durée de
conservation, les droits d'accès/suppression et un contact. Elle doit être **la même** dans les deux boutiques et accessible depuis l'application.

### Autres exigences communes

- **Suppression de compte** : les deux boutiques exigent, pour toute application qui crée des comptes, un moyen de demander la suppression depuis
  l'application, et la Play Console demande en plus une adresse web de suppression. Aucun écran ne le prévoit aujourd'hui : ticket à ouvrir avant la soumission.
- **Play Console → Sécurité des données** et **App Store Connect → Confidentialité de l'app** : déclaration des données collectées, à faire
  cohérente avec la politique ci-dessus.
- **Compte de démonstration** : si la connexion est obligatoire, fournir aux relecteurs un compte de test (les deux revues le demandent) ; le mode démo
  est coupé en production (`VITE_APP_ENV=production`).
- **Publicité / achats intégrés** : à déclarer. Les billets et colis sont des services physiques payés hors des achats intégrés des boutiques ; à
  confirmer avec le juridique (règles de paiement des deux boutiques).

## 8. Icônes et écran de lancement

Sources dans `apps/web/resources/` : `icon-only.png` (carré plein, sans transparence), `icon-foreground.png` + `icon-background.png` (icône adaptative
Android), `splash.png` (fond Nuit et logo de la planche Splash). Elles viennent de `apps/web/public/icone.svg` : `resources/generer-sources.py` redessine le
logo à l'identique (Pillow ne lit pas le SVG) ; aucune marque n'est inventée.

`pnpm --filter web run cap:assets` (outil `@capacitor/assets`, lancé à la demande par `pnpm dlx`, non ajouté aux dépendances) écrit les `mipmap-*` et `drawable-*`
d'Android et les `Assets.xcassets` d'iOS. Si le logo change : mettre à jour le script Python, le relancer, puis `cap:assets`.

Le jour où la planche Splash du design évolue, l'écran de lancement natif (statique, sans l'animation du volet ni le texte) doit être revu : il se limite volontairement au
logo, pour qu'aucun texte ne soit figé dans une image.

## 9. Impression Bluetooth : à faire avant de publier

**Critère 4 du ticket non atteint dans ce lot.** Web Bluetooth (`navigator.bluetooth`) n'existe pas dans le WebView des applications Capacitor : l'impression
des billets et étiquettes (AM-075) y affichera « imprimante indisponible » tant qu'un transport natif n'existe pas. L'interface est prête
(`Transport` dans `packages/impression/src/transport/transport.ts` : « un greffon natif plus tard (AM-184), avec le même gabarit »), il manque :

1. Le greffon Bluetooth Low Energy natif. Candidat : `@capacitor-community/bluetooth-le` (communauté Capacitor, hors du périmètre `@capacitor/*` autorisé pour ce lot : dépendance à valider).
2. `TransportCapacitorBle implements Transport` dans `packages/impression` (mêmes états, mêmes erreurs, découpage en paquets), choisi à l'exécution quand `estNatif()` (`apps/web/src/natif`)
   est vrai, dans `apps/web/src/impression/service.ts`. Les gabarits ESC/POS ne changent pas : seuls les octets passent par un autre canal.
3. Permissions Android : `BLUETOOTH_SCAN` (avec `neverForLocation`), `BLUETOOTH_CONNECT`, et pour Android 11 et moins `BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION` (`maxSdkVersion="30"`).
   Elles ne sont **pas** déclarées aujourd'hui (le test `emballage.test.ts` l'impose) pour ne pas faire demander à Google une justification pour une fonction absente.
4. iOS : clé `NSBluetoothAlwaysUsageDescription` dans `Info.plist` avec un texte français expliquant l'usage (impression de billets), à faire valider.
5. Essai sur une vraie imprimante 58 mm, le seul moyen de valider appairage, reconnexion et débit.

Ticket à ouvrir (suite d'AM-075 et AM-184).

## 10. Ce qui est vérifié, ce qui ne l'est pas

| Vérifié dans ce lot                                                                                                                                       | Comment                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Le web embarqué est identique à `dist/` ; il passe le banc de fidélité sur Main (0,73 %, seuil 3 %)                                                       | `diff -r` et `pnpm fidelite Main` servi depuis `android/app/src/main/assets/public` (le workflow le rejoue) |
| Le projet Android se compile ; un AAB est produit et signé (SHA-256) avec code et nom de version injectés                                                 | Gradle 8.14, SDK 36, JDK 21, clé d'essai jetable : `jarsigner -verify` répond « jar verified »              |
| Sans clé, `cap:android` refuse de produire un AAB                                                                                                         | exécution réelle                                                                                            |
| `cap sync` pour Android et iOS, sans SDK                                                                                                                  | exécuté ; état relu par `emballage.test.ts`                                                                 |
| Icône iOS sans transparence, 1024 px ; icônes Android à la bonne taille ; identifiants identiques partout ; aucun secret dans le dépôt ; greffons alignés | `emballage.test.ts`                                                                                         |
| Liens entrants et bouton retour                                                                                                                           | `liens.test.tsx` (avec un vrai React Router), `retour.test.ts`, `natif.test.ts`                             |

| **Non vérifié** (nécessite un appareil, Android Studio ou Xcode)                                                                                        | À faire                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Que l'application **se lance** et affiche l'écran Main sur un téléphone ou un émulateur Android                                                         | installer l'APK de débogage, ouvrir `/voyager`                                       |
| Marges des barres système (Android 15+, encoche), clavier à l'écran, écran de lancement (Android 12+ et avant), icône adaptative sur plusieurs lanceurs | téléphones physiques                                                                 |
| Bouton retour matériel, ouverture par lien `https` (après `assetlinks.json`) et par `com.afrimove.app://`                                               | `adb shell am start -a android.intent.action.VIEW -d "com.afrimove.app://depart/12"` |
| Compilation du projet iOS, marges (`contentInset: always`), écran de lancement, schéma de lien                                                          | Mac avec Xcode 26 ; la CI macOS le fait à la demande                                 |
| Notifications push (aucun code, ni Firebase, ni clé APNs)                                                                                               | ticket dédié                                                                         |
| Impression Bluetooth native                                                                                                                             | §9                                                                                   |
| Envoi réel sur les consoles                                                                                                                             | comptes développeur                                                                  |
