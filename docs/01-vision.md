# 01 — Vision : *Luther Life* (nom de travail : By Projets), ma vie par projets

> **Mise à jour du 5 oct. 2026.** L'esprit de la vision ne change pas. Le vocabulaire et les fonctions sont désormais définis par `02-specification.md` (v2) : « thème » devient **rubrique**, « Ebenezer » devient **Archive**, les 4 modes de suivi sont remplacés par des **métriques personnalisables**, et **Le Fil** (calendrier du jour avec minuteur) est l'écran principal.

> « Écris la vision, grave-la sur des tables, afin qu'on la lise couramment. » — Habacuc 2:2

## L'idée en une phrase

Une application web installable sur le téléphone (PWA). Elle devient **l'unique outil de pilotage de ma vie** : chaque aspect de ma vie est un **thème**, chaque thème contient des **projets**, chaque projet se découpe en **sous-projets** concrets. Chaque sous-projet a une fiche, un tableau de suivi qu'on coche jour après jour, et un **document final signé** qui reste comme témoignage.

## Le problème

Aujourd'hui, la discipline personnelle est éparpillée : des notes ici, un agenda là, des agents IA, des fichiers LaTeX à part. Aucun outil ne relie **l'intention** (pourquoi je fais ça), **le plan** (ce qui est prévu), **l'action du jour** (ce que je fais maintenant) et **la preuve** (ce qui a été accompli). Résultat : on démarre beaucoup, on mesure peu, on n'archive presque rien.

## La vision magnifiée

### 1. Les Thèmes : les grands domaines de ma vie (les onglets)

L'écran d'accueil présente les domaines de vie sous forme d'onglets ou de tuiles :

| Thème | Exemples de projets |
|---|---|
| ✝️ Ma relation avec Dieu | Lecture de la Bible, prière, méditation |
| 🕊️ Mon service à Dieu | Évangélisation, formation de disciples, prière (?) |
| ⏳ Utilisation du temps | Emploi du temps quotidien, comptes rendus |
| 💼 Mon travail | … |
| 💰 Mes finances | … |
| 🏠 Entretien de ma maison | … |
| 💍 Préparation au mariage | … |

Chaque thème a sa couleur, son icône, et éventuellement **un verset ou une intention** qui rappelle *pourquoi* ce domaine compte.

### 2. Thème → Projet → Sous-projet : une architecture de vie

```
Thème           Ma relation avec Dieu
└── Projet      Lecture de la Bible
    ├── Sous-projet   Terminer le Nouveau Testament ce mois-ci
    └── Sous-projet   Lire 3 chapitres chaque jour
```

Le **sous-projet** est l'unité d'exécution. C'est lui qu'on ouvre, qu'on suit, qu'on coche, qu'on signe.

### 3. La Fiche d'identité du sous-projet (QQOQCCP / 5W2H)

Chaque sous-projet a une page d'information qui le définit sans ambiguïté :

| Question | Sens |
|---|---|
| **Quoi ?** (*What*) | De quoi s'agit-il exactement ? |
| **Pourquoi ?** (*Why*) | Quelle motivation, quel fruit attendu ? |
| **Qui ?** (*Who*) | Moi seul ? Avec qui ? Qui me rend compte (mentor, discipleur) ? |
| **Où ?** (*Where*) | Lieu, contexte |
| **Quand ?** (*When*) | Date de début, date de fin, fréquence |
| **Comment ?** (*How*) | Méthode, moyens |
| **Combien ?** (*How much*) | Quantité, objectif chiffré, budget |

### 4. Les métriques : le cœur battant

Chaque sous-projet suit des **métriques** que l'on choisit et règle : temps, nombre de fois, nombre (chapitres, pages, personnes…), dollars (entrées, sorties, épargne), oui/non, choix (jeûne complet ou partiel), distance, poids, note, pourcentage, heure, référence. On note **une seule fois** ce qu'on a fait ; tout le reste se calcule (progression, solde, rapport, document). Voir `02-specification.md` §4 et §5.

### 5. Le Document vivant : du suivi au témoignage

C'est ce qui rend le projet unique : **tu as déjà un modèle LaTeX** de fiche de suivi.

- À chaque coche, le document se **remplit tout seul**.
- Un **aperçu en direct** montre le document tel qu'il sera imprimé.
- À la fin du sous-projet, on **exporte en PDF**, on **signe** (signature dessinée à l'écran, ou impression puis signature à la main) et on garde un **suivi physique**.
- Le document devient un **témoignage** qu'on peut partager avec d'autres.

### 6. Le Fil : l'écran principal

Une journée de 24 h, avec la ligne de l'heure qui descend en direct. Chaque bloc appartient à un projet ; on le **lance** (il se remplit), on le coche, on corrige ce qui a été fait, on le reporte. Un bouton **+** ajoute une tâche, avec sa récurrence, et dit quels sous-projets elle alimente. Chaque soir, un **rapport** se génère, avec ses récapitulatifs de semaine et de mois, que l'on peut envoyer en choisissant les points à partager.

### 7. Archive : le mémorial des projets accomplis

> « Jusqu'ici l'Éternel nous a secourus. » — 1 Samuel 7:12

Chaque sous-projet terminé et signé entre dans l'**Archive** (anciennement Ebenezer), une archive chronologique de pierres de souvenir (Josué 4). Avec les années, c'est **le livre de ta fidélité et de celle de Dieu**, consultable, imprimable et transmissible.

### 8. Plus tard : l'agent IA et la redevabilité

- **Assistant IA** : « Je veux lire tout le Nouveau Testament en octobre » produit le sous-projet complet (fiche QQOQCCP, 30 lignes, rappel dans l'emploi du temps). Il peut aussi rédiger le compte rendu hebdomadaire à partir des coches et des commentaires.
- **Redevabilité** : partager un sous-projet en lecture avec un mentor ou un discipleur, qui peut co-signer le document final.

## Principes directeurs

1. **Un seul outil.** Si une donnée de vie sert à piloter, elle vit ici.
2. **De la vision à la coche.** Chaque coche du jour remonte à un sous-projet, puis à un projet, puis à un thème, puis à un *pourquoi*.
3. **Mobile d'abord, hors-ligne d'abord.** Ça doit marcher dans le métro, sans réseau.
4. **La preuve compte.** Ce qui est accompli est documenté, signé, archivé.
5. **Discipline avec grâce.** On mesure pour progresser, pas pour se condamner : un jour manqué se commente et se rattrape, il ne « casse » rien.
6. **Construit par spécification.** On écrit d'abord ce que l'app doit faire (ces documents), puis on construit petit à petit, en vérifiant chaque étape.

## Ce que ce n'est pas (pour garder le cap)

- Pas un réseau social, ni une app collaborative d'équipe (au moins en v1).
- Pas un clone de Notion : la structure est **opinionée** (Thème → Projet → Sous-projet → Suivi → Document).
- Pas un simple traqueur d'habitudes : chaque habitude est rattachée à une vision et produit un document.
