# Maquettes

Sources des maquettes haute fidélité, exportées de https://claude.ai/artifact/5ZgqUjisYTEMRLL3w6d2F6. **Référence en lecture seule** : on les ouvre par planche, jamais en bloc.

- `maquettes-v2/` : version 2 (nuit par défaut ; les fichiers `Jour*` sont les variantes claires). `canvas.json` donne le titre et la position de chaque planche.
- `maquettes-v1/` : première version, gardée pour mémoire (Document, Bilan, Bloc…).
- Chaque fichier `.dc.html` est autonome : le gabarit est entre `<x-dc>` et `</x-dc>`, la logique de démonstration dans le `<script>` (classe `Component`, méthode `renderVals`). Les fichiers qui ne contiennent qu'un `dc-import` sont des variantes d'un autre écran avec d'autres réglages.
- Correspondance écran ↔ planche : `docs/spec/12-ecrans.md`.
- Les couleurs, polices et espacements sont à reprendre dans les **jetons de design** de l'app, pas à copier planche par planche.
