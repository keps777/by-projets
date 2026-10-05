# §18 — Le Carnet

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

Le Carnet est **un seul livre** où se retrouvent toutes les notes de l'utilisateur, jour après jour, **numérotées sans interruption** (1, 2, 3, 4…) dans l'ordre où elles ont été écrites, quelle que soit l'activité où elles ont été prises. Il sert à garder des choses précises qui aident dans la vie.

## Règles
1. **Une note** = un texte, un jour, un **numéro** continu (le plus grand numéro + 1 au moment de l'écriture ; un numéro n'est jamais renuméroté), l'heure de l'écriture et son **origine**.
2. **Origines** : `libre` (écrite depuis Le Fil ou depuis le Carnet), `focus` (écrite pendant un bloc en Mode Focus), `bloc` (note d'un bloc fait ou lancé), `saisie` (note jointe à une saisie manuelle dans un sous-projet).
3. **Référence** : une note prise pendant un bloc garde son contexte même si le bloc est ensuite supprimé — le titre du bloc et l'heure sont copiés dans la note. Toucher la référence ouvre le bloc quand il existe encore.
4. **Chaque jour est une page.** Le Carnet s'ouvre sur la page du jour ; **glisser** vers la droite ouvre la page précédente qui contient des notes, vers la gauche la suivante. Un **sommaire** liste les pages (date, nombre de notes, numéros de … à …).
5. **Note libre** : le bouton « Carnet » du Fil mène à la page du jour avec le champ d'écriture ouvert ; la note est ajoutée au livre avec le numéro suivant.
6. **Mode Focus** : à la place de l'ancienne zone « Ce que Dieu me dit », le Focus propose d'écrire plusieurs notes numérotées, ajoutées au Carnet pendant le bloc. À la fin du bloc, le texte de ces notes est aussi gardé dans la note de la saisie (les tableaux des sous-projets la montrent toujours).
7. **Modifier / supprimer** une note : toucher la note. Supprimer laisse un trou dans la numérotation (les autres numéros ne changent pas).
8. **Recherche** : les notes sont dans la recherche (filtre « Notes »).
9. **Vie privée** : comme toutes les données, les notes sont à l'utilisateur seul (règles d'accès par ligne), jamais envoyées ailleurs ; aucun e-mail.

## Données
Table `notes` : `jour`, `texte`, `numero`, `origine`, `heure` (minutes depuis minuit, heure locale), `occurrence_id` (facultatif), `projet_id` (facultatif), `source_label` (titre du bloc, copié).
