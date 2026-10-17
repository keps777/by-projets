/**
 * Identifiant du groupe de la démonstration (mode démo, scénario « Groupe » seulement) : l'adresse `/groupe` de la
 * planche n'indique ni groupe ni départ. Le mock répond le groupe de la planche pour n'importe quel identifiant.
 * Hors démo, l'écran lit `?groupe=` (groupe existant) ou `?depart=` (groupe à créer).
 */
export const DEMO_GROUPE_ID = "groupe-demo";
