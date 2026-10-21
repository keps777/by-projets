# tools/fidelite — banc de fidélité maquette ↔ app (AM-004)

Prouve que l'interface ressemble à la maquette : pour une planche `docs/maquettes-v3/<X>.dc.html`, le banc
capture la planche et l'écran correspondant de `apps/web` (Playwright, Chromium), calcule la différence pixel
(pixelmatch) et écrit un rapport HTML côte à côte.

```
pnpm fidelite Main        # une planche
pnpm fidelite --all       # toutes les planches (77)
```

Sortie dans `tools/fidelite/sortie/` (ignoré par git) :

- `<Planche>/maquette.png`, `app.png`, `diff.png` (rose = pixel différent) ;
- `rapport.html` : tableau récapitulatif puis, par planche, maquette / app / diff côte à côte, pourcentage, seuil ;
- `resultats.json` : mêmes résultats en JSON (pour la CI).

Code de sortie : `0` tout est conforme (les écrans absents ne comptent pas), `1` une planche dépasse son seuil ou le
banc a échoué, `2` mauvais usage. `--strict` fait aussi échouer un écran absent.

## Prérequis

1. `pnpm install` à la racine. Playwright ne télécharge pas de navigateur : le banc utilise le Chromium indiqué par
   `FIDELITE_CHROMIUM` (ou `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`), sinon `/opt/pw-browsers/chromium` s'il existe,
   sinon le Chromium de Playwright (`pnpm exec playwright install chromium` en local).
2. `apps/web` qui tourne en mode démo (`--app-url`, ou `FIDELITE_APP_URL`, défaut `http://localhost:5173`).

## Ce que le banc impose à l'app

L'écran est ouvert à `<appUrl><route>?scenario=<Planche>&conception=1&horloge=2027-01-05T07:38:00%2B01:00`
(noms des paramètres : `config.json` → `params`).

- **Scénario de démonstration** : `scenario=<Planche>` = le scénario `fixtures/ecrans/<Planche>.ts` (AM-011) ; changeable par
  écran dans `ecrans.json` (`scenario`) ou ponctuellement avec `--scenario`.
- **Flag conception actif** : paramètre `conception=1` **et** `localStorage["afrimove.conception"] = "1"` posés avant le
  chargement. Le badge « TOUCHE n » doit donc apparaître comme sur la maquette. Si la maquette en montre un et pas
  l'app, le banc l'écrit dans le rapport (avertissement) et dans la console.
- **Horloge figée** au 05/01/2027 07:38, fuseau Africa/Douala, locale fr-FR : `Date.now()` et `new Date()` sont fixés par
  Playwright (les minuteries continuent de tourner) ; le paramètre `horloge` est transmis en plus à l'« horloge
  injectable » de l'app (AM-009).
- Animations coupées (`prefers-reduced-motion`, captures en `animations: "disabled"`), service workers bloqués, échelle 1,
  rendu du texte sans hinting ni LCD. Même viewport pour les deux côtés, donc deux images de même taille.

Taille de capture : celle du canevas (`canvas.json`, `boards[X].w/h` : 390×844 en général, `Controle` 1280×900,
`Parcours` 1760×1500, `Systeme` 1600×1500), sinon le `$preview` de la planche.

## Déclarer un écran : `ecrans.json`

Un ticket d'écran ajoute une ligne quand sa route existe :

```json
{
  "ecrans": {
    "Main": { "route": "/voyager" },
    "Controle": { "route": "/controle", "attente": "[data-pret]" }
  }
}
```

`scenario` (défaut : nom de la planche) et `attente` (sélecteur CSS à attendre avant la capture) sont facultatifs.

### Écran absent

Une planche est « écran absent » (information, pas un échec) quand elle n'est pas déclarée dans `ecrans.json`, quand l'app est
injoignable, ou quand la route répond HTTP ≥ 400. Tant qu'`apps/web` n'a pas d'écrans, `pnpm fidelite --all` liste les 77
planches comme absentes et sort avec le code 0, sans lancer de navigateur. Une SPA qui renvoie `index.html` en 200 sur
toute route inconnue ne peut pas être détectée comme absente : déclarez l'écran seulement quand il existe.

## Seuils : `seuils.json`

Différence maximale : **3 % des pixels** (`pixelmatch`, tolérance de couleur 0,1, anticrénelage ignoré). Un seuil propre à une
planche est possible, avec une justification écrite obligatoire — sans elle (au moins une phrase), le banc refuse de démarrer :

```json
{
  "defaut": 3,
  "planches": {
    "Reseau": {
      "seuil": 5,
      "justification": "Carte SVG : l'anticrénelage des tracés diffère entre la maquette et le composant React."
    }
  }
}
```

Le seuil et sa justification figurent dans le rapport. Un seuil se justifie par une cause identifiée et acceptée, jamais pour faire
passer le banc.

## Planches hors canevas : `support.js`

Chaque planche charge `<script src="./support.js">`, fichier fourni par le canevas de conception et absent de `docs/maquettes-v3`.
Le banc sert les planches en HTTP local (`src/maquettes.ts`) et répond à `/support.js` avec `support/support.js`, le minimum pour les
afficher seules : `DCLogic` déclaré, `<x-dc>` en bloc, contenu de `<helmet>` (polices, `@keyframes pulse`, reset `body`) remonté dans
`<head>`. Les 77 planches sont statiques (`renderVals() { return {}; }`) donc cela suffit. Si les planches reçoivent un jour de vraie logique,
ce support minimal ne l'exécutera pas : déposer le vrai `support.js` à côté des planches prend alors le dessus.

## Polices

Les planches chargent Bricolage Grotesque, Instrument Sans et Geist Mono depuis Google Fonts : le banc a donc besoin du réseau pour
afficher la maquette fidèlement (un avertissement « police non chargée » est ajouté au rapport sinon, et l'écart sera gonflé). Pour
rendre le banc hors ligne et déterministe, renseigner `config.json` → `polices` avec les woff2 locaux d'AM-003 (chemin donné à titre d'exemple, à adapter) :

```json
"polices": [{ "famille": "Instrument Sans", "poids": 400, "fichier": "../../packages/design/fonts/InstrumentSans-400.woff2" }]
```

Les requêtes Google Fonts de la maquette sont alors servies par ces fichiers.

## Tests

`pnpm --filter @afrimove/fidelite test` : comparaison d'images, validation des seuils, et chaîne complète sur de faux écrans HTML
locaux (`tests/ecran-factice.ts`) : écran identique (0 %), écran différent (échec), seuil justifié, écran absent (404, app éteinte,
`--all`), horloge et badge, planche réelle `Controle` en 1280×900 comparée à sa propre copie.

## Ce qui reste hors de ce package

- La CI (critère « tourne sur chaque PR qui touche apps/web ou packages/ui et attache le rapport ») : workflow `.github/` à écrire
  dans AM-018 ; commande à y lancer : `pnpm fidelite --all --app-url <url de prévisualisation>` puis publier `tools/fidelite/sortie/`.
- Le flag conception et le paramètre `scenario` / `horloge` côté app (AM-005 pour le badge, AM-009 pour l'horloge, AM-011/012 pour les scénarios).
- Les entrées d'`ecrans.json`, une par ticket d'écran.
