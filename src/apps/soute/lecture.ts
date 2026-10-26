// Face nuit de la soute : lecture du monde simulé (aucune écriture, sûr dans un `$derived`). Le marché d'un vol = les offres de vente et les demandes d'achat de bagages du même vol.
import { app, maintenant } from '../../data/store.svelte.ts';
import { refAleatoire } from '../../core/regles.ts';
import { departDuVol, volDe } from '../../domain/marche.ts';
import type { BagageDroit, DemandeBagage, Droit, Vol } from '../../domain/types.ts';
import { droitsAVenir, plafondBagage } from '../bagages/soute.ts';
import type { TrancheBagages } from '../bagages/actions.ts';
import { heure } from '../bagages/format.ts';
import { ageDemo, carnetDemandes, carnetOffres, casesDe, codeCase, codeVendeur, compterCases, disposition, ilYA, transactions, trierOffres, type GenreCase, type LigneCarnet, type LigneDemande, type LigneTransaction, type OffreMarche } from './calcul.ts';

/** Tranche d'état de la soute (face nuit) : date de mise en vente des annonces, demandes groupées (nombre, mode, alerte). */
export type ModeDemande = 'prevenir' | 'auto';
export interface GroupeDemande { id: string; ref: string; compteId: string; droitId: string; volId: string; nombre: number; prixMax: number; mode: ModeDemande; alerte: boolean; demandeIds: string[]; creeLe: number; statut: 'ouverte' | 'annulee' | 'servie' }
export interface TrancheSoute { annonces: Record<string, number>; groupes: GroupeDemande[] }
/** Lecture sans création de la tranche (jamais d'écriture depuis un `$derived`). */
export const lireSoute = (): TrancheSoute => (app.tranches.soute as TrancheSoute | undefined) ?? { annonces: {}, groupes: [] };

/** Offres du vol : en vente, prix positif et jamais au-dessus du prix compagnie, dans l'ordre du monde. */
export function offresDuVol(volId: string): BagageDroit[] {
  const v = volDe(volId); if (!v) return [];
  return app.monde.bagages.filter((b) => b.volId === volId && b.statut === 'en_vente' && b.prix > 0 && b.prix <= plafondBagage(v));
}
export const demandesOuvertes = (volId: string): DemandeBagage[] => app.monde.demandesBagage.filter((d) => d.volId === volId && d.statut === 'ouverte');
/** Ventes déjà conclues sur ce vol (transferts de bagage de la soute), toutes parties confondues. */
export function ventesDuVol(volId: string): { quand: number; prix: number }[] {
  const t = (app.tranches.bagages as TrancheBagages | undefined)?.transferts ?? [];
  return t.filter((x) => x.volId === volId).flatMap((x) => x.lignes.map((l) => ({ quand: x.quand, prix: l.prix })));
}
/** Le droit du compte sur ce vol (le prochain à venir si plusieurs). */
export const droitSurVol = (compteId: string, volId: string): Droit | undefined => droitsAVenir(compteId).find((d) => d.volId === volId);

export interface OffreCarte extends OffreMarche { bagageId: string; mienne: boolean; vendeur: string; depuis: string; case?: number }
export interface MarcheSoute {
  vol: Vol; plafond: number; offres: OffreCarte[]; carnet: LigneCarnet<OffreCarte>[]; demandes: LigneDemande[]; nbDemandes: number;
  offreMin?: number; demandeMax?: number; disposition: GenreCase[]; compte: Record<GenreCase, number>; transactions: LigneTransaction[];
}
/** Le marché d'un vol vu par `compteId` : offres (avec emplacement sur la carte), carnet, demandes, transactions. */
export function marcheSoute(volId: string, compteId: string | undefined, now: number = maintenant()): MarcheSoute | undefined {
  const vol = volDe(volId); if (!vol) return undefined;
  const brutes = offresDuVol(volId), demandes = demandesOuvertes(volId), ventes = ventesDuVol(volId), annonces = lireSoute().annonces;
  const dispo = disposition(brutes.length, app.monde.bagages.filter((b) => b.volId === volId && (b.statut === 'achete' || b.statut === 'transfere')).length);
  const casesO = casesDe(dispo, 'O'), casesB = casesDe(dispo, 'B');
  const offres: OffreCarte[] = brutes.map((b, i) => {
    const quand = annonces[b.id] ?? now - ageDemo(b.id);
    return { id: b.id, bagageId: b.id, prix: b.prix, vendeurId: b.detenteurId, mienne: b.detenteurId === compteId, vendeur: codeVendeur(b.detenteurId), quand, depuis: ilYA(now - quand, quand, heure), case: casesO[i], code: casesO[i] === undefined ? '—' : codeCase(casesO[i]) };
  });
  const tri = trierOffres(offres), prixDemandes = demandes.map((d) => d.prixMax);
  const lignes = carnetDemandes(prixDemandes, offres.length);
  return {
    vol, plafond: plafondBagage(vol), offres, carnet: carnetOffres(offres), demandes: lignes, nbDemandes: demandes.length,
    offreMin: tri[0]?.prix, demandeMax: lignes[0]?.prix, disposition: dispo, compte: compterCases(dispo),
    transactions: transactions(ventes, casesB.map(codeCase))
  };
}
export const echeanceNommage = (v: Vol): number => departDuVol(v) - 24 * 3_600_000;

/** Référence prévue pour la prochaine demande d'un droit (aperçu de l'étiquette, reprise à la publication) : stable tant que rien n'est publié. */
export function refDemande(droitId: string): string {
  const groupes = lireSoute().groupes; let n = [...droitId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) + groupes.length * 17;
  let ref = refAleatoire(n); while (groupes.some((g) => g.ref === ref)) ref = refAleatoire(++n); return ref;
}
