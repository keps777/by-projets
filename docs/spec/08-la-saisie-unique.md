# §8 — La saisie unique

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

**Sources** : le volet d'un bloc, le minuteur, le Mode Focus, la saisie manuelle depuis un sous-projet (« Saisir un autre jour »), le rattrapage d'un jour passé.

**Règles**
1. Une saisie est rattachée au **projet** de la tâche ; tous ses sous-projets la lisent (§6).
2. **Correction manuelle** à tout moment : le volet permet de changer le temps (± 5 min ou saisie directe), les quantités, la référence, la note. Les barres et le rapport se recalculent aussitôt. La correction affiche d'abord ce qui était prévu et ce qui a été enregistré.
3. Une occurrence est **faite** quand l'utilisateur confirme (bouton « Fait », fin du minuteur, ou saisie). Sinon le cercle reste vide.

**Minuteur**
- Boutons ▶ (Lancer), ⏸ (Pause), ■ (Terminer), sur le bloc, dans la carte du bas, dans le volet et dans le Mode Focus.
- L'état est enregistré par **horodatage** : `demarree_a`, `pause_cumulee_s`. Le temps écoulé = maintenant − `demarree_a` − pauses. Il reste exact si l'app est fermée ou en arrière-plan.
- Le bloc **se remplit de gauche à droite**. À la fin prévue : « As-tu terminé ? » → **Oui** (bloc plein avec la coche, valeurs enregistrées) · **Corriger le temps** (ouvre le volet) · **Pas encore** (le minuteur continue). Si l'app était fermée, le message s'affiche à l'ouverture.

**Mode Focus**
- Anneau de temps, Pause, Terminer.
- **Passages lus** : livre (liste de suggestions), chapitre de début, chapitre de fin ; plusieurs entrées (ex. Matthieu 8–10, Luc 22). Le total de chapitres est calculé et comparé à l'objectif ; chaque entrée peut être retirée.
- Champ « Ce que Dieu me dit » (note).

## Plusieurs minuteurs à la fois (5 oct. 2026)
Chaque bloc a **son propre minuteur** : on peut lancer ▶ plusieurs blocs en même temps, sans que l'un mette l'autre en pause. Chacun enregistre son temps réel ; deux blocs qui se chevauchent comptent donc tous les deux leur temps. La carte du bas indique « N en cours en même temps » et liste chaque bloc avec sa barre, sa pause et son arrêt. Quand la fin prévue de plusieurs blocs est atteinte, « As-tu terminé ? » est posé bloc après bloc.

## Passages de la Bible par menus déroulants (5 oct. 2026)
Partout où l'on note ce qui a été lu (Mode Focus, volet d'un bloc, « Saisir un jour » d'un sous-projet, saisie depuis un point du rapport), les passages se choisissent dans trois **menus déroulants** : **Livre** (66 livres, groupés Ancien / Nouveau Testament), **Du chapitre**, **Au chapitre** (jamais avant « du chapitre »), puis « Ajouter ». Après un ajout, le chapitre suivant est déjà prêt (Luc 22–24 → Luc 24… ou Matthieu 1–2 → Matthieu 3) et le dernier livre utilisé est retenu. « Livre entier » remplit tous les chapitres. Chaque passage ajouté ou retiré met à jour la référence écrite (« Luc 22–24 · Matthieu 1–2 ») et le **nombre de chapitres lus**. Les anciennes saisies écrites à la main (« Mt 8–10 ») sont relues en passages.

## Corriger le temps d'un minuteur en cours (9 oct. 2026)
Dans le volet d'un bloc, le **temps passé se corrige à la main même quand le minuteur tourne ou est en pause** : toucher la valeur ouvre les champs **h · min · s** (OK pour finir), et − / + corrigent de 5 min. Le départ du minuteur est déplacé pour que le temps écoulé vaille la valeur choisie (`fixerEcoule`) : en pause il reste figé à cette valeur, en cours il repart de là ; les pauses déjà prises sont conservées.

