// Le « monde » de NexG-TT : tout ce que le backend simulé sait. Un seul état, persisté en localStorage (voir data/store.svelte.ts).
// Montants en dollars canadiens (nombres, deux décimales au plus). Instants en millisecondes (heure locale de Montréal dans la démo). Jours au format `YYYY-MM-DD`.

export type Zone = 'Europe' | 'Caraïbes' | 'Asie' | 'Amériques' | 'Océanie' | 'Afrique';
export interface Aeroport { code: string; ville: string; pays: string; zone: Zone; /** Durée de vol indicative depuis Montréal (heures), pour le radar. */ dureeH: number; /** Direction depuis Montréal en degrés (0 = nord, 90 = est), pour le radar. */ cap: number }
export interface Compagnie { id: string; nom: string; code: string }

export type Cabine = 'Économie' | 'Économie plus' | 'Affaires';
export interface Vol {
  id: string; compagnieId: string; /** « AE 812 » */ numero: string; de: string; vers: string;
  jour: string; heureDepart: string; heureArrivee: string; /** Jours d'écart à l'arrivée (+1). */ plusJours: number; dureeMin: number; escales: string[];
  cabine: Cabine; /** Prix équivalent d'un billet neuf aujourd'hui = plafond de revente (règle provisoire). */ prixNeuf: number;
  /** Prix équivalent neuf, un point par jour sur les 90 derniers jours (le dernier est le prix d'aujourd'hui). */ courbe: number[];
  /** Prix du bagage supplémentaire au comptoir de la compagnie (plafond de la soute partagée). */ prixBagageCompagnie: number;
}

export type StatutDroit = 'detenu' | 'en_vente' | 'nomme' | 'vendu' | 'transfere' | 'voyage' | 'gele' | 'rachete';
export type OrigineDroit = 'neuf' | 'drop' | 'revente' | 'agence' | 'import' | 'transfert';
export type TypeMaillon = 'achat_neuf' | 'drop' | 'revente' | 'agence' | 'import' | 'transfert' | 'rachat' | 'nommage' | 'gel' | 'degel';
/** Un maillon de la chaîne de détention (registre interne NexG-TT). `de`/`vers` : identifiant de compte, `nexgtt`, ou `agence:<id>`. */
export interface Maillon { id: string; quand: number; type: TypeMaillon; de: string | null; vers: string; prix: number; commission?: number; note?: string }
export interface Voyageur { prenom: string; nom: string; naissance?: string; /** Genre tel que demandé par la compagnie : F, M ou X (si accepté). */ genre?: 'F' | 'M' | 'X'; document?: string; pourSoi: boolean; compteId?: string }
export interface Droit {
  id: string; /** « NXG-7Q2M » */ ref: string; volId: string; detenteurId: string; statut: StatutDroit; prixPaye: number; origine: OrigineDroit;
  chaine: Maillon[]; /** Annonce de revente en cours. */ annonce?: { prix: number; depuis: number }; voyageur?: Voyageur;
  /** Nombre de bagages en soute inclus et siège choisi, une fois nommé. */ bagagesInclus: number; siege?: string; dropId?: string; agenceId?: string;
  /** Référence de la réservation chez la compagnie (PNR), attribuée à l'achat. */ pnr?: string;
  /** Raison du gel administratif. */ gelRaison?: string;
}
export interface OffreAgence { id: string; agenceId: string; volId: string; prix: number; note?: string }
export interface Agence { id: string; nom: string; ville: string; permisVerifie: boolean; depuis: number; description: string; offresForfait?: string }

export interface Drop { id: string; /** N° affiché (128). */ n: number; volId: string; prixMembre: number; prixEquivalent: number; places: number; restantes: number; ouvre: number; fin: number; /** Membres déjà servis. */ servis: string[] }
export interface DropAVenir { id: string; ouvre: number; zone: Zone | 'Monde'; /** Destination masquée jusqu'à l'ouverture. */ volId?: string; alerteIds: string[] }

export type ValiditeOrdre = 'jour' | 'semaine' | 'depart';
export interface Ordre { id: string; compteId: string; volId: string; /** Prix limite : achat automatique si une revente descend à ce seuil. */ limite: number; validite: ValiditeOrdre; statut: 'actif' | 'execute' | 'annule' | 'expire'; creeLe: number; droitId?: string }
export interface Proposition { id: string; intentionId: string; vendeurId: string; droitId: string; prix: number; quand: number; statut: 'recue' | 'acceptee' | 'refusee' | 'expiree' }
export interface Intention { id: string; compteId: string; volId?: string; de: string; vers: string; /** Budget maximum par voyageur, fonds réservés d'avance. */ budget: number; fondsReserves: number; creeLe: number; statut: 'publiee' | 'accord' | 'annulee'; propositions: Proposition[] }

export interface BagageDroit { id: string; volId: string; detenteurId: string; kg: number; prix: number; statut: 'inclus' | 'en_vente' | 'vendu' | 'achete' | 'transfere'; de?: string }
export interface DemandeBagage { id: string; compteId: string; volId: string; kg: number; prixMax: number; creeLe: number; statut: 'ouverte' | 'servie' | 'annulee' }

export type TypeEcriture = 'achat' | 'revente' | 'commission' | 'versement' | 'fonds_reserves' | 'remboursement' | 'pass' | 'bagage' | 'rachat' | 'transfert';
/** Une ligne du grand livre du solde NexG. `montant` signé (+ entrée, − sortie), `solde` après le mouvement. */
export interface Ecriture { id: string; compteId: string; quand: number; type: TypeEcriture; libelle: string; sous?: string; montant: number; solde: number; droitId?: string; hypothese?: boolean }

export type Prefs = 'tout' | 'essentiel' | 'rien';
export interface Compte {
  id: string; role: 'voyageur' | 'admin'; prenom: string; nom: string; email: string; tel: string; ville: string; aeroport: string; langue: 'fr' | 'en'; region: string;
  pass: { actif: boolean; depuis?: number }; identiteVerifiee?: number; passkey: boolean; carte4?: string; proches: string[];
  solde: number; enAttente: number; prefsNotif: Prefs; partage: { offres: boolean; analyses: boolean; partenaires: boolean }; creeLe: number; actif: boolean;
}
export interface Notification { id: string; compteId: string; quand: number; type: 'echeance' | 'prix' | 'drop' | 'vente' | 'achat' | 'transfert' | 'bagage' | 'proposition' | 'systeme'; titre: string; sous: string; lu: boolean; lien?: string; essentielle: boolean }
export interface Transfert { id: string; droitId: string; de: string; vers: string; quand: number; statut: 'fait' | 'refuse' | 'en_attente'; note?: string }
export interface Audit { id: string; quand: number; acteur: string; action: string; cible: string; detail: string; gravite: 'info' | 'attention' | 'critique' }
export interface Alerte { id: string; compteId: string; de: string; vers: string; /** « Partout » = n'importe quelle destination. */ prixMax: number; actif: boolean; creeLe: number }

export interface Monde {
  aeroports: Aeroport[]; compagnies: Compagnie[]; vols: Vol[]; droits: Droit[]; offresAgence: OffreAgence[]; agences: Agence[];
  drops: Drop[]; dropsAVenir: DropAVenir[]; ordres: Ordre[]; intentions: Intention[]; bagages: BagageDroit[]; demandesBagage: DemandeBagage[];
  ecritures: Ecriture[]; comptes: Compte[]; notifications: Notification[]; transferts: Transfert[]; audit: Audit[]; alertes: Alerte[];
}
export interface Session {
  compteId: string | null; langue: 'fr' | 'en'; /** Face de l'application : le voyage (jour, recto) ou les actifs (nuit, verso). */ face: 'voyage' | 'marche';
  /** Brouillon d'inscription (écrans d'accueil et d'ouverture de compte). */ inscription: { prenom?: string; nom?: string; email?: string; tel?: string; code?: string; etape: number };
  vuTuto: boolean; derniereActivite: number;
}
export interface Etat { version: 1; monde: Monde; session: Session; /** Une tranche par fonctionnalité (voir `tranche()` dans data/store.svelte.ts). */ tranches: Record<string, unknown> }
