# §1 — Principes

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

1. **Une seule saisie, tout est alimenté.** Ce qui est noté une fois (dans un bloc, le Mode Focus ou le volet) alimente tous les sous-projets concernés, le rapport, les barres de progression et le document. Rien ne se ressaisit.
2. **Le serveur est la source de vérité** (Supabase). Un cache local permet de consulter et de saisir sans réseau ; tout se synchronise ensuite.
3. **Privé par conception.** Aucune donnée n'est envoyée par e-mail. Aucun traceur, aucune publicité. Chaque utilisateur ne voit que ses données.
4. **Les rappels passent uniquement par des notifications push** (application installée sur l'écran d'accueil de l'iPhone).
5. **La progression se mesure par mois.** Les objectifs peuvent durer 7, 21 ou 40 jours ; on les ramène au mois par une règle de trois (§5).
6. **Aucun jour de repos par défaut.** L'utilisateur décide lui-même des tâches qu'il ajoute ou non à chaque jour.
7. **Discipline avec grâce.** Un bloc non fait s'estompe et reste à rattraper ; aucun message n'accuse. Pas de rouge punitif.
8. **Mobile d'abord** (iPhone, écran de 390 px), **nuit par défaut**, mode jour et mode automatique.
9. **Tout est personnalisable, mais avec des bases solides** : modèles de sous-projets par rubrique, métriques au choix, points du rapport au choix.
