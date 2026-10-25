// Covoiturage : types des données propres au covoiturage (profil du conducteur, avis), gardées dans la tranche « route », indexées par personne.
export type Carrosserie = 'citadine' | 'berline' | 'suv' | 'pickup';
export const NOM_CARROSSERIE: Record<Carrosserie, string> = { citadine: 'Citadine', berline: 'Berline', suv: 'SUV', pickup: 'Pick-up' };
export const CARROSSERIES: Carrosserie[] = ['citadine', 'berline', 'suv', 'pickup'];
export interface IdentiteConducteur { numero: string; /** Miniatures (data URL) recto et verso de la carte d'identité. */ recto: string; verso: string }
export interface PermisConducteur { numero: string; /** AAAA-MM-JJ */ validite: string }
export interface VehiculeConducteur { marque: string; modele: string; couleur: string; plaque: string; /** Places passagers proposées (1 à 4). */ places: number; carrosserie: Carrosserie; photos: string[] }
export interface ProfilConducteur {
  identite: IdentiteConducteur; permis: PermisConducteur; vehicule: VehiculeConducteur;
  /** « en_verification » juste après l'envoi, puis « verifie » (simulé par l'horloge de l'application). */ statut: 'en_verification' | 'verifie'; soumisLe: number;
  telVerifie: boolean; /** Trajets effectués avant AfriMove (ceux faits dans l'app s'y ajoutent). */ trajets: number; /** Mois d'inscription « 2025-03 ». */ depuis: string;
  /** Avis déjà reçus (la note du profil en est la moyenne). */ nbAvis: number; fumeur: boolean; clim: boolean; /** Ne prend que des passagères. */ femmes: boolean; bio?: string;
}
export interface AvisCovoit {
  id: string; offreId: string; deId: string; pourId: string; /** Rôle de la personne notée. */ role: 'conducteur' | 'passager'; note: number; tags: string[]; texte: string; ts: number;
}
export interface InfoOffre { note: number; verifie: boolean; fumeur: boolean; femmes: boolean }
