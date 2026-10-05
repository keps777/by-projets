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
