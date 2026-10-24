// Exports CSV de la comptabilité (ventes, caisses, colis, paiements). Séparateur « ; » et BOM pour Excel ; cellules neutralisées (core/csv).
import { ecrireCsv } from '../../core/csv.ts';
import { totalCompte } from '../../core/caisse.ts';
import type { Monde } from '../../domain/types.ts';

export type TypeExport = 'ventes' | 'caisses' | 'colis' | 'paiements';
export const TYPES_EXPORT: { id: TypeExport; nom: string }[] = [{ id: 'ventes', nom: 'Ventes' }, { id: 'caisses', nom: 'Caisses' }, { id: 'colis', nom: 'Colis' }, { id: 'paiements', nom: 'Paiements' }];
export interface FiltreExport { /** Début inclus (ms depuis l'époque) ; absent = tout. */ depuis?: number }
const date = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
const heure = (ts?: number) => (ts ? new Date(ts).toTimeString().slice(0, 5) : '');
const nomDe = (m: Monde, id: string | undefined) => { const p = m.personnes.find((x) => x.id === id); return p ? `${p.prenom} ${p.nom}` : (id ?? ''); };
const garesDe = (m: Monde, id: string | undefined) => { const g = m.gares.find((x) => x.id === id); return g ? `${g.ville} ${g.nom}` : ''; };
const dedans = (ts: number, f: FiltreExport) => !f.depuis || ts >= f.depuis;

export function lignesVentes(m: Monde, f: FiltreExport = {}): (string | number)[][] {
  const lignes: (string | number)[][] = [['Date', 'Heure', 'Pièce', 'Ligne', 'Jour du départ', 'Heure du départ', 'Siège', 'Passager', 'Téléphone', 'Canal', 'Mode de paiement', 'Montant', 'Statut', 'Gare', 'Agent']];
  for (const b of [...m.billets].sort((a, c) => a.creeLe - c.creeLe)) {
    if (!dedans(b.creeLe, f) || b.statut === 'attente_paiement' || b.statut === 'expire') continue;
    const d = m.departs.find((x) => x.id === b.departId), l = m.lignes.find((x) => x.id === d?.ligneId), p = m.paiements.find((x) => x.id === b.paiementId), c = m.caisses.find((x) => x.id === b.caisseId);
    lignes.push([date(b.creeLe), heure(b.creeLe), b.code, l ? `${l.de} → ${l.vers}` : '', d?.jour ?? '', d?.heure ?? '', b.siege ?? '', b.passager.nom, b.passager.tel, b.canal, p?.moyen ?? '', b.prix, b.statut, garesDe(m, c?.gareId), nomDe(m, c?.agentId ?? b.acheteurId)]);
  }
  return lignes;
}
export function lignesCaisses(m: Monde, f: FiltreExport = {}): (string | number)[][] {
  const lignes: (string | number)[][] = [['Jour', 'Gare', 'Agent', 'Statut', 'Fond de caisse', 'Attendu', 'Compté', 'Écart', 'Ouverte à', 'Fermée à', 'Validée par', 'Justification']];
  for (const c of [...m.caisses].sort((a, b) => a.ouvertA - b.ouvertA)) {
    if (!dedans(c.ouvertA, f)) continue;
    lignes.push([c.jour, garesDe(m, c.gareId), nomDe(m, c.agentId), c.statut, c.fond, c.attendu ?? '', c.compte ? totalCompte(c.compte) : '', c.ecart ?? '', heure(c.ouvertA), heure(c.fermeeA), nomDe(m, c.validePar), c.justification ?? '']);
  }
  return lignes;
}
export function lignesColis(m: Monde, f: FiltreExport = {}): (string | number)[][] {
  const lignes: (string | number)[][] = [['Code', 'Date', 'Expéditeur', 'Destinataire', 'Téléphone destinataire', 'Taille', 'Prix', 'Moto', 'Assurance', 'Contre-remboursement', 'Départ', 'Arrivée', 'Statut', 'Paiement']];
  for (const c of m.colis) {
    const ts = c.etapes[0]?.ts ?? 0; if (!dedans(ts, f)) continue;
    const p = m.paiements.find((x) => x.id === c.paiementId);
    lignes.push([c.code, date(ts), nomDe(m, c.expediteurId), c.destinataire.nom, c.destinataire.tel, c.taille, c.prix, c.options.moto ? 'oui' : 'non', c.options.assurance ? 'oui' : 'non', c.options.contreRemboursement ? 'oui' : 'non', c.depart, c.arrivee, c.statut, p ? `${p.moyen} (${p.statut})` : 'à la livraison']);
  }
  return lignes;
}
export function lignesPaiements(m: Monde, f: FiltreExport = {}): (string | number)[][] {
  const lignes: (string | number)[][] = [['Référence', 'Date', 'Heure', 'Moyen', 'Canal', 'Payeur', 'Montant', 'Statut', 'Motif', 'Pour', 'Nombre de pièces']];
  for (const p of [...m.paiements].sort((a, b) => a.ts - b.ts)) {
    if (!dedans(p.ts, f)) continue;
    lignes.push([p.ref, date(p.ts), heure(p.ts), p.moyen, p.canal, nomDe(m, p.payeurId), p.montant, p.statut, p.motif ?? '', p.pour.type, p.pour.ids.length]);
  }
  return lignes;
}
const FABRIQUES: Record<TypeExport, (m: Monde, f?: FiltreExport) => (string | number)[][]> = { ventes: lignesVentes, caisses: lignesCaisses, colis: lignesColis, paiements: lignesPaiements };
/** Contenu CSV d'un export (en-tête comprise). */
export const exporterCsv = (type: TypeExport, m: Monde, f: FiltreExport = {}): string => ecrireCsv(FABRIQUES[type](m, f));
export const nomFichier = (type: TypeExport, jour: string) => `afrimove-${type}-${jour}.csv`;
/** Nombre de lignes de données (hors en-tête). */
export const nombreLignes = (type: TypeExport, m: Monde, f: FiltreExport = {}) => FABRIQUES[type](m, f).length - 1;
