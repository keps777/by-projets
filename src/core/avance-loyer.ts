// Avance de loyer : limites par niveau, simulation, décision (règle des 33 %), compte du bailleur, calendrier des loyers.
// Fonctions pures, complétant `logement.ts` (qui garde les formules de base).
import { PLAFOND_ENDETTEMENT, PLAFONDS, SEUILS_NIVEAU, decider, etatPart, mensualite, partSalaire, type Controle, type Decision, type EtatPart, type Niveau } from './credit.ts';
import { chiffresTel, formaterTel } from './auth.ts';
import { LOYER_MAX, avance, compteBailleurValide, dossierComplet, prelevementLogement, remboursementAvance, type PiecesBail } from './logement.ts';
import { ajouterJours, ajouterMois, enDate, jourDe, type Jour } from './dates.ts';
import { fcfa } from './money.ts';

export const DUREES_REMBOURSEMENT = [6, 10, 12] as const;
export const MOIS_PROPOSES = [2, 3, 6, 12] as const;
export const LOYERS_PROPOSES = [50_000, 80_000, 120_000, 150_000, 300_000] as const;
export const NOM_NIVEAU: Record<Niveau, string> = { START: 'Start', PLUS: 'Plus', PRO: 'Pro', ELITE: 'Elite' };

// ------------------------------------------------------------------ limites par niveau
export interface LimitesAvance { disponible: boolean; loyerMax: number; moisMax: number }
export function limitesAvance(niveau: Niveau): LimitesAvance {
  const moisMax = PLAFONDS[niveau].avanceLoyerMois;
  return { disponible: moisMax > 0 && LOYER_MAX[niveau] > 0, loyerMax: LOYER_MAX[niveau], moisMax };
}
/** Plus petit niveau qui offre au moins ce loyer / ce nombre de mois d'avance (null : aucun). */
export function niveauRequis(loyer: number, mois: number): Niveau | null {
  return (['PLUS', 'PRO', 'ELITE'] as Niveau[]).find((n) => LOYER_MAX[n] >= loyer && PLAFONDS[n].avanceLoyerMois >= mois) ?? null;
}

// ------------------------------------------------------------------ simulation
export interface EntreeSimulation {
  loyer: number; mois: number; duree: number; taux: number; salaire: number; mensualitesExistantes: number; niveau: Niveau;
}
export interface Simulation {
  avance: number; remboursement: number; prelevement: number;
  /** Part du salaire net prélevée (loyer + remboursement + crédits en cours), de 0 à 1. */
  part: number; pct: number; etat: EtatPart; depasse: boolean;
  /** Intérêts payés en plus de l'avance. */
  cout: number;
  /** Part du salaire une fois l'avance remboursée (loyer + crédits en cours). */
  partApres: number;
  erreurs: string[];
  /** Simulation acceptable : aucune erreur de limite et sous les 33 %. */
  ok: boolean;
}
export function simuler(e: EntreeSimulation): Simulation {
  const lim = limitesAvance(e.niveau);
  const erreurs: string[] = [];
  if (!lim.disponible) erreurs.push("L'avance de loyer s'ouvre au niveau Plus.");
  else {
    if (!(e.loyer > 0)) erreurs.push('Indiquez le loyer mensuel.');
    else if (e.loyer > lim.loyerMax) erreurs.push(`Le loyer dépasse le maximum de ${fcfa(lim.loyerMax)} à votre niveau.`);
    if (!Number.isInteger(e.mois) || e.mois < 1) erreurs.push("Indiquez le nombre de mois d'avance.");
    else if (e.mois > lim.moisMax) erreurs.push(`Votre niveau finance ${lim.moisMax} mois d'avance au plus.`);
  }
  if (!Number.isInteger(e.duree) || e.duree < 1) erreurs.push('Choisissez une durée de remboursement.');
  const valide = erreurs.length === 0;
  const av = valide ? avance(e.loyer, e.mois) : 0;
  const remb = valide ? remboursementAvance(e.loyer, e.mois, e.duree, e.taux) : 0;
  const prel = valide ? prelevementLogement(e.loyer, remb) : 0;
  const part = valide ? partSalaire(prel + e.mensualitesExistantes, e.salaire) : 0;
  const depasse = valide && part > PLAFOND_ENDETTEMENT + 1e-9;
  return {
    avance: av, remboursement: remb, prelevement: prel, part, pct: Math.round(part * 100), etat: etatPart(part), depasse,
    cout: valide ? remb * e.duree - av : 0,
    partApres: valide ? partSalaire(e.loyer + e.mensualitesExistantes, e.salaire) : 0,
    erreurs, ok: valide && !depasse
  };
}

export interface Suggestion { type: 'duree' | 'mois'; valeur: number; texte: string }
/** Quand la simulation dépasse 33 % : le plus petit changement qui la ramène sous le plafond (durée plus longue, sinon moins de mois d'avance). */
export function suggerer(e: EntreeSimulation): Suggestion | null {
  const base = simuler(e);
  if (!base.depasse) return null;
  for (const d of DUREES_REMBOURSEMENT) {
    if (d > e.duree && simuler({ ...e, duree: d }).ok) return { type: 'duree', valeur: d, texte: `Allongez le remboursement à ${d} mois.` };
  }
  const dmax = Math.max(e.duree, ...DUREES_REMBOURSEMENT);
  for (let m = e.mois - 1; m >= 1; m--) {
    if (simuler({ ...e, mois: m, duree: dmax }).ok) {
      const d = simuler({ ...e, mois: m }).ok ? e.duree : dmax;
      return { type: 'mois', valeur: m, texte: `Réduisez l'avance à ${m} mois${d !== e.duree ? ` et remboursez sur ${d} mois` : ''}.` };
    }
  }
  return null;
}

// ------------------------------------------------------------------ compte du bailleur
export type TypeCompte = 'orange' | 'mtn' | 'banque';
export const TYPES_COMPTE: TypeCompte[] = ['orange', 'mtn', 'banque'];
export const NOM_COMPTE: Record<TypeCompte, string> = { orange: 'Orange Money', mtn: 'MTN MoMo', banque: 'Banque' };
export const estMobile = (t: TypeCompte) => t !== 'banque';
export const numeroValide = (t: TypeCompte, saisie: string) => compteBailleurValide(t, saisie);
/** Saisie progressive : mobile « 6 90 12 34 56 » ; banque « CM21 0000 … » en groupes de 4. */
export function formaterNumero(t: TypeCompte, saisie: string): string {
  if (estMobile(t)) return formaterTel(saisie);
  const brut = saisie.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 27);
  return (brut.match(/.{1,4}/g) ?? []).join(' ');
}
export const quatreDerniers = (saisie: string) => saisie.replace(/\D/g, '').slice(-4);
/** « Orange Money ···· 0937 » */
export const libelleCompte = (t: TypeCompte, saisie: string) => `${NOM_COMPTE[t]} ···· ${quatreDerniers(saisie)}`;
/** Téléphone du bailleur à qui envoyer le SMS : le numéro du compte mobile, sinon celui saisi à part. */
export const telephoneSms = (t: TypeCompte, numero: string, telephone: string) => chiffresTel(estMobile(t) ? numero : telephone);
export const telephoneSmsValide = (t: TypeCompte, numero: string, telephone: string) => /^[62]\d{8}$/.test(telephoneSms(t, numero, telephone));

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mots = (s: string) => sansAccent(s).replace(/\b(m|mr|mme|mlle|monsieur|madame|dr)\b\.?/g, ' ').split(/[^a-z]+/).filter((x) => x.length > 1).sort();
export const titulaireValide = (s: string) => mots(s).length >= 2;
/** Le titulaire du compte est bien le bailleur (ordre des noms et accents indifférents ; « J.-P. » ne compte que par ses initiales). */
export function titulaireCoherent(bailleur: string, titulaire: string): boolean {
  const a = mots(bailleur), b = mots(titulaire);
  if (!a.length || !b.length) return false;
  const [petit, grand] = a.length <= b.length ? [a, b] : [b, a];
  return petit.every((m) => grand.includes(m));
}

// ------------------------------------------------------------------ décision
export interface EntreeDecisionAvance extends EntreeSimulation {
  score: number; employeurPartenaire: boolean; ancienneteAns: number;
  pieces: PiecesBail; bailleur: string; titulaire: string;
}
/** Règles du crédit : score ≥ 600, niveau, mensualités totales ≤ 33 % du net, employeur partenaire, dossier complet et compte vérifié. */
export function deciderAvance(e: EntreeDecisionAvance): Decision {
  const sim = simuler(e);
  const base = decider({
    score: e.score, seuilScore: SEUILS_NIVEAU.PLUS, salaire: e.salaire, mensualiteNouvelle: sim.prelevement, mensualitesExistantes: e.mensualitesExistantes,
    employeurPartenaire: e.employeurPartenaire, ancienneteAns: e.ancienneteAns, contratStable: true,
    vehiculeControle: true, prix: sim.avance, financement: sim.avance
  });
  const [score, part, employeur] = ['score', 'part', 'employeur'].map((id) => base.controles.find((c) => c.id === id) as Controle);
  const lim = limitesAvance(e.niveau);
  const niveauOk = sim.erreurs.length === 0;
  const niveau: Controle = {
    id: 'niveau', ok: niveauOk, tag: `NIVEAU ${NOM_NIVEAU[e.niveau].toUpperCase()}`,
    titre: niveauOk ? `${fcfa(e.loyer)} de loyer, ${e.mois} mois d'avance : dans votre niveau` : 'Demande au-dessus de votre niveau',
    detail: niveauOk ? `Votre niveau ${NOM_NIVEAU[e.niveau]} finance jusqu'à ${lim.moisMax} mois d'avance pour un loyer de ${fcfa(lim.loyerMax)} au plus.` : sim.erreurs[0]
  };
  const partCtl: Controle = {
    ...part, ok: niveauOk ? !sim.depasse : part.ok,
    titre: `Prélèvements ${sim.pct} % du salaire`,
    detail: `Loyer ${fcfa(e.loyer)} + remboursement ${fcfa(sim.remboursement)} + ${fcfa(e.mensualitesExistantes)} de crédits en cours = ${fcfa(sim.prelevement + e.mensualitesExistantes)} sur ${fcfa(e.salaire)} de salaire net, plafond de 33 %.`
  };
  const incoherent = !titulaireCoherent(e.bailleur, e.titulaire);
  const manque = 4 - Object.values(e.pieces).filter(Boolean).length;
  const dossierOk = dossierComplet(e.pieces) && !incoherent;
  const dossier: Controle = {
    id: 'dossier', ok: dossierOk, tag: dossierOk ? 'DOSSIER COMPLET' : 'DOSSIER À COMPLÉTER',
    titre: dossierOk ? 'Bail, CNI, photos et compte du bailleur vérifiés' : manque > 0 ? `Il manque ${manque} pièce${manque > 1 ? 's' : ''} au dossier` : 'Le titulaire du compte n’est pas le bailleur',
    detail: dossierOk ? 'Le compte du bailleur a été vérifié par SMS et son titulaire correspond au nom du bailleur.' : manque > 0 ? 'Complétez les pièces demandées avant la décision.' : `Le compte est au nom de ${e.titulaire}, le bailleur du bail est ${e.bailleur}.`
  };
  const controles = [{ ...score }, niveau, partCtl, { ...employeur }, dossier];
  const ko = controles.find((c) => !c.ok);
  return { approuve: !ko, controles, motif: ko ? ko.titre : null };
}

// ------------------------------------------------------------------ calendrier des loyers
/** « 2026-11 » */
export const moisCle = (j: Jour) => j.slice(0, 7);
export const premierDuMois = (j: Jour): Jour => `${j.slice(0, 8)}01`;
/** Premier du mois suivant : prochaine date où le bailleur reçoit son loyer. */
export const prochainPremier = (aujourdhui: Jour): Jour => ajouterMois(premierDuMois(aujourdhui), 1);
/** Première paie strictement après aujourd'hui (la paie du jour est déjà passée au démarrage de l'appli). */
export function premierePrelevement(aujourdhui: Jour, jourPaie: number): Jour {
  const d = enDate(ajouterJours(aujourdhui, 1));
  const quantieme = Math.min(jourPaie, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  const ce = jourDe(new Date(d.getFullYear(), d.getMonth(), quantieme, 12));
  return ce >= jourDe(d) ? ce : ajouterMois(ce, 1, jourPaie);
}
export type StatutMois = 'paye' | 'garanti' | 'prevu' | 'avenir' | 'passe';
export interface LoyerSuivi { mois: string; montant: number; statut: 'paye' | 'garanti' }
/** Fenêtre de 12 mois : depuis le début du suivi, mais sans remonter à plus de 5 mois avant aujourd'hui. */
export function fenetreMois(debut: Jour, aujourdhui: Jour, n = 12): string[] {
  const plancher = ajouterMois(premierDuMois(aujourdhui), -5);
  const d = premierDuMois(debut);
  const depart = d > plancher ? d : plancher;
  const fin = ajouterMois(premierDuMois(aujourdhui), 1);
  const bornee = depart > fin ? fin : depart;
  return Array.from({ length: n }, (_, i) => moisCle(ajouterMois(bornee, i)));
}
export function statutMois(cle: string, aujourdhui: Jour, loyers: LoyerSuivi[]): StatutMois {
  const l = loyers.find((x) => x.mois === cle);
  if (l) return l.statut;
  const prochain = moisCle(prochainPremier(aujourdhui));
  return cle === prochain ? 'prevu' : cle < prochain ? 'passe' : 'avenir';
}
/** Loyers payés à l'heure (ceux que le bailleur a reçus sans que le prélèvement soit reporté). */
export const loyersALHeure = (loyers: LoyerSuivi[]) => loyers.filter((l) => l.statut === 'paye').length;
/** Prochain jour de semaine (0 dimanche … 6 samedi) au moins `delai` jours après `depuis`. */
export function prochainJourSemaine(depuis: Jour, jourSemaine: number, delai = 2): Jour {
  let j = ajouterJours(depuis, delai);
  for (let i = 0; i < 7 && enDate(j).getDay() !== jourSemaine; i++) j = ajouterJours(j, 1);
  return j;
}

// ------------------------------------------------------------------ équipement du logement
export interface ArticleEquipement { id: string; nom: string; prix: number }
export const ARTICLES_EQUIPEMENT: ArticleEquipement[] = [
  { id: 'frigo', nom: 'Réfrigérateur 250 L', prix: 185_000 },
  { id: 'matelas', nom: 'Matelas 2 places', prix: 90_000 },
  { id: 'solaire', nom: 'Kit solaire maison', prix: 350_000 }
];
export const DUREE_EQUIPEMENT = 12;
export const totalEquipement = (ids: string[]) => ARTICLES_EQUIPEMENT.filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.prix, 0);
export const mensualiteEquipement = (prix: number, taux: number) => Math.round(mensualite(prix, taux, DUREE_EQUIPEMENT));

/** Un équipement (crédit de 12 mois) tient-il sous les 33 % ? Le loyer ne compte que s'il est prélevé sur la paie. */
export function controlerEquipement(e: { salaire: number; mensualitesExistantes: number; loyerPreleve: number; nouvelle: number }) {
  const part = partSalaire(e.mensualitesExistantes + e.loyerPreleve + e.nouvelle, e.salaire);
  return { part, pct: Math.round(part * 100), ok: part <= PLAFOND_ENDETTEMENT + 1e-9 };
}
