// Modèle de domaine d'AfriMove. Un seul « monde » simulé (localStorage) partagé par toutes les applications :
// voyageur, agents de gare, superviseur, patron, siège, partenaires. Les montants sont en FCFA entiers.
import type { Jour } from '../core/dates.ts';
export type { Jour };

export type Role = 'voyageur' | 'guichet' | 'quai' | 'chauffeur' | 'convoyeur' | 'controleur' | 'superviseur' | 'patron' | 'comptable' | 'relais' | 'livreur' | 'conducteur' | 'vendeur';
export type ClasseBus = 'Classique' | 'VIP';
export type Canal = 'app' | 'guichet' | 'convoyeur' | 'ussd' | 'whatsapp' | 'vendeur';
export type MoyenPaiement = 'momo' | 'om' | 'carte' | 'visage' | 'especes' | 'proche';

export interface Compagnie { id: string; nom: string; abrev: string; couleur: string }
export interface Gare { id: string; ville: string; nom: string }
export interface Bus { id: string; immat: string; compagnieId: string; classe: ClasseBus; capacite: number }
export interface Ligne {
  id: string; de: string; vers: string; gareDe: string; gareVers: string; compagnieId: string; classe: ClasseBus;
  prix: number; dureeMin: number; actif: boolean; /** Heures de départ habituelles (HH:MM). */ horaires: string[];
}
export type StatutDepart = 'prevu' | 'embarquement' | 'parti' | 'arrive' | 'annule';
export interface Depart {
  id: string; ligneId: string; jour: Jour; heure: string; busId: string; capacite: number; prix: number; statut: StatutDepart;
  /** Retard annoncé, en minutes (0 = à l'heure). */ retardMin: number; chauffeurId?: string; convoyeurId?: string;
  /** Position estimée du bus en route, 0 à 1 (simulée). */ avancement: number;
  /** Sièges déjà pris par d'autres voyageurs (hors billets du monde simulé) : garde le stockage léger. */ prisAilleurs: string[];
}

export type StatutBillet = 'attente_paiement' | 'valide' | 'scanne' | 'annule' | 'rembourse' | 'expire';
export interface Passager { nom: string; tel: string }
export interface Billet {
  id: string; /** Code court lisible (ex. AM7F3K22), contenu du QR avec le sceau. */ code: string; departId: string; siege: string | null;
  passager: Passager; prix: number; canal: Canal; acheteurId: string; paiementId: string; statut: StatutBillet; creeLe: number;
  scanneLe?: number; scannePar?: string; annuleLe?: number; /** Signature du billet (voir core/sceau.ts), vérifiable hors ligne. */ sceau: string;
  /** Vente au guichet : caisse qui a encaissé. */ caisseId?: string;
}
export type StatutPaiement = 'attente' | 'ok' | 'refuse' | 'rembourse';
export interface Paiement {
  id: string; ts: number; montant: number; moyen: MoyenPaiement; statut: StatutPaiement; ref: string; canal: Canal; payeurId: string;
  pour: { type: 'billet' | 'colis' | 'covoit'; ids: string[] }; /** Motif de refus affiché au voyageur. */ motif?: string; expireLe?: number;
}

export interface OffreCovoit {
  id: string; conducteurId: string; de: string; vers: string; jour: Jour; heure: string; places: number; prix: number; vehicule: string; enVille: boolean;
  /** Point de départ (quartier/gare). */ depart: string; reservations: { voyageurId: string; places: number; paiementId: string }[]; statut: 'ouverte' | 'en_route' | 'terminee' | 'annulee';
}

export type StatutColis = 'cree' | 'depose' | 'en_route' | 'au_relais' | 'en_livraison' | 'livre' | 'litige' | 'annule';
export interface EtapeColis { ts: number; statut: StatutColis; lieu: string; par?: string }
export interface Colis {
  id: string; code: string; expediteurId: string; destinataire: Passager; taille: 'S' | 'M' | 'L'; prix: number;
  options: { moto: boolean; assurance: boolean; contreRemboursement: boolean }; depart: string; arrivee: string; relaisId?: string; livreurId?: string;
  paiementId?: string; statut: StatutColis; etapes: EtapeColis[]; departId?: string; /** Code remis au destinataire. */ codeRetrait: string; caisseId?: string;
}

export interface Personne {
  id: string; nom: string; prenom: string; tel: string; role: Role; actif: boolean; /** Gare de rattachement (agents). */ gareId?: string; compagnieId?: string;
  pin?: string; langue?: 'fr' | 'en' | 'pcm'; ville?: string; points?: number; prochesIds?: string[]; passkey?: boolean; visage?: boolean;
  /** Taux de commission (convoyeur, vendeur ambulant), en % du billet. */ commission?: number; vehicule?: string; zone?: string; note?: number;
}

export interface Caisse {
  id: string; agentId: string; gareId: string; jour: Jour; ouvertA: number; fond: number; statut: 'ouverte' | 'fermee' | 'validee' | 'bloquee';
  fermeeA?: number; /** Comptage réel par coupure : { 10000: 9, … }. */ compte?: Record<string, number>; attendu?: number; ecart?: number;
  valideeA?: number; validePar?: string; justification?: string;
}
export interface Litige { id: string; ts: number; auteurId: string; type: string; objet: { type: 'billet' | 'colis' | 'depart'; id: string }; texte: string; statut: 'ouvert' | 'en_cours' | 'resolu'; reponse?: string }
export interface Notification { id: string; destId: string; ts: number; titre: string; sous: string; lu: boolean; lien?: string; type?: string }
export interface Evenement { id: string; ts: number; type: string; acteurId?: string; texte: string; ref?: string }

export interface Parametres {
  /** Modules activables par le patron (voir Modules). */ modules: Record<string, boolean>;
  /** Règles configurables (Config → Règles). */ regles: Record<string, boolean>; /** Options de prix (Config → Tarifs). */ tarifs: Record<string, boolean>;
}

export interface Monde {
  compagnies: Compagnie[]; gares: Gare[]; bus: Bus[]; lignes: Ligne[]; departs: Depart[]; billets: Billet[]; paiements: Paiement[];
  covoits: OffreCovoit[]; colis: Colis[]; personnes: Personne[]; caisses: Caisse[]; litiges: Litige[]; notifications: Notification[];
  evenements: Evenement[]; params: Parametres;
}
export interface SessionApp {
  personneId: string | null; role: Role | null; derniereActivite: number; langue: 'fr' | 'en' | 'pcm'; vuTuto: boolean; hors_ligne: boolean;
}
export interface Etat { version: 1; monde: Monde; session: SessionApp; /** Tranches propres à chaque fonctionnalité. */ tranches: Record<string, unknown> }
