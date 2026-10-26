// Écrans réservés du verso (Mes actifs), des drops et du compte : tant qu'aucun dossier `src/apps/*/routes.ts` ne déclare le même chemin, une page « Bientôt » tient la place.
// Le routeur n'ajoute une réservée que si le chemin n'est pas déjà déclaré : construire un écran = déclarer sa route dans son dossier, sans toucher à ce fichier.
export type OngletReserve = 'accueil' | 'rechercher' | 'drops' | 'portefeuille' | 'compte';
export const RESERVEES: [chemin: string, titre: string, onglet: OngletReserve][] = [
  ['/portefeuille', 'Portefeuille', 'portefeuille'], ['/droit/:id', 'Mon droit de voyage', 'portefeuille'], ['/cours/:id', 'Cours du vol', 'portefeuille'], ['/ordre/:id', 'Ordre à cours limité', 'portefeuille'],
  ['/liquidite/:id', 'Vendre ou attendre', 'portefeuille'], ['/revendre/:id', 'Revendre', 'portefeuille'], ['/transferer/:id', 'Transférer à un proche', 'portefeuille'], ['/echeances', 'Échéances', 'portefeuille'],
  ['/importer', 'Importer un billet', 'portefeuille'], ['/indices', 'Indices NexG', 'portefeuille'], ['/solde', 'Solde NexG', 'portefeuille'], ['/soute/:id', 'Soute du vol', 'portefeuille'],
  ['/bagages/vendre', 'Revendre un bagage', 'portefeuille'], ['/bagages/demande', 'Chercher un bagage', 'portefeuille'], ['/marche-intentions', 'Intentions d’achat', 'portefeuille'],
  ['/drops', 'Drops membres', 'drops'], ['/pass', 'Pass NexG', 'compte'], ['/compte', 'Compte', 'compte'], ['/notifications', 'Notifications', 'compte'], ['/alertes', 'Alertes', 'compte'], ['/aide', 'Aide', 'compte']
];
