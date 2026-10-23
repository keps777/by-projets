// Actions du commerce : caisse (QR, encaissement), remboursement automatique des avances, commande de stock.
import { app, maintenant, mouvement, nouvelId, notifier, totalMensualites } from '../../data/store.svelte.ts';
import { FRAIS_ENCAISSEMENT, FRAIS_STOCK, fraisStock, modes, net, semainesPourRembourser, type ModeEncaissement } from '../../core/commerce.ts';
import { niveauDuScore, SEUILS_NIVEAU } from '../../core/credit.ts';
import { ajouterJours } from '../../core/dates.ts';
import { codeClient } from '../../core/recu.ts';
import { PLAFOND_STOCK, deciderService, indexSemaine, niveauPourStock, type EntreeService } from '../../core/services.ts';
import { jourDe } from '../../core/dates.ts';
import type { Decision } from '../../core/credit.ts';
import { DUREE_QR_S, disponible, journalierPour, montantDe, restant, retenues, rouler, verifierMontant } from './calcul.ts';
import { etat, type Avance, type Encaissement } from './etat.ts';

export type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string; decision?: Decision };
export const GROSSISTE = 'Laborex Douala';
const LIVRAISON_MS = 48 * 3_600_000;

export const niveau = () => niveauDuScore(app.score.valeur);
export const plafondStock = () => PLAFOND_STOCK[niveau()];

export function ouvrirCaisse(nom: string): Resultat {
  if (nom.trim().length < 2) return { ok: false, erreur: 'Donnez un nom à votre commerce.' };
  etat().nom = nom.trim(); return { ok: true };
}
/** À l'ouverture d'un écran : change de semaine si besoin, constate les livraisons. */
export function synchroniser(now = maintenant()) {
  const e = etat();
  e.semaine = rouler(e.semaine, now);
  for (const a of e.avances) {
    if (a.livre || now < a.livraison) continue;
    a.livre = true;
    notifier({ titre: `Commande ${a.grossiste} livrée`, sous: `Stock de ${a.montant.toLocaleString('fr-FR')} FCFA reçu à ${e.nom ?? 'votre commerce'}`, lien: '/commerce/stock', ts: a.livraison });
  }
}

export function genererQr(now = maintenant()): Resultat {
  const e = etat(); const n = montantDe(e.saisie);
  const err = verifierMontant(n); if (err) return { ok: false, erreur: err };
  const graine = n * 7 + e.compteurQr++ * 7919;
  e.qr = { montant: n, mode: e.mode, graine, expire: now + DUREE_QR_S * 1000, code: codeClient(graine) };
  return { ok: true };
}
export function fermerQr() { etat().qr = null; }

/** Le client a payé : la caisse reçoit le net (1 % de frais), moins la part retenue pour rembourser un stock avancé. */
export function encaisser(now = maintenant()): Resultat<{ encaissement: Encaissement }> {
  const e = etat(); const qr = e.qr;
  if (!qr) return { ok: false, erreur: 'Aucun QR actif : affichez-en un.' };
  if (now > qr.expire) return { ok: false, erreur: 'Ce QR a expiré. Générez-en un nouveau.' };
  const m = modes(qr.montant).find((x) => x.id === qr.mode)!;
  const versement = net(qr.montant);
  const parts = retenues(qr.montant, e.avances);
  const retenue = parts.reduce((s, r) => s + r.montant, 0);
  const enc: Encaissement = { id: nouvelId('e'), ts: now, montant: qr.montant, frais: qr.montant - versement, net: versement, retenue, mode: qr.mode, code: qr.code };
  e.encaissements.unshift(enc);
  const i = indexSemaine(now);
  e.semaine = rouler(e.semaine, now);
  e.semaine.total[i] += qr.montant; e.semaine.assureMe[i] += qr.montant;
  mouvement({ titre: `Encaissement · ${m.titre}`, sous: `Client ${qr.code} · frais 1 %`, montant: versement, ini: 'EN', categorie: 'commerce', ts: now });
  for (const p of parts) {
    const a = e.avances.find((x) => x.id === p.id)!;
    a.rembourse += p.montant; a.remboursements.push({ ts: now, montant: p.montant });
    mouvement({ titre: 'Remboursement avance de stock', sous: `${a.taux} % de l'encaissement · ${a.grossiste}`, montant: -p.montant, ini: 'ST', categorie: 'commerce', ts: now });
    if (restant(a) === 0) solder(a);
  }
  e.qr = null;
  notifier({ titre: `Encaissé ${versement.toLocaleString('fr-FR')} FCFA`, sous: `${m.titre} · versé sur votre compte AssureMe`, lien: '/commerce', ts: now });
  return { ok: true, encaissement: enc };
}
function solder(a: Avance) {
  a.statut = 'soldee';
  const c = app.credits.find((x) => x.id === a.creditId);
  if (c) { c.statut = 'termine'; c.payees = c.duree; }
  notifier({ titre: 'Avance de stock remboursée', sous: `${a.montant.toLocaleString('fr-FR')} FCFA + ${a.frais.toLocaleString('fr-FR')} de frais, entièrement remboursés par vos ventes`, lien: '/commerce/stock' });
}

export const disponibleMaintenant = () => { const e = etat(); return disponible(e.semaine, plafondStock(), e.avances); };

/** Commande de stock chez le grossiste : contrôles (niveau, plafond, score, règle des 33 %), puis crédit « commerce ». */
export function commanderAvance(montant: number, taux: number, now = maintenant()): Resultat<{ avance: Avance }> {
  const c = app.compte; const e = etat();
  if (!c) return { ok: false, erreur: 'Compte introuvable.' };
  if (plafondStock() === 0) return { ok: false, erreur: 'L\'avance de stock s\'ouvre dès le niveau Plus.' };
  if (![8, 12, 20].includes(taux)) return { ok: false, erreur: 'Choisissez une part des encaissements : 8, 12 ou 20 %.' };
  const dispo = disponibleMaintenant();
  if (montant > dispo) return { ok: false, erreur: `Maximum disponible : ${dispo.toLocaleString('fr-FR')} FCFA.` };
  const entree: EntreeService = { score: app.score.valeur, seuilScore: SEUILS_NIVEAU[niveauPourStock() ?? 'PLUS'], salaire: c.salaireNet || 1, mensualiteNouvelle: 0, mensualitesExistantes: totalMensualites(), employeurPartenaire: true, ancienneteAns: parseInt(c.anciennete) || 1 };
  const decision = deciderService(entree, ['employeur']);
  if (!decision.approuve) return { ok: false, erreur: decision.motif ?? 'Demande refusée.', decision };
  if (montant < 100_000) return { ok: false, erreur: 'Avance minimum : 100 000 FCFA.' };
  const journalier = journalierPour(e.semaine, taux);
  const semaines = semainesPourRembourser(montant, journalier);
  if (!Number.isFinite(semaines)) return { ok: false, erreur: 'Vos ventes AssureMe sont trop faibles pour rembourser à ce rythme.' };
  const frais = fraisStock(montant); const creditId = nouvelId('c');
  const avance: Avance = { id: nouvelId('av'), ts: now, montant, frais, taux, journalier, semaines, rembourse: 0, remboursements: [], grossiste: GROSSISTE, livraison: now + LIVRAISON_MS, livre: false, creditId, statut: 'en_cours' };
  e.avances.unshift(avance);
  app.credits.push({ id: creditId, produit: 'commerce', libelle: `Avance de stock · ${GROSSISTE}`, capital: montant, mensualite: 0, duree: Math.max(1, Math.ceil(semaines / 4.345)), payees: 0, prochaine: ajouterJours(jourDe(new Date(now)), 7), statut: 'actif' });
  notifier({ titre: 'Grossiste payé', sous: `${montant.toLocaleString('fr-FR')} FCFA à ${GROSSISTE} · livraison sous 48 h · remboursé à ${taux} % de vos encaissements`, lien: '/commerce/stock', ts: now });
  return { ok: true, avance };
}
export const FRAIS = { encaissement: FRAIS_ENCAISSEMENT, stock: FRAIS_STOCK };
export type { ModeEncaissement };
