// Actions de la diaspora : proches, factures, paiement en euros, avancement des 4 étapes.
import { app, maintenant, nouvelId, notifier } from '../../data/store.svelte.ts';
import { numeroRecu } from '../../core/recu.ts';
import { plafondDiaspora } from '../../core/services.ts';
import { niveauDuScore } from '../../core/credit.ts';
import { MOYENS, type MoyenPaiement } from '../../core/diaspora.ts';
import { euro } from '../../core/money.ts';
import { totalEuro } from '../../core/diaspora.ts';
import { libellePartenaire, totalSelection, verifierFacture, verifierPaiement } from './calcul.ts';
import { etat, type CategorieFacture, type PaiementDiaspora } from './etat.ts';

export type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

export function ajouterProche(nom: string, ville: string): Resultat<{ id: string }> {
  const e = etat();
  if (nom.trim().length < 2) return { ok: false, erreur: 'Entrez le nom de votre proche.' };
  if (ville.trim().length < 2) return { ok: false, erreur: 'Entrez sa ville.' };
  if (e.proches.some((p) => p.nom.toLowerCase() === nom.trim().toLowerCase())) return { ok: false, erreur: 'Ce proche existe déjà.' };
  const id = nouvelId('p');
  e.proches.push({ id, nom: nom.trim(), ville: ville.trim(), pass: null, plafondSante: null, consommeSante: 0, factures: [] });
  return { ok: true, id };
}
export function ajouterFacture(procheId: string, f: { prestataire: string; detail: string; montant: number | null; categorie: CategorieFacture }): Resultat<{ id: string }> {
  const p = etat().proches.find((x) => x.id === procheId);
  if (!p) return { ok: false, erreur: 'Proche introuvable.' };
  const err = verifierFacture(f.prestataire, f.montant);
  if (err) return { ok: false, erreur: err };
  const id = nouvelId('f');
  p.factures.push({ id, prestataire: f.prestataire.trim(), detail: f.detail.trim() || 'Facture à régler', montant: f.montant!, categorie: f.categorie, payee: false });
  return { ok: true, id };
}
export function changerVille(ville: string): Resultat {
  if (ville.trim().length < 2) return { ok: false, erreur: 'Entrez une ville.' };
  etat().depuis = ville.trim(); return { ok: true };
}

export const plafondMembre = () => plafondDiaspora(niveauDuScore(app.score.valeur));

/** Paie les factures choisies, en euros au taux fixe, sans frais ; l'argent va directement aux prestataires. */
export function payer(procheId: string, factureIds: string[], moyen: MoyenPaiement): Resultat<{ id: string }> {
  const e = etat();
  const proche = e.proches.find((p) => p.id === procheId);
  if (!proche) return { ok: false, erreur: 'Proche introuvable.' };
  const choisies = proche.factures.filter((f) => !f.payee && factureIds.includes(f.id));
  const total = totalSelection(proche.factures, factureIds);
  const err = verifierPaiement(choisies.length, total, plafondMembre());
  if (err) return { ok: false, erreur: err };
  const debut = maintenant(); const annee = new Date(debut).getFullYear();
  const paiement: PaiementDiaspora = {
    id: nouvelId('dp'), procheId, procheNom: proche.nom, procheVille: proche.ville, moyen, depuis: e.depuis, debut, delaiSigne: 29 * 60_000, montantFcfa: total, signe: false,
    lignes: choisies.map((f) => ({ factureId: f.id, prestataire: f.prestataire, detail: f.detail, montant: f.montant, categorie: f.categorie, recu: numeroRecu(f.prestataire, annee, ++e.compteurRecu), signataire: f.signataire ?? f.prestataire }))
  };
  for (const f of choisies) {
    f.payee = true;
    if (f.categorie === 'sante') proche.consommeSante += f.montant;
  }
  e.paiements.unshift(paiement);
  notifier({ titre: `Paiement envoyé pour ${proche.nom}`, sous: `${euro(totalEuro(total))} € par ${MOYENS[moyen].court} · versé à ${libellePartenaire(paiement)}`, lien: `/diaspora/suivi/${paiement.id}`, ts: debut });
  return { ok: true, id: paiement.id };
}

/** Fait avancer la dernière étape : la clinique (ou le prestataire) signe le reçu après quelques minutes. */
export function avancer(now = maintenant()) {
  for (const p of etat().paiements) {
    if (p.signe || now < p.debut + p.delaiSigne) continue;
    p.signe = true;
    notifier({ titre: `Reçu signé par ${libellePartenaire(p)}`, sous: `${p.procheNom} a été prévenu(e) par SMS · reçu ${p.lignes[0].recu}`, lien: `/diaspora/suivi/${p.id}`, ts: p.debut + p.delaiSigne });
  }
}
