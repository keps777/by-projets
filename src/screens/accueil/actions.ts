// Actions de l'accueil et des paiements : toutes les écritures sur le solde, les mouvements, les notifications et le score passent ici.
import { app, marquerLues, maintenant, mouvement, notifier, totalMensualites } from '../../data/store.svelte.ts';
import { prochaine } from '../../data/paie.ts';
import { COUVERTURES, etalerPart, repartirFacture, type Repartition } from '../../core/sante.ts';
import { controlerSolde, erreurRecharge, etalementAutorise, fraisRecharge, MOIS_ETALEMENT, pointsFacture, referencePaiement, reportPermis, SOURCES_RECHARGE, TAUX_ETALEMENT, type SourceId } from '../../core/paiement.ts';
import { fcfa } from '../../core/money.ts';
import { jourDe, type Jour } from '../../core/dates.ts';
import type { LigneAvecEffet } from '../../data/paie.ts';
import type { Recu } from '../../core/recu-paiement.ts';
import { factureParId, lirePaiements, paiements, toutesFactures, type Brouillon, type FacturePay } from './etat.ts';
import { sante, utilisation } from '../sante/etat.ts';
import { ajouterPoints } from '../score/actions.ts';

// ------------------------------------------------------------------ score
/** Ajoute `points` au score : une seule voie pour toutes les fonctionnalités (courbe, journal des événements, niveau), celle de l'écran Score. */
export function gagnerPoints(points: number, now = maintenant(), motif = 'Paiement à l’heure') {
  if (!points) return;
  ajouterPoints(motif, points, 'ponctualite', now);
}

// ------------------------------------------------------------------ recharge
export type ResultatRecharge = { ok: true; frais: number } | { ok: false; erreur: string };
export function recharger(montant: number | null, source: SourceId, now = maintenant()): ResultatRecharge {
  const erreur = erreurRecharge(montant);
  if (erreur || montant == null) return { ok: false, erreur: erreur ?? 'Montant invalide.' };
  const s = SOURCES_RECHARGE.find((x) => x.id === source) ?? SOURCES_RECHARGE[0];
  const frais = fraisRecharge(montant, s.frais);
  mouvement({ titre: `Recharge ${s.nom}`, sous: frais ? `Recharge · frais ${fcfa(frais)}` : 'Recharge', montant, ini: s.ini, categorie: 'recharge', ts: now });
  return { ok: true, frais };
}

// ------------------------------------------------------------------ notifications
export const marquerLue = (id: string) => { const n = app.notifications.find((x) => x.id === id); if (n) n.lu = true; };
export const toutMarquerLu = () => app.notifications.forEach((n) => (n.lu = true));

// ------------------------------------------------------------------ factures
export const tauxPriseEnCharge = () => COUVERTURES[app.compte?.pass ?? 'famille'].taux;
export const plafondSanteTotal = () => COUVERTURES[app.compte?.pass ?? 'famille'].plafond;
/** Plafond santé restant : le plus bas de nos comptes et de celui de l'écran Santé (qui compte aussi les factures émises par les cliniques). */
export const plafondSanteRestant = () => Math.max(0, Math.min(plafondSanteTotal() - lirePaiements().plafondSanteUtilise, utilisation().restant));
/** Répartition tiers payant d'une facture (80 % AssureMe dans la limite du plafond restant). Hors santé : tout à la charge du membre. */
export function repartitionFacture(f: FacturePay): Repartition {
  if (f.repartition) return f.repartition; // facture de la clinique : répartie à son émission
  return repartirFacture(f.lignes, f.categorie === 'sante' ? tauxPriseEnCharge() : 0, plafondSanteRestant());
}
export function mensualiteEtalement(f: FacturePay) { return etalerPart(repartitionFacture(f).patient, MOIS_ETALEMENT, TAUX_ETALEMENT); }

export function preparerFacture(f: FacturePay, mode: 'comptant' | 'etale') {
  const rep = repartitionFacture(f);
  paiements().enCours = { type: 'facture', factureId: f.id, code: f.code, partenaire: f.partenaire, ini: f.ini, categorie: f.categorie, lieu: f.lieu, montant: rep.patient, mode };
}
export function preparerPaiementLibre(p: { code: string; nom: string; ini: string; lieu: string; categorie: string }, montant: number) {
  paiements().enCours = { type: 'libre', code: p.code, partenaire: p.nom, ini: p.ini, categorie: p.categorie, lieu: p.lieu, montant, mode: 'libre' };
}
export function preparerEnvoi(contact: string, ini: string, montant: number) {
  paiements().enCours = { type: 'envoi', partenaire: contact, ini, categorie: 'envoi', lieu: '', montant, mode: 'envoi', contact };
}

export type RefusPaiement = 'aucun' | 'deja' | 'solde' | 'trente_trois' | 'montant';
export type ResultatPaiement = { ok: true; recu: Recu } | { ok: false; raison: RefusPaiement; message: string; manque?: number };
const refus = (raison: RefusPaiement, message: string, manque?: number): ResultatPaiement => ({ ok: false, raison, message, manque });

/** Exécute le paiement préparé (après confirmation par code ou biométrie). Ne modifie rien en cas de refus. */
export function executerPaiement(now = maintenant()): ResultatPaiement {
  const t = paiements(); const b = t.enCours;
  if (!b) return refus('aucun', 'Aucun paiement en cours.');
  const aujourdhui = jourDe(new Date(now));
  const ref = referencePaiement();
  const base = { ref, ts: now, partenaire: b.partenaire, ini: b.ini, lieu: b.lieu, categorie: b.categorie, note: 0 };

  if (b.type === 'facture') {
    const f = factureParId(b.factureId ?? null);
    if (!f || f.statut !== 'a_payer') return refus('deja', 'Cette facture est déjà réglée.');
    const rep = repartitionFacture(f);
    const etale = b.mode === 'etale';
    const mensualite = etale ? mensualiteEtalement(f) : 0;
    if (etale) {
      const c = app.compte;
      if (!c || !etalementAutorise(totalMensualites(), mensualite, c.salaireNet)) return refus('trente_trois', 'Cet étalement porterait vos mensualités au-delà de 33 % de votre salaire net.');
    } else {
      const ctl = controlerSolde(app.solde, rep.patient);
      if (!ctl.ok) return refus('solde', `Il vous manque ${fcfa(ctl.manque)} FCFA.`, ctl.manque);
    }
    if (rep.patient <= 0 && !etale) return refus('montant', 'Rien à payer sur cette facture.');
    const points = etale ? 0 : pointsFacture(f.echeance, aujourdhui);
    if (!etale) mouvement({ titre: f.partenaire, sous: f.categorie === 'sante' ? 'Santé' : 'Facture', montant: -rep.patient, ini: f.ini, categorie: f.categorie, ts: now });
    else {
      const prochainePaie: Jour = prochaine(now) ?? aujourdhui;
      app.credits.push({ id: `c-pay-${ref}`, produit: 'sante', libelle: `Soins · ${f.partenaire}`, capital: rep.patient, mensualite, duree: MOIS_ETALEMENT, payees: 0, prochaine: prochainePaie, statut: 'actif' });
    }
    if (f.categorie === 'sante') t.plafondSanteUtilise += rep.assureMe;
    gagnerPoints(points, now, `Facture ${f.partenaire} payée à l’heure`);
    if (f.origine === 'sante') {
      // La facture vit dans la tranche santé : on la marque réglée là-bas aussi (sinon l'écran Santé la proposerait encore).
      const fs = sante().factures.find((x) => x.id === f.id);
      if (fs) { fs.statut = etale ? 'etalee' : 'payee'; fs.paiement = { ts: now, mode: etale ? 'etale' : 'comptant', aTemps: aujourdhui <= f.echeance, ...(etale ? { mensualite, mois: MOIS_ETALEMENT, creditId: `c-pay-${ref}` } : {}) }; }
    } else if (t.factures.some((x) => x.id === f.id)) { const mienne = t.factures.find((x) => x.id === f.id)!; mienne.statut = etale ? 'etalee' : 'payee'; mienne.ref = ref; }
    else t.factures.unshift({ ...f, statut: etale ? 'etalee' : 'payee', ref });
    const recu: Recu = {
      ...base, beneficiaire: f.beneficiaire, lignes: f.lignes.map((l) => ({ nom: l.nom, montant: l.montant })), total: rep.total, priseEnCharge: rep.assureMe, paye: rep.patient,
      mode: etale ? 'etale' : 'comptant', mois: etale ? MOIS_ETALEMENT : undefined, mensualite: etale ? mensualite : undefined,
      soldeApres: app.solde, points, scoreApres: app.score.valeur, plafondRestant: f.categorie === 'sante' ? plafondSanteRestant() : undefined, plafondTotal: f.categorie === 'sante' ? plafondSanteTotal() : undefined, factureId: f.id
    };
    t.recus.unshift(recu); t.enCours = null;
    marquerLues((l) => l === `/pay/facture?id=${f.id}` || l === `/sante/facture/${f.id}`);
    notifier({
      titre: etale ? `${f.partenaire} réglée, étalée sur ${MOIS_ETALEMENT} mois` : `Facture ${f.partenaire} payée`,
      sous: etale ? `${fcfa(mensualite)} par mois sur salaire.` : `${fcfa(rep.patient)} débités${points ? ` · +${points} pts AssureScore` : ''}.`, lien: `/pay/recu?ref=${ref}`, ts: now
    });
    return { ok: true, recu };
  }

  // paiement libre chez un partenaire ou envoi à un proche : toujours depuis le solde
  if (!(b.montant > 0)) return refus('montant', 'Montant invalide.');
  const ctl = controlerSolde(app.solde, b.montant);
  if (!ctl.ok) return refus('solde', `Il vous manque ${fcfa(ctl.manque)} FCFA.`, ctl.manque);
  const envoi = b.type === 'envoi';
  mouvement({ titre: envoi ? `Envoi à ${b.partenaire}` : b.partenaire, sous: envoi ? 'Entre membres' : b.categorie === 'sante' ? 'Santé' : 'Paiement', montant: -b.montant, ini: b.ini, categorie: envoi ? 'envoi' : b.categorie, ts: now });
  const recu: Recu = {
    ...base, lignes: [{ nom: envoi ? `Envoi à ${b.partenaire}` : 'Paiement au partenaire', montant: b.montant }], total: b.montant, priseEnCharge: 0, paye: b.montant,
    mode: envoi ? 'envoi' : 'libre', soldeApres: app.solde, points: 0, scoreApres: app.score.valeur
  };
  t.recus.unshift(recu); t.enCours = null;
  notifier({ titre: envoi ? `${fcfa(b.montant)} envoyés à ${b.partenaire}` : `Paiement ${b.partenaire}`, sous: `${fcfa(b.montant)} débités de votre solde.`, lien: `/pay/recu?ref=${ref}`, ts: now });
  return { ok: true, recu };
}
export const recuParRef = (ref: string | null) => (ref ? lirePaiements().recus.find((r) => r.ref === ref) : undefined);
export const dernierRecu = () => lirePaiements().recus[0];
export function noterRecu(ref: string, note: number) { const r = recuParRef(ref); if (r) r.note = note; }
export { toutesFactures };

// ------------------------------------------------------------------ report d'un prélèvement
export function peutReporterLigne(l: LigneAvecEffet, paie: Jour): boolean {
  return !!l.reporter && !l.reporte && reportPermis(lirePaiements().reports[l.id], paie);
}
/** Reporte d'un mois (sans frais) un prélèvement de la prochaine paie : une fois par an et par prélèvement. */
export function reporterLigne(l: LigneAvecEffet, paie: Jour): boolean {
  if (!peutReporterLigne(l, paie)) return false;
  l.reporter!();
  paiements().reports[l.id] = paie;
  notifier({ titre: `${l.libelle} reportée d'un mois`, sous: 'Sans frais ni pénalité, votre score ne bouge pas.', lien: '/prelevement' });
  return true;
}
export type { Brouillon };
