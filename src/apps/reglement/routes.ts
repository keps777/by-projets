import type { Route } from '../../router.svelte.ts';

/** Règlement : siège, paiement (attente, refus), pass (hors ligne, annulation), bus entier, paiement pour un proche. */
const voyageur = ['voyageur'] as const;
export default [
  { chemin: '/siege', composant: () => import('./Siege.svelte'), titre: 'Choix de la place', roles: [...voyageur] },
  { chemin: '/paiement', composant: () => import('./Paiement.svelte'), titre: 'Paiement', roles: [...voyageur] },
  { chemin: '/paiement/attente', composant: () => import('./Attente.svelte'), titre: 'Confirmation du paiement', roles: [...voyageur] },
  { chemin: '/paiement/refus', composant: () => import('./Refus.svelte'), titre: 'Paiement refusé', roles: [...voyageur] },
  { chemin: '/pass', composant: () => import('./Pass.svelte'), titre: 'Mes billets', roles: [...voyageur], onglet: 'billets' },
  { chemin: '/pass/hors-ligne', composant: () => import('./HorsLigne.svelte'), titre: 'Billet hors ligne', roles: [...voyageur], onglet: 'billets' },
  { chemin: '/pass/annule', composant: () => import('./Annule.svelte'), titre: 'Annuler un billet', roles: [...voyageur], onglet: 'billets' },
  { chemin: '/groupe', composant: () => import('./Groupe.svelte'), titre: 'Bus entier', roles: [...voyageur] },
  { chemin: '/proche', composant: () => import('./Proche.svelte'), titre: 'Pour un proche', roles: [...voyageur] }
] satisfies Route[];
