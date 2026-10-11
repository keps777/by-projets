// Catégories les plus évidentes proposées à la saisie d'un mouvement d'argent, par type de mouvement.
// Celles déjà utilisées passent devant (voir SuiviFinances) ; on peut toujours en taper une autre.
export const CATEGORIES_FINANCES = {
  entrees: ['Salaire', 'Don reçu', 'Revenu d’affaires', 'Remboursement', 'Cadeau', 'Autre revenu'],
  sorties: ['Loyer', 'Alimentation', 'Transport', 'Dons et dîme', 'Factures', 'Santé', 'Loisirs', 'Vêtements', 'Éducation', 'Divers'],
  epargne: ['Fonds d’urgence', 'Maison', 'Projet', 'Placement', 'Autre épargne']
} as const;
