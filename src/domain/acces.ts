// Qui entre où : page d'accueil de chaque rôle et libellés. Les agents de gare, le patron et les partenaires ont chacun leur application.
import type { Role } from './types.ts';
export const ACCUEIL: Record<Role, string> = {
  voyageur: '/', guichet: '/guichet', quai: '/quai', chauffeur: '/chauffeur', convoyeur: '/convoyeur', controleur: '/controleur', superviseur: '/superviseur',
  patron: '/patron', comptable: '/siege/comptable', relais: '/relais/app', livreur: '/livreur', conducteur: '/conducteur', vendeur: '/vendeur'
};
export const NOM_ROLE: Record<Role, string> = {
  voyageur: 'Voyageur', guichet: 'Guichet', quai: 'Quai', chauffeur: 'Chauffeur', convoyeur: 'Convoyeur', controleur: 'Contrôleur', superviseur: 'Superviseur de gare',
  patron: 'Patron', comptable: 'Comptable', relais: 'Point relais', livreur: 'Livreur moto', conducteur: 'Conducteur covoiturage', vendeur: 'Vendeur ambulant'
};
export const ROLES_EQUIPE: Role[] = ['guichet', 'quai', 'chauffeur', 'convoyeur', 'controleur', 'superviseur'];
export const ROLES_SIEGE: Role[] = ['patron', 'comptable'];
export const ROLES_PARTENAIRES: Role[] = ['relais', 'livreur', 'conducteur', 'vendeur'];
export const TOUS_ROLES: Role[] = ['voyageur', ...ROLES_EQUIPE, ...ROLES_SIEGE, ...ROLES_PARTENAIRES];
/** Un rôle d'agence peut ouvrir les écrans « équipe » ; le patron ouvre tout. */
export const peut = (role: Role | null, autorises: Role[]) => !!role && (role === 'patron' || autorises.includes(role));
