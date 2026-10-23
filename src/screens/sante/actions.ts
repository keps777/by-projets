// Actions de la santé : toutes passent par ces fonctions (jamais de logique d'argent dans un composant).
import { ajouterMois, jourDe, prochainePaie, jourLong } from '../../core/dates.ts';
import { fcfa } from '../../core/money.ts';
import { POINTS, borner } from '../../core/score.ts';
import { COUVERTURES } from '../../core/sante.ts';
import { estCeMembre, verifierCode } from '../../core/sante-carte.ts';
import { evaluerEtalement, type Etalement } from '../../core/sante-etalement.ts';
import { echeanceDefaut, erreursLignes, repartirActes, statutOrdonnance, type LigneActe } from '../../core/sante-facture.ts';
import { app, maintenant, mouvement, nouvelId, notifier, totalMensualites } from '../../data/store.svelte.ts';
import { CLINIQUE, aujourdhui, beneficiaires, couvertureDe, nomComplet, numeroFacture, sante, teleconsultationsUtilisees, utilisation, type FactureSante, type Ordonnance } from './etat.ts';

export type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
const echec = (erreur: string): { ok: false; erreur: string } => ({ ok: false, erreur });
const initiales = (nom: string) => nom.split(/\s+/).filter((m) => /^[A-Za-zÀ-ÿ]/.test(m)).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || 'SA';
export const FRAIS_LIVRAISON = 1000;
export const TARIF_TELECONSULTATION = 2000;

// ------------------------------------------------------------------ bénéficiaires
export function ajouterBeneficiaire(prenom: string): Resultat {
  const nom = prenom.trim().replace(/\s+/g, ' ');
  const c = couvertureDe(); if (!c || !app.compte) return echec('Aucun compte connecté.');
  if (nom.length < 2) return echec('Indiquez le prénom du bénéficiaire.');
  if (beneficiaires().some((b) => b.toLowerCase() === nom.toLowerCase())) return echec(`${nom} est déjà couvert.`);
  if (beneficiaires().length >= c.personnes) return echec(`Votre Pass couvre ${c.personnes} personne${c.personnes > 1 ? 's' : ''} au maximum.`);
  sante().beneficiaires.push(nom); return { ok: true };
}
export function retirerBeneficiaire(prenom: string) { const e = sante(); e.beneficiaires = e.beneficiaires.filter((b) => b !== prenom); }

// ------------------------------------------------------------------ portail : identifier le patient et émettre la facture
export type Droits = { ok: true; numeroMembre: string; titulaire: string; pass: string; beneficiaires: string[]; taux: number; pharmacie: number; restant: number; plafond: number; validiteJusqua: string } | { ok: false; erreur: string };
/** Vérifie le numéro (ou téléphone) et le code à 6 chiffres de la carte, puis lit les droits du membre. */
export function verifierPatient(saisieMembre: string, saisieCode: string, now = maintenant()): Droits {
  const c = app.compte;
  if (!c) return echec('Aucun membre AssureMe sur cet appareil (compte démo ou compte réel à créer).');
  if (!estCeMembre(saisieMembre, c.numeroMembre, c.telephone)) return echec('Aucun membre trouvé. Vérifiez le numéro ou le téléphone.');
  const v = verifierCode(c.numeroMembre, saisieCode, now); if (!v.ok) return echec(v.raison);
  const cov = COUVERTURES[c.pass], u = utilisation(c.numeroMembre, now);
  const paie = prochainePaie(jourDe(new Date(now)), c.jourPaie);
  return { ok: true, numeroMembre: c.numeroMembre, titulaire: nomComplet(c.prenom), pass: c.pass, beneficiaires: beneficiaires(), taux: cov.taux, pharmacie: cov.pharmacie, restant: u.restant, plafond: u.plafond, validiteJusqua: ajouterMois(paie, 1) };
}
export interface Saisie { beneficiaire: string; medecin: string; acte: string; lignes: LigneActe[] }
function controle(s: Saisie): string | null {
  const c = couvertureDe(); if (!c || !app.compte) return 'Aucun membre identifié.';
  if (!beneficiaires().includes(s.beneficiaire)) return 'Choisissez le patient parmi les bénéficiaires de la carte.';
  if (!s.acte.trim()) return "Indiquez l'acte principal (ex. Consultation pédiatrie).";
  return erreursLignes(s.lignes)[0] ?? null;
}
/** Émet une facture (statut « à régler » : AssureMe paie la clinique, le patient règle sa part) ou la garde en brouillon. */
export function emettreFacture(s: Saisie, brouillon = false): Resultat<{ facture: FactureSante }> {
  const err = controle(s); if (err) return echec(err);
  const e = sante(), c = couvertureDe()!, compte = app.compte!, date = aujourdhui();
  const r = repartirActes(s.lignes, c, utilisation(compte.numeroMembre).restant);
  const f: FactureSante = {
    id: nouvelId('f'), numero: numeroFacture(e.sequence, date), source: 'clinique', etablissementId: CLINIQUE.id, etablissement: CLINIQUE.nom,
    numeroMembre: compte.numeroMembre, patient: nomComplet(s.beneficiaire), medecin: s.medecin.trim(), acte: s.acte.trim(), date, echeance: echeanceDefaut(date),
    lignes: s.lignes.map((l) => ({ ...l, nom: l.nom.trim(), sous: l.sous.trim() })), total: r.total, assureMe: r.assureMe, partPatient: r.patient, plafondDepasse: r.plafondDepasse,
    statut: brouillon ? 'brouillon' : 'a_regler'
  };
  e.sequence++; e.factures.push(f);
  if (!brouillon) annoncer(f);
  return { ok: true, facture: f };
}
function annoncer(f: FactureSante) {
  notifier({ titre: `Facture ${f.etablissement} à régler`, sous: `${fcfa(f.partPatient)} à payer avant le ${jourLong(f.echeance)}`, lien: `/sante/facture/${f.id}` });
}
/** Valide un brouillon : la répartition est recalculée avec le plafond du jour. */
export function validerBrouillon(id: string): Resultat<{ facture: FactureSante }> {
  const f = sante().factures.find((x) => x.id === id && x.statut === 'brouillon'), c = couvertureDe();
  if (!f || !c) return echec('Brouillon introuvable.');
  const r = repartirActes(f.lignes, c, utilisation(f.numeroMembre).restant);
  Object.assign(f, { total: r.total, assureMe: r.assureMe, partPatient: r.patient, plafondDepasse: r.plafondDepasse, statut: 'a_regler', date: aujourdhui(), echeance: echeanceDefaut(aujourdhui()) });
  annoncer(f); return { ok: true, facture: f };
}
export function supprimerBrouillon(id: string) { const e = sante(); e.factures = e.factures.filter((f) => !(f.id === id && f.statut === 'brouillon')); }

// ------------------------------------------------------------------ membre : régler sa part
const trouver = (id: string) => sante().factures.find((f) => f.id === id && f.numeroMembre === app.compte?.numeroMembre && f.statut === 'a_regler');
function pointsPaiement(f: FactureSante): boolean {
  const aTemps = aujourdhui() <= f.echeance;
  if (aTemps) app.score.valeur = borner(app.score.valeur + POINTS.paiementFacture);
  return aTemps;
}
export function payerFacture(id: string): Resultat<{ facture: FactureSante }> {
  const f = trouver(id); if (!f) return echec("Cette facture n'est plus à régler.");
  if (app.solde < f.partPatient) return echec(`Solde insuffisant : il vous manque ${fcfa(f.partPatient - app.solde)} FCFA. Rechargez ou étalez votre part.`);
  mouvement({ titre: f.etablissement, sous: `Santé · facture ${f.numero}`, montant: -f.partPatient, ini: initiales(f.etablissement), categorie: 'sante' });
  f.paiement = { ts: maintenant(), mode: 'comptant', aTemps: pointsPaiement(f) }; f.statut = 'payee';
  notifier({ titre: 'Facture santé réglée', sous: `${fcfa(f.partPatient)} FCFA à ${f.etablissement}, reçu disponible`, lien: `/sante/facture/${f.id}` });
  return { ok: true, facture: f };
}
/** Simulation de l'étalement de la part (sans rien modifier). */
export function simulerEtalement(f: FactureSante): Etalement | null {
  const c = app.compte; if (!c) return null;
  return evaluerEtalement({ part: f.partPatient, pass: c.pass, score: app.score.valeur, salaire: c.salaireNet, mensualitesExistantes: totalMensualites(), employeur: c.employeur, anciennete: c.anciennete });
}
/** Étale la part sur 3 mois : crédit « santé » prélevé sur salaire, accordé seulement si decider() et la règle des 33 % le permettent. */
export function etalerFacture(id: string): Resultat<{ facture: FactureSante; mensualite: number }> {
  const f = trouver(id), c = app.compte; if (!f || !c) return echec("Cette facture n'est plus à régler.");
  const sim = simulerEtalement(f)!;
  if (!sim.approuve) return echec(sim.controles.find((x) => !x.ok && x.id === 'part') ? `Refusé : avec cet étalement, vos mensualités atteindraient ${Math.round(sim.partApres * 100)} % de votre salaire (maximum 33 %). Payez maintenant ou réglez d'abord un crédit.` : `Refusé : ${sim.motif ?? 'conditions non remplies'}.`);
  let prochaine = prochainePaie(aujourdhui(), c.jourPaie);
  if (app.dernierePaie && prochaine <= app.dernierePaie) prochaine = ajouterMois(prochaine, 1, c.jourPaie);
  const creditId = nouvelId('c-sante');
  app.credits.push({ id: creditId, produit: 'sante', libelle: `Santé · ${f.etablissement}`, capital: f.partPatient, mensualite: sim.mensualite, duree: sim.mois, payees: 0, prochaine, statut: 'actif' });
  f.paiement = { ts: maintenant(), mode: 'etale', aTemps: pointsPaiement(f), mensualite: sim.mensualite, mois: sim.mois, creditId }; f.statut = 'etalee';
  notifier({ titre: 'Part étalée sur 3 mois', sous: `${fcfa(sim.mensualite)} FCFA par mois à partir du ${jourLong(prochaine)}`, lien: '/prelevement' });
  return { ok: true, facture: f, mensualite: sim.mensualite };
}

// ------------------------------------------------------------------ téléconsultation, ordonnance, urgence
export function teleconsulter(beneficiaire: string): Resultat<{ facture: FactureSante }> {
  const c = couvertureDe(), compte = app.compte; if (!c || !compte) return echec('Aucun compte connecté.');
  if (!beneficiaires().includes(beneficiaire)) return echec('Choisissez un bénéficiaire de la carte.');
  if (teleconsultationsUtilisees() >= c.teleconsultations) return echec(`Vos ${c.teleconsultations} téléconsultations de l'année sont utilisées. Passez au Pass Famille pour en avoir sans limite.`);
  const r = repartirActes([{ nom: 'Téléconsultation', sous: beneficiaire, montant: TARIF_TELECONSULTATION, categorie: 'consultation' }], c, utilisation().restant);
  if (app.solde < r.patient) return echec(`Solde insuffisant : ${fcfa(r.patient)} FCFA à votre charge.`);
  const e = sante(), date = aujourdhui();
  const f: FactureSante = {
    id: nouvelId('f'), numero: numeroFacture(e.sequence++, date), source: 'tele', etablissementId: 'tele', etablissement: 'Téléconsultation AssureMe', numeroMembre: compte.numeroMembre,
    patient: nomComplet(beneficiaire), medecin: 'Médecin de garde', acte: 'Téléconsultation', date, echeance: date, lignes: r.lignes.map(({ nom, sous, montant, categorie }) => ({ nom, sous, montant, categorie })),
    total: r.total, assureMe: r.assureMe, partPatient: r.patient, plafondDepasse: r.plafondDepasse, statut: 'payee', paiement: { ts: maintenant(), mode: 'comptant', aTemps: true }
  };
  e.factures.push(f);
  if (r.patient > 0) mouvement({ titre: 'Téléconsultation', sous: `Santé · ${beneficiaire}`, montant: -r.patient, ini: 'TC', categorie: 'sante' });
  notifier({ titre: 'Téléconsultation demandée', sous: `Un médecin rappelle ${beneficiaire} dans 10 minutes` });
  return { ok: true, facture: f };
}
export function envoyerOrdonnance(p: { beneficiaire: string; pharmacieId: string; pharmacie: string; medicaments: string; livraison: boolean; photo?: string }): Resultat<{ ordonnance: Ordonnance }> {
  const compte = app.compte; if (!compte) return echec('Aucun compte connecté.');
  if (!beneficiaires().includes(p.beneficiaire)) return echec('Choisissez un bénéficiaire de la carte.');
  if (p.medicaments.trim().length < 3 && !p.photo) return echec("Joignez une photo de l'ordonnance ou listez les médicaments.");
  if (!p.pharmacieId) return echec('Choisissez une pharmacie.');
  const frais = p.livraison ? FRAIS_LIVRAISON : 0;
  if (frais > app.solde) return echec(`Solde insuffisant pour la livraison (${fcfa(frais)} FCFA). Choisissez le retrait en pharmacie ou rechargez.`);
  if (frais) mouvement({ titre: p.pharmacie, sous: 'Santé · livraison ordonnance', montant: -frais, ini: initiales(p.pharmacie), categorie: 'sante' });
  const o: Ordonnance = { id: nouvelId('o'), ts: maintenant(), numeroMembre: compte.numeroMembre, beneficiaire: p.beneficiaire, pharmacieId: p.pharmacieId, pharmacie: p.pharmacie, medicaments: p.medicaments.trim() || 'Ordonnance en photo', livraison: p.livraison, fraisLivraison: frais, photo: p.photo };
  sante().ordonnances.unshift(o);
  notifier({ titre: 'Ordonnance reçue', sous: p.livraison ? `${p.pharmacie} la prépare, livraison sous 2 h` : `${p.pharmacie} la prépare, retrait possible dans 1 h` });
  return { ok: true, ordonnance: o };
}
/** Annulation possible tant que la pharmacie n'a pas commencé la préparation ; la livraison est remboursée. */
export function annulerOrdonnance(id: string): Resultat {
  const o = sante().ordonnances.find((x) => x.id === id); if (!o || o.annulee) return echec('Ordonnance introuvable.');
  if (statutOrdonnance(o.ts, maintenant(), o.livraison) !== 'recue') return echec('La pharmacie a déjà commencé la préparation.');
  o.annulee = true; if (o.fraisLivraison) mouvement({ titre: o.pharmacie, sous: 'Santé · livraison remboursée', montant: o.fraisLivraison, ini: initiales(o.pharmacie), categorie: 'sante' });
  return { ok: true };
}
export function appelerAmbulance(): Resultat {
  if (!app.compte) return echec('Aucun compte connecté.');
  notifier({ titre: 'Ambulance prévenue', sous: 'Transport pris en charge à 100 %. Restez à votre position.' });
  return { ok: true };
}
