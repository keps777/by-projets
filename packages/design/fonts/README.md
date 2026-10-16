# Polices locales

Six fichiers woff2, tous sous licence SIL Open Font License 1.1 (redistribution et embarquement autorisés) :

| Fichier                               | Famille             | Graisses  | Sous-ensemble |
| ------------------------------------- | ------------------- | --------- | ------------- |
| `bricolage-grotesque-latin.woff2`     | Bricolage Grotesque | 500 à 800 | latin         |
| `bricolage-grotesque-latin-ext.woff2` | Bricolage Grotesque | 500 à 800 | latin-ext     |
| `instrument-sans-latin.woff2`         | Instrument Sans     | 400 à 700 | latin         |
| `instrument-sans-latin-ext.woff2`     | Instrument Sans     | 400 à 700 | latin-ext     |
| `geist-mono-latin.woff2`              | Geist Mono          | 500 à 700 | latin         |
| `geist-mono-latin-ext.woff2`          | Geist Mono          | 500 à 700 | latin-ext     |

Ce sont les fichiers servis par Google Fonts pour la requête de `Systeme.dc.html` (`Bricolage Grotesque 500;700;800`, `Instrument Sans 400;500;600;700`, `Geist Mono 500;700`), récupérés le 16 octobre 2026. Chaque fichier est une police variable : le même fichier sert toutes les graisses de la famille. Le CSS qui les déclare est `../css/fonts.css`.

## Les remplacer ou les recharger

1. Demander la feuille de style à Google Fonts avec un navigateur récent comme User-Agent (sans cela, Google renvoie du TrueType) :

   ```
   curl -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
     "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&family=Instrument+Sans:wght@400;500;600;700&family=Geist+Mono:wght@500;700&display=swap" \
     -o google-fonts.css
   ```

2. Dans ce fichier, relever pour chaque famille les adresses `fonts.gstatic.com/...woff2` des blocs `/* latin */` et `/* latin-ext */` (les blocs des trois graisses d'une famille pointent vers le même fichier), puis les télécharger sous les noms du tableau ci-dessus.
3. Si les `unicode-range` ont changé, les reporter dans `src/typographie.ts` (`LATIN`, `LATIN_EXT`), puis mettre à jour `css/fonts.css` (voir le README du package).
4. Lancer `pnpm --filter @afrimove/design run test` : le test vérifie que chaque fichier déclaré existe.

Sans accès au réseau, les mêmes familles se trouvent dans les dépôts officiels (`github.com/ateliertriay/bricolage`, `github.com/Instrument/instrument-sans`, `github.com/vercel/geist-font`) ; convertir les TTF variables en woff2 avec `woff2_compress` ou `fonttools` (`pyftsubset --flavor=woff2`), garder les mêmes noms de fichiers, et le CSS n'a pas à changer.

En attendant les fichiers, `css/fonts.css` reste valable : un fichier absent est ignoré par le navigateur, qui applique les replis Arial Black, Arial et Courier New.
