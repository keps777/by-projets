# Kit UI · données (AM-008)

Composants React 19 + CSS modules, couleurs et tailles par variables `--am-*` de `@afrimove/design`. Graphiques en SVG natif. Les mêmes composants servent à 390 px et à 1280 px (salle de contrôle) : `variante="large"` ou `taille="large"`, pas de second kit. Tout import se fait par `@afrimove/ui`.

| Composant                                       | Rôle                                                                                                            | Planches                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `TuileKpi`, `ChiffreCle`                        | Étiquette mono, valeur Bricolage, sous-ligne, tendance, couleur d'état ; tailles `compacte`, `large`, `affiche` | Patron, AnalysesBus, Controle                     |
| `CarteDonnees`                                  | Carte qui porte un graphique (étiquette ambre + contenu à droite)                                               | Analyses, AnalysesBus, Controle                   |
| `Histogramme`                                   | Barres SVG : formats `jours` (7), `semaines` (8), `heures` (12, barres prévues en pointillé, repères)           | Analyses, AnalysesBus, Controle                   |
| `BarreRemplissage`                              | Trait vert, ambre ou rouge selon des seuils (`SEUILS_REMPLISSAGE`)                                              | Analyses                                          |
| `ListeGlissable`, `LigneAlerte`, `LigneListe`   | Liste à hauteur fixe, dégradé bas, « n · glisser » ; lignes d'alerte et lignes à colonnes libres                | Patron, Analyses, Controle                        |
| `BandeauAssistant`                              | Fond `#0E2A1E`, formes `lien` et `bloc`                                                                         | Patron, AnalysesBus, Controle                     |
| `TableauColonnesFixes`                          | Colonnes typées, première colonne collée, fonds alternés, pied                                                  | ComptableApercu, Controle                         |
| `FeuilleModale`                                 | Feuille ou pop-up sur voile : Échap, voile, focus piégé et rendu                                                | ComptableApercu                                   |
| `ApercuBilletThermique`, `ApercuEtiquetteColis` | Aperçus d'impression 58 mm et 58 × 40 mm                                                                        | GuichetColis (+ Vente pour les valeurs du billet) |
| `BulleWhatsApp`, `ConversationWhatsApp`         | Bulles reçues et envoyées                                                                                       | RapportSoir, USSD                                 |
| `EcranUssd`                                     | Afficheur et clavier d'un téléphone à touches                                                                   | USSD                                              |

Exemple :

```tsx
<Histogramme format="jours" barres={[{ etiquette: "V", valeur: 88, accent: "ambre" }]} ariaLabel="Recette par jour" />
<ListeGlissable titre="Par ligne · remplissage" nombre={7} hauteur={168}>
  <LigneListe colonnes="1fr 64px auto">…</LigneListe>
</ListeGlissable>
```

`demo.tsx` (exporté) reproduit la zone « données » de chaque planche avec ses valeurs : `DemoPatron`, `DemoAnalyses`, `DemoAnalysesBus`, `DemoComptableApercu`, `DemoGuichetColis`, `DemoBilletThermique`, `DemoRapportSoir`, `DemoUssd`, `DemoControle` (1280 px), et `DemoDonnees` qui les assemble. Le banc de fidélité (AM-004) compare ces cadres aux planches.

## Choix à connaître

- Seuils de remplissage : vert à partir de 80 %, ambre à partir de 65 %. La planche Analyses ne montre que 91, 88, 84, 83 (vert), 78, 74 (ambre) et 61 (rouge) ; 80 et 65 sont un choix à confirmer.
- L'afficheur USSD utilise `#C9D6B0` et `#10200E`, relevés dans USSD.dc.html mais absents des tokens AM-003 ; ils sont déclarés en variables locales `--am-ussd-*` dans `EcranUssd.module.css`.
- Le code-barres des aperçus est un dessin déterministe tiré du numéro, pas un code scannable.
- Aucune planche ne montre le billet thermique 58 mm : `ApercuBilletThermique` reprend le style de l'étiquette colis et les valeurs de la planche Vente.
- Les tests importent `configuration-tests.ts` (matchers jest-dom et nettoyage du DOM), car la configuration Vitest du package est en `globals: false`.
