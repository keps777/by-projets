// Actions du parcours logement : dossier, pièces, compte du bailleur (SMS simulé), décision, paiement de l'avance, équipement.
import { app, maintenant, mouvement, notifier, nouvelId } from '../../data/store.svelte.ts';
import { creerOtp, verifierOtp, type ResultatOtp } from '../../core/auth.ts';
import { jourDe, jourLong, ajouterMois, ecartJours, type Jour } from '../../core/dates.ts';
import { CODE_SMS_DEMO } from '../../data/constantes.ts';
import { fcfa } from '../../core/money.ts';
import {
  ARTICLES_EQUIPEMENT, DUREE_EQUIPEMENT, controlerEquipement, deciderAvance, estMobile, formaterNumero, libelleCompte, limitesAvance, mensualiteEquipement,
  numeroValide, premierePrelevement, prochainJourSemaine, prochainPremier, simuler, telephoneSmsValide, titulaireValide, totalEquipement, type TypeCompte
} from '../../core/avance-loyer.ts';
import type { PiecesBail } from '../../core/logement.ts';
import type { Decision } from '../../core/credit.ts';
import { lirePiece } from './fichier.ts';
import { entreeSimulation, logement, niveauActuel, type Bail, type CompteBailleur, type Dossier, type Piece, type Preuve } from './etat.ts';

const aujourdhui = (): Jour => jourDe(new Date(maintenant()));
export const MAX_PHOTOS = 6;

// ------------------------------------------------------------------ accès
/** Avance de loyer en cours de remboursement (bloque une nouvelle demande). */
export function avanceEnCours() {
  const b = logement().bail;
  return b?.avanceId ? app.credits.find((c) => c.id === b.avanceId && c.statut === 'actif') : undefined;
}
/** Pourquoi on ne peut pas (ou plus) demander d'avance ; null si c'est possible. */
export function blocage(): string | null {
  if (!app.compte) return 'Créez votre compte pour demander une avance de loyer.';
  if (!limitesAvance(niveauActuel()).disponible) return "L'avance de loyer s'ouvre au niveau Plus.";
  if (avanceEnCours()) return 'Une avance de loyer est déjà en cours de remboursement.';
  return null;
}
export function dossier(): Dossier {
  const l = logement();
  if (!l.dossier) {
    l.dossier = { statut: 'brouillon', logement: '', bailleur: '', entree: prochainPremier(aujourdhui()), bail: null, cni: null, photos: [], compte: null, decision: null, accordDemandeLe: null };
  }
  return l.dossier;
}
export const piecesDe = (d: Dossier | null): PiecesBail => ({ bail: !!d?.bail, cniBailleur: !!d?.cni, photos: (d?.photos.length ?? 0) > 0, compteBailleur: !!d?.compte?.verifie });
/** Date d'entrée : aujourd'hui ou dans les 6 mois à venir. */
export const entreeValide = (entree: Jour) => /^\d{4}-\d{2}-\d{2}$/.test(entree) && ecartJours(aujourdhui(), entree) >= 0 && ecartJours(aujourdhui(), entree) <= 183;
/** Ce qui manque avant de pouvoir envoyer le dossier (pièces et informations du bail). */
export function manques(d: Dossier | null): string[] {
  const m: string[] = [];
  if (!d?.logement.trim()) m.push('le nom du logement');
  if (!d || d.bailleur.trim().length < 3) m.push('le nom du bailleur');
  if (!d || !entreeValide(d.entree)) m.push("une date d'entrée dans les prochains mois");
  if (!d?.bail) m.push('le bail signé');
  if (!d?.cni) m.push('la CNI du bailleur');
  if (!d?.photos.length) m.push('les photos du logement');
  if (!d?.compte) m.push('le compte du bailleur');
  else if (!d.compte.verifie) m.push('la vérification du compte par SMS');
  return m;
}
/** Une modification du dossier annule une décision ou une demande d'accord déjà obtenue. */
function invalider(d: Dossier) { d.decision = null; if (d.statut === 'accord_attendu') { d.statut = 'brouillon'; d.accordDemandeLe = null; } }

// ------------------------------------------------------------------ pièces
export function majInfos(patch: Partial<Pick<Dossier, 'logement' | 'bailleur' | 'entree'>>) {
  const d = dossier();
  const change = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => d[k] !== patch[k]);
  if (!change) return;
  Object.assign(d, patch); invalider(d);
}
export async function ajouterPiece(cle: 'bail' | 'cni' | 'photos', fichier: File): Promise<string | null> {
  const d = dossier();
  if (cle === 'photos' && d.photos.length >= MAX_PHOTOS) return `${MAX_PHOTOS} photos au maximum.`;
  const r = await lirePiece(fichier);
  if ('erreur' in r) return r.erreur;
  if (cle === 'photos') d.photos.push(r.piece); else d[cle] = r.piece;
  invalider(d);
  return null;
}
export function retirerPiece(cle: 'bail' | 'cni' | 'photos', index = 0) {
  const d = dossier();
  if (cle === 'photos') d.photos.splice(index, 1); else d[cle] = null;
  invalider(d);
}

// ------------------------------------------------------------------ compte du bailleur
export interface SaisieCompte { type: TypeCompte; numero: string; telephone: string; titulaire: string }
export function erreursCompte(s: SaisieCompte): { numero?: string; telephone?: string; titulaire?: string } {
  const e: { numero?: string; telephone?: string; titulaire?: string } = {};
  if (!numeroValide(s.type, s.numero)) e.numero = estMobile(s.type) ? 'Entrez un numéro valide : 9 chiffres, qui commence par 6.' : 'Entrez un numéro de compte valide (10 chiffres au moins).';
  if (!estMobile(s.type) && !telephoneSmsValide(s.type, s.numero, s.telephone)) e.telephone = 'Entrez le téléphone du bailleur (9 chiffres) pour le SMS.';
  if (!titulaireValide(s.titulaire)) e.titulaire = 'Entrez le nom et le prénom du titulaire.';
  return e;
}
/** Enregistre le compte ; toute modification annule la vérification déjà faite. */
export function enregistrerCompte(s: SaisieCompte): boolean {
  if (Object.keys(erreursCompte(s)).length) return false;
  const d = dossier();
  const numero = formaterNumero(s.type, s.numero);
  const meme = d.compte && d.compte.type === s.type && d.compte.numero === numero && d.compte.titulaire.trim() === s.titulaire.trim();
  const c: CompteBailleur = { type: s.type, numero, telephone: estMobile(s.type) ? '' : s.telephone, titulaire: s.titulaire.trim(), verifie: !!(meme && d.compte?.verifie), otp: meme ? (d.compte?.otp ?? null) : null };
  d.compte = c;
  if (!c.verifie) invalider(d);
  return true;
}
/** SMS simulé : le code est envoyé au bailleur ; en démonstration il vaut toujours 123456. */
export async function envoyerSms(): Promise<boolean> {
  const c = dossier().compte; if (!c) return false;
  c.otp = await creerOtp(CODE_SMS_DEMO, maintenant());
  return true;
}
export async function verifierSms(code: string): Promise<ResultatOtp> {
  const c = dossier().compte; if (!c) return 'expire';
  const r = await verifierOtp(c.otp, code.trim(), maintenant());
  c.otp = r.otp;
  if (r.resultat === 'ok') { c.verifie = true; invalider(dossier()); }
  return r.resultat;
}

// ------------------------------------------------------------------ décision
function decision(d: Dossier): Decision {
  const l = logement();
  return deciderAvance({
    ...entreeSimulation(l.sim), score: app.score.valeur, employeurPartenaire: !!app.compte?.employeur,
    ancienneteAns: parseInt(app.compte?.anciennete ?? '0', 10) || 0, pieces: piecesDe(d), bailleur: d.bailleur, titulaire: d.compte?.titulaire ?? ''
  });
}
/** Étape « décision » : la règle des 33 % et les contrôles ; si tout est bon, la demande d'accord part au bailleur par SMS. */
export function envoyerPourDecision(): Decision | null {
  const d = dossier();
  if (blocage() || manques(d).length) return null;
  const dec = decision(d);
  d.decision = dec;
  if (dec.approuve) { d.statut = 'accord_attendu'; d.accordDemandeLe = maintenant(); }
  else { d.statut = 'brouillon'; d.accordDemandeLe = null; }
  return dec;
}
export function annulerDemande() { const d = logement().dossier; if (d) { d.statut = 'brouillon'; d.accordDemandeLe = null; } }
export function abandonnerDossier() { logement().dossier = null; }

// ------------------------------------------------------------------ paiement de l'avance
const reference = () => `AL-${jourDe(new Date(maintenant())).slice(2).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
/** Le bailleur a répondu OUI : l'avance lui est versée directement (jamais sur le compte du membre), le crédit « logement » démarre. */
export function accordBailleur(): { preuve: Preuve } | { refus: Decision } | null {
  const l = logement(); const d = l.dossier; const c = app.compte;
  if (!d || !c || d.statut !== 'accord_attendu' || !d.compte) return null;
  const dec = decision(d); d.decision = dec;
  if (!dec.approuve) { d.statut = 'brouillon'; d.accordDemandeLe = null; return { refus: dec }; }
  const sim = simuler(entreeSimulation(l.sim));
  const now = maintenant(); const auj = aujourdhui();
  const creditId = nouvelId('c-logement'); const prelev = premierePrelevement(auj, c.jourPaie);
  const compteLibelle = libelleCompte(d.compte.type, d.compte.numero);
  app.credits.push({ id: creditId, produit: 'logement', libelle: `Avance de loyer · ${d.logement.trim()}`, capital: sim.avance, mensualite: sim.remboursement, duree: l.sim.duree, payees: 0, prochaine: prelev, statut: 'actif' });
  // Deux mouvements qui s'annulent : l'argent est versé au bailleur sans transiter par le solde.
  mouvement({ titre: 'Avance de loyer accordée', sous: `Crédit logement · ${l.sim.duree} mois`, montant: sim.avance, ini: 'LO', categorie: 'logement', ts: now });
  mouvement({ titre: `Avance versée à ${d.bailleur.trim()}`, sous: `${l.sim.mois} mois d'avance · ${compteLibelle}`, montant: -sim.avance, ini: 'LO', categorie: 'logement', ts: now + 1 });
  const bail: Bail = {
    id: nouvelId('bail'), libelle: d.logement.trim(), bailleur: d.bailleur.trim(), loyer: l.sim.loyer, entree: d.entree, finBail: ajouterMois(d.entree, 36), assurance: 2_500,
    debut: d.entree, loyers: [], prelevement: true, prochaine: prelev, arrieres: 0, avanceId: creditId, compteLibelle, equipement: null
  };
  const preuve: Preuve = {
    id: nouvelId('pr'), ts: now, reference: reference(), montant: sim.avance, mois: l.sim.mois, loyer: l.sim.loyer, remboursement: sim.remboursement, duree: l.sim.duree,
    bailleur: bail.bailleur, compteLibelle, entree: d.entree, creditId, logement: bail.libelle, assurance: bail.assurance
  };
  l.preuves.unshift(preuve); l.bail = bail; l.dossier = null;
  notifier({ titre: 'Avance de loyer versée', sous: `${fcfa(sim.avance)} payés à ${bail.bailleur} · preuve ${preuve.reference}`, lien: `/logement/bailleur?recu=${preuve.id}` });
  notifier({ titre: 'Votre prélèvement logement', sous: `${fcfa(sim.prelevement)} par mois pendant ${l.sim.duree} mois à partir du ${jourLong(prelev)}`, lien: '/prelevement' });
  return { preuve };
}

// ------------------------------------------------------------------ équipement du logement
/** Commande d'équipement payée au magasin partenaire, remboursée sur 12 mois : un second crédit « logement », sous les 33 %. */
export function commanderEquipement(ids: string[]): { ok: true } | { ok: false; message: string } {
  const l = logement(); const b = l.bail; const c = app.compte;
  if (!b || !c) return { ok: false, message: "Aucun logement n'est enregistré." };
  if (b.equipement) return { ok: false, message: 'Une commande est déjà en cours pour ce logement.' };
  const choisis = ARTICLES_EQUIPEMENT.filter((a) => ids.includes(a.id));
  if (!choisis.length) return { ok: false, message: 'Choisissez un article.' };
  const e = entreeSimulation(l.sim); const prix = totalEquipement(ids); const taux = e.taux;
  const m = mensualiteEquipement(prix, taux);
  const chk = controlerEquipement({ salaire: e.salaire, mensualitesExistantes: e.mensualitesExistantes, loyerPreleve: b.prelevement ? b.loyer : 0, nouvelle: m });
  if (!chk.ok) return { ok: false, message: `Cette commande porterait vos prélèvements à ${chk.pct} % de votre salaire, au-dessus de 33 %. Retirez un article.` };
  const now = maintenant(); const creditId = nouvelId('c-equip');
  app.credits.push({ id: creditId, produit: 'logement', libelle: `Équipement · ${b.libelle}`, capital: prix, mensualite: m, duree: DUREE_EQUIPEMENT, payees: 0, prochaine: premierePrelevement(aujourdhui(), c.jourPaie), statut: 'actif' });
  mouvement({ titre: 'Équipement du logement accordé', sous: `Crédit logement · ${DUREE_EQUIPEMENT} mois`, montant: prix, ini: 'EQ', categorie: 'logement', ts: now });
  mouvement({ titre: 'Équipement payé au magasin partenaire', sous: choisis.map((a) => a.nom).join(', '), montant: -prix, ini: 'EQ', categorie: 'logement', ts: now + 1 });
  b.equipement = { ids, creditId, livraison: prochainJourSemaine(aujourdhui(), 4) };
  notifier({ titre: 'Équipement commandé', sous: `${choisis.length} article${choisis.length > 1 ? 's' : ''} · ${fcfa(m)} par mois pendant ${DUREE_EQUIPEMENT} mois`, lien: '/logement' });
  return { ok: true };
}

/** Modifie la simulation ; une décision déjà prise sur d'anciens chiffres est annulée. */
export function majSimulation(patch: Partial<{ loyer: number; mois: number; duree: number }>) {
  const l = logement();
  const avant = JSON.stringify(l.sim);
  Object.assign(l.sim, patch);
  if (l.dossier && JSON.stringify(l.sim) !== avant) invalider(l.dossier);
}
