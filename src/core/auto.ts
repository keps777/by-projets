// Crédit auto : simulation, contrôles de la demande, créneaux de livraison et suivi. Fonctions pures.
// Les décisions (score, 33 %, employeur, véhicule) restent dans `credit.ts` → `decider()`.
import { PLAFOND_ENDETTEMENT, PLAFONDS, etatPart, mensualite, partSalaire, type EtatPart, type Niveau } from './credit.ts';
import { ajouterJours, enDate, jourSemaineLong, prochainePaie, type Jour } from './dates.ts';
import { fcfa } from './money.ts';

export const DUREES = [12, 24, 36, 48] as const;
export type Assurance = 'tous_risques' | 'tiers';
export const ASSURANCES: Record<Assurance, { libelle: string; mensuel: number }> = {
  tous_risques: { libelle: 'Tous risques', mensuel: 18_000 },
  tiers: { libelle: 'Tiers', mensuel: 9_000 }
};
/** Une offre acceptée par la décision reste valable 7 jours. */
export const OFFRE_JOURS = 7;
/** Délai minimal entre la signature (ou la livraison) et le premier prélèvement sur salaire. */
export const DELAI_PREMIER_PRELEVEMENT = 20;
export const FINANCEMENT_MINIMUM = 100_000;
export const PAS_APPORT = 10_000;
/** Employeurs qui retiennent les mensualités sur la paie (comparaison sans casse ni accents). */
export const EMPLOYEURS_PARTENAIRES = ['NDIBA LOGISTIQUE'];

const norme = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
export const employeurPartenaire = (employeur: string | undefined | null) => !!employeur && EMPLOYEURS_PARTENAIRES.map(norme).includes(norme(employeur));
/** « 4 ans » → 4, « 8 mois » → 0,67, illisible → 0. */
export function ancienneteEnAnnees(texte: string | undefined | null): number {
  const m = /(\d+(?:[.,]\d+)?)\s*(an|ans|mois)/i.exec(texte ?? '');
  if (!m) return 0;
  const n = Number(m[1].replace(',', '.'));
  return /mois/i.test(m[2]) ? n / 12 : n;
}

// ------------------------------------------------------------------ niveau, plafond, apport
export const autoDisponible = (niveau: Niveau) => PLAFONDS[niveau].auto > 0;
export const plafondAuto = (niveau: Niveau) => PLAFONDS[niveau].auto;
/** Apport minimum pour que le montant financé reste sous le plafond du niveau. */
export const apportMinimum = (prix: number, niveau: Niveau) => (autoDisponible(niveau) ? Math.max(0, prix - plafondAuto(niveau)) : prix);

export interface DemandeAuto { prix: number; apport: number; duree: number; assurance: Assurance; niveau: Niveau; coffre: number }
/** Message d'erreur en clair, ou null si la demande peut être simulée puis soumise. */
export function validerDemande(d: DemandeAuto): string | null {
  if (!autoDisponible(d.niveau)) return "Le crédit auto s'ouvre au niveau Pro.";
  if (!Number.isInteger(d.apport) || d.apport < 0) return "L'apport doit être un montant entier, sans valeur négative.";
  if (!(DUREES as readonly number[]).includes(d.duree)) return 'Choisissez une durée de 12, 24, 36 ou 48 mois.';
  if (!(d.assurance in ASSURANCES)) return "Choisissez une formule d'assurance.";
  if (d.prix - d.apport < FINANCEMENT_MINIMUM) return d.apport >= d.prix ? "Cet apport couvre le prix : aucun crédit n'est nécessaire." : `Le montant financé doit être d'au moins ${fcfa(FINANCEMENT_MINIMUM)}.`;
  const min = apportMinimum(d.prix, d.niveau);
  if (d.apport < min) return `Apport minimum ${fcfa(min)} : le financement est limité à ${fcfa(plafondAuto(d.niveau))} à votre niveau.`;
  if (d.apport > d.coffre) return `Votre coffre voiture contient ${fcfa(d.coffre)}, pas assez pour cet apport.`;
  return null;
}

// ------------------------------------------------------------------ simulation
export interface EntreeSimulation { prix: number; apport: number; duree: number; assurance: Assurance; tauxMensuel: number; salaire: number; mensualitesExistantes: number }
export interface Simulation {
  financement: number;
  /** Part capital + frais de la mensualité, arrondie au franc. */
  mensualiteCredit: number;
  assurance: number;
  /** Ce qui est prélevé chaque mois : crédit + assurance. */
  mensualite: number;
  /** Frais du crédit (intérêts) sur toute la durée. */
  cout: number;
  total: number;
  /** Part du salaire pour ce seul crédit, puis pour toutes les mensualités ensemble (règle des 33 %). */
  partNouvelle: number;
  partTotale: number;
  etat: EtatPart;
  respecte33: boolean;
}
export function simuler(e: EntreeSimulation): Simulation {
  const financement = Math.max(0, e.prix - e.apport);
  const mensualiteCredit = Math.round(mensualite(financement, e.tauxMensuel, e.duree));
  const assurance = ASSURANCES[e.assurance].mensuel;
  const m = mensualiteCredit + assurance;
  const partTotale = partSalaire(m + e.mensualitesExistantes, e.salaire);
  return {
    financement, mensualiteCredit, assurance, mensualite: m,
    cout: mensualiteCredit * e.duree - financement, total: m * e.duree,
    partNouvelle: partSalaire(m, e.salaire), partTotale, etat: etatPart(partTotale), respecte33: partTotale <= PLAFOND_ENDETTEMENT + 1e-9
  };
}

/** Plus petit apport (au pas de 10 000) qui ramène toutes les mensualités sous 33 % ; null si même sans crédit rien n'y fait. */
export function apportNecessaire(e: Omit<EntreeSimulation, 'apport'>): number | null {
  const marge = Math.floor(e.salaire * PLAFOND_ENDETTEMENT) - e.mensualitesExistantes - ASSURANCES[e.assurance].mensuel;
  if (marge < 1) return null;
  const facteur = e.tauxMensuel === 0 ? e.duree : (1 - Math.pow(1 + e.tauxMensuel, -e.duree)) / e.tauxMensuel;
  let apport = Math.max(0, Math.ceil((e.prix - marge * facteur) / PAS_APPORT) * PAS_APPORT);
  for (let i = 0; i < 1000 && apport < e.prix; i++, apport += PAS_APPORT) if (simuler({ ...e, apport }).respecte33) return apport;
  return null;
}
/** Plus courte durée proposée qui respecte les 33 % avec cet apport (plus la durée est longue, plus la mensualité baisse). */
export function dureeSuffisante(e: Omit<EntreeSimulation, 'duree'>): number | null {
  return DUREES.find((d) => simuler({ ...e, duree: d }).respecte33) ?? null;
}

// ------------------------------------------------------------------ calendrier
const maj = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export interface Creneau { id: string; jour: Jour; heure: string; label: string; sous: string }
/** Trois créneaux de remise des clés : le premier samedi à 2 jours au moins, matin et après-midi, puis le lundi suivant. */
export function creneaux(aujourdhui: Jour): Creneau[] {
  let sam = ajouterJours(aujourdhui, 2);
  while (enDate(sam).getDay() !== 6) sam = ajouterJours(sam, 1);
  const lun = ajouterJours(sam, 2);
  const c = (jour: Jour, heure: string, sous: string): Creneau => ({ id: `${jour}-${heure}`, jour, heure, label: `${maj(jourSemaineLong(jour))} · ${heure}`, sous });
  return [c(sam, '10 h', 'Le plus tôt possible'), c(sam, '15 h', 'Après-midi'), c(lun, '9 h', 'Hors week-end')];
}
/** Premier prélèvement : le premier jour de paie au moins 20 jours après `jourReference` (signature ou livraison). */
export const premierPrelevement = (jourReference: Jour, jourPaie: number): Jour => prochainePaie(ajouterJours(jourReference, DELAI_PREMIER_PRELEVEMENT), jourPaie);
export const offreJusqua = (jourDecision: Jour): Jour => ajouterJours(jourDecision, OFFRE_JOURS);

// ------------------------------------------------------------------ dossier : étapes côté concessionnaire
export type Etape = 'nouvelle' | 'etude' | 'accordee' | 'livree' | 'refusee' | 'annulee';
export const COLONNES: Etape[] = ['nouvelle', 'etude', 'accordee', 'livree'];
export const NOM_COLONNE: Record<Etape, string> = { nouvelle: 'Nouvelles', etude: 'En étude', accordee: 'Accordées', livree: 'Livrées et payées', refusee: 'Refusées', annulee: 'Annulées' };
export interface DossierMin { etape: Etape; docs: boolean[]; signeLe: number | null }
export const PIECES = ["Pièce d'identité du client", 'Bulletins de salaire', "Attestation de l'employeur"];
export const piecesCompletes = (docs: boolean[]) => docs.length === PIECES.length && docs.every(Boolean);

/** Explique pourquoi le dossier ne peut pas aller à `vers` ; null si c'est permis. Une demande ne revient jamais en arrière ni ne saute d'étape. */
export function verifierTransition(d: DossierMin, vers: Etape): string | null {
  const i = COLONNES.indexOf(d.etape), j = COLONNES.indexOf(vers);
  if (i < 0) return d.etape === 'refusee' ? 'Cette demande est refusée.' : 'Cette demande est annulée.';
  if (j < 0) return 'Étape inconnue.';
  if (j === i) return null;
  if (j < i) return 'Une demande ne revient pas en arrière.';
  if (j > i + 1) return j === 3 ? "La demande doit d'abord être accordée." : "Passez d'abord le dossier en étude.";
  if (vers === 'accordee' && !piecesCompletes(d.docs)) return 'Il manque des pièces au dossier.';
  if (vers === 'livree' && !d.signeLe) return "Le client doit d'abord signer le contrat.";
  return null;
}
export const peutRefuser = (d: Pick<DossierMin, 'etape'>) => d.etape === 'nouvelle' || d.etape === 'etude';

// ------------------------------------------------------------------ suivi côté membre
export type StatutEtape = 'fait' | 'encours' | 'afaire';
export interface EtapeSuivi { id: 'contrat' | 'accord' | 'assurance' | 'preparation' | 'cles' | 'prelevement'; titre: string; sous: string; statut: StatutEtape }
export interface EntreeSuivi { signe: boolean; accorde: boolean; livre: boolean; rdv: string | null; mensualiteAPayer: number; premierPrelevement: string; payees: number }
export function etapesSuivi(e: EntreeSuivi): EtapeSuivi[] {
  const faits = [e.signe, e.accorde, e.signe && e.accorde, e.livre, e.livre, e.payees > 0];
  const base: Omit<EtapeSuivi, 'statut'>[] = [
    { id: 'contrat', titre: 'Contrat signé', sous: e.signe ? 'Signature horodatée, code AssureMe vérifié' : 'À signer avec votre code AssureMe' },
    { id: 'accord', titre: 'Accord du concessionnaire', sous: e.accorde ? 'Véhicule réservé à votre nom' : 'Le concessionnaire vérifie le dossier (48 h en moyenne)' },
    { id: 'assurance', titre: 'Assurance émise', sous: e.signe && e.accorde ? "Attestation dans l'app, valable dès la remise des clés" : 'Émise dès que le contrat est signé et le véhicule réservé' },
    { id: 'preparation', titre: 'Préparation et traceur GPS', sous: e.livre ? 'Véhicule prêt, traceur posé et testé' : 'Immatriculation, carte grise à votre nom, traceur posé et testé' },
    { id: 'cles', titre: 'Remise des clés', sous: e.livre ? 'Clés remises, le concessionnaire est payé par AssureMe' : e.rdv ? `Rendez-vous : ${e.rdv}` : 'Choisissez un créneau à la concession' },
    { id: 'prelevement', titre: 'Première mensualité', sous: `${e.premierPrelevement} · ${fcfa(e.mensualiteAPayer)} FCFA sur salaire` }
  ];
  const premier = faits.indexOf(false);
  return base.map((b, i) => ({ ...b, statut: faits[i] ? 'fait' : i === premier ? 'encours' : 'afaire' }));
}

// ------------------------------------------------------------------ statistiques du portail
export interface Vente { montant: number; livreLe: number | null; etape: Etape }
const cleMois = (ts: number) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };
/** Ventes financées et montant reçu dans le mois de `maintenant` : `base` regroupe les ventes déjà faites avant les dossiers listés. */
export function statistiquesVentes(dossiers: Vente[], base: { ventes: number; montant: number }, maintenant: number) {
  const livrees = dossiers.filter((d) => d.etape === 'livree' && d.livreLe != null && cleMois(d.livreLe) === cleMois(maintenant));
  return { ventes: base.ventes + livrees.length, montant: base.montant + livrees.reduce((s, d) => s + d.montant, 0) };
}
