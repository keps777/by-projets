// Transactions de la soute (face nuit) : mettre en vente / retirer un bagage inutilisé, publier / annuler une demande. L'achat et la demande unitaire existent déjà dans `apps/bagages/actions.ts` (réutilisés ici).
// Règles provisoires : un bagage ne se revend qu'à un passager du même vol, jamais au-dessus du prix compagnie, avant l'échéance de nommage ; sous réserve d'accord de la compagnie ; commission prélevée à la vente seulement.
import { app, maintenant, nouvelId, tranche } from '../../data/store.svelte.ts';
import { fmt } from '../../core/argent.ts';
import { peutEchanger, refAleatoire } from '../../core/regles.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import { departDuVol, droitDe, volDe } from '../../domain/marche.ts';
import type { BagageDroit, Droit } from '../../domain/types.ts';
import { ErreurBagage, acheterBagages, annulerDemande, demanderBagage, type TransfertBagage } from '../bagages/actions.ts';
import { KG_BAGAGE, ajoutPossible, bagagesSur, droitsAVenir, offresSoute, plafondBagage } from '../bagages/soute.ts';
import { NOMBRE_MAX_DEMANDE, NOMBRE_MIN_DEMANDE, prixValide } from './calcul.ts';
import { demandesOuvertes, lireSoute, type GroupeDemande, type ModeDemande, type TrancheSoute } from './lecture.ts';

export { ErreurBagage };
/** À appeler depuis une action (jamais depuis un `$derived`). */
export const trancheSoute = (): TrancheSoute => tranche<TrancheSoute>('soute', () => ({ annonces: {}, groupes: [] }));

const ACTIFS = ['detenu', 'en_vente', 'nomme'];
function droitDuCompte(compteId: string, droitId: string): { droit: Droit; plafond: number; numero: string } {
  const c = compteDe(compteId); if (!c || !c.actif) throw new ErreurBagage('compte', 'Connectez-vous pour continuer.');
  const droit = droitDe(droitId); if (!droit || droit.detenteurId !== compteId || !ACTIFS.includes(droit.statut)) throw new ErreurBagage('droit', 'Cette réservation n’est pas dans votre portefeuille.');
  const v = volDe(droit.volId); if (!v) throw new ErreurBagage('vol', 'Ce vol n’existe plus.');
  if (!peutEchanger(departDuVol(v), maintenant())) throw new ErreurBagage('echeance', 'L’échéance de nommage est passée : plus aucun échange de bagage.');
  return { droit, plafond: plafondBagage(v), numero: v.numero };
}

/** Le bagage inutilisé d'un droit : en vente (annonce à modifier ou retirer) sinon libre (« inclus » : vendable). Un bagage utilisé ou déjà vendu n'est pas revendable. */
export function bagageRevendable(compteId: string, volId: string): { bagage?: BagageDroit; enVente: boolean; vendus: number } {
  const lignes = bagagesSur(compteId, volId), enVente = lignes.find((b) => b.statut === 'en_vente'), libre = lignes.find((b) => b.statut === 'inclus');
  return { bagage: enVente ?? libre, enVente: !!enVente, vendus: lignes.filter((b) => b.statut === 'vendu').length };
}
/** Le droit à revendre : celui du `?droit=` s'il a un bagage revendable, sinon le premier droit à venir qui en a un, sinon le prochain droit. */
export function droitPourVente(compteId: string, droitId?: string | null): Droit | undefined {
  const l = droitsAVenir(compteId), choisi = droitId ? l.find((d) => d.id === droitId) : undefined;
  return choisi ?? l.find((d) => bagageRevendable(compteId, d.volId).bagage) ?? l[0];
}

/** Met en vente (ou change le prix de l'annonce de) mon bagage inutilisé : statut « en vente », jamais au-dessus du prix compagnie. Prévient les passagers qui ont une demande correspondante, et conclut les achats automatiques. */
export function mettreEnVenteBagage(compteId: string, droitId: string, prix: number): BagageDroit {
  const { droit, plafond, numero } = droitDuCompte(compteId, droitId);
  if (!prixValide(prix, plafond)) throw new ErreurBagage('prix', prix > plafond ? `Le prix ne peut pas dépasser le prix compagnie (${fmt(plafond)}).` : 'Indiquez un prix de vente valide.');
  const { bagage } = bagageRevendable(compteId, droit.volId); if (!bagage) throw new ErreurBagage('introuvable', 'Aucun bagage inutilisé à revendre sur ce vol.');
  const nouveau = bagage.statut !== 'en_vente', t = trancheSoute();
  bagage.statut = 'en_vente'; bagage.prix = prix; t.annonces[bagage.id] = maintenant();
  for (const g of t.groupes.filter((x) => x.statut === 'ouverte' && x.volId === droit.volId && x.compteId !== compteId && x.alerte && prix <= x.prixMax && x.mode === 'prevenir')) {
    notifier(g.compteId, { type: 'bagage', titre: `Un bagage correspond à votre demande · ${numero}`, sous: `Offre à ${fmt(prix)} (votre maximum : ${fmt(g.prixMax)}). Réservée 15 min si vous confirmez (hypothèse).`, essentielle: true, lien: `/bagages/ajouter?droit=${encodeURIComponent(g.droitId)}` });
  }
  if (nouveau) conclureAchatsAutomatiques(droit.volId);
  return bagage;
}
/** Retire l'annonce : le bagage redevient « inclus » (inutilisé), il reste dans la franchise. */
export function retirerAnnonceBagage(compteId: string, bagageId: string): BagageDroit {
  const b = app.monde.bagages.find((x) => x.id === bagageId && x.detenteurId === compteId); if (!b) throw new ErreurBagage('introuvable', 'Annonce introuvable.');
  if (b.statut !== 'en_vente') throw new ErreurBagage('introuvable', 'Ce bagage n’est plus en vente.');
  b.statut = 'inclus'; delete trancheSoute().annonces[bagageId]; return b;
}

/** Une demande de bagage publiée : `nombre` bagages, un prix maximum par bagage (jamais au-dessus du prix compagnie), alerte et mode (prévenu / achat automatique). */
export interface ParamsDemande { nombre: number; prixMax: number; mode: ModeDemande; alerte: boolean; /** Référence vue sur l'aperçu, reprise si elle est libre. */ ref?: string }
export interface ResultatDemande { groupe: GroupeDemande; achat?: TransfertBagage; correspondances: number }
export function publierDemandeBagage(compteId: string, droitId: string, p: ParamsDemande): ResultatDemande {
  const { droit, plafond, numero } = droitDuCompte(compteId, droitId);
  if (!Number.isInteger(p.nombre) || p.nombre < NOMBRE_MIN_DEMANDE || p.nombre > NOMBRE_MAX_DEMANDE) throw new ErreurBagage('quantite', `Demandez de ${NOMBRE_MIN_DEMANDE} à ${NOMBRE_MAX_DEMANDE} bagages.`);
  if (!prixValide(p.prixMax, plafond)) throw new ErreurBagage('prix', p.prixMax > plafond ? `Le prix maximum ne peut pas dépasser le prix compagnie (${fmt(plafond)}).` : 'Indiquez un prix maximum valide.');
  const t = trancheSoute();
  // Une demande de la base (notifie les vendeurs dont l'offre correspond), puis ses copies : un enregistrement par bagage attendu.
  const premiere = demanderBagage(compteId, droitId, p.prixMax, KG_BAGAGE), ids = [premiere.id];
  for (let i = 1; i < p.nombre; i++) { const d = { ...premiere, id: nouvelId('db') }; app.monde.demandesBagage.push(d); ids.push(d.id); }
  // Les autres passagers du vol qui ont un bagage inutilisé (non déjà prévenus par l'offre correspondante) reçoivent la demande, sans nom.
  const prevenus = new Set(app.monde.bagages.filter((b) => b.volId === droit.volId && b.statut === 'en_vente' && b.prix <= p.prixMax).map((b) => b.detenteurId));
  for (const id of new Set(app.monde.bagages.filter((b) => b.volId === droit.volId && b.statut === 'inclus' && b.detenteurId !== compteId).map((b) => b.detenteurId))) {
    if (!prevenus.has(id)) notifier(id, { type: 'bagage', titre: `Un passager du vol ${numero} cherche un bagage`, sous: `Jusqu’à ${fmt(p.prixMax)} : vous avez un bagage inutilisé à revendre.`, essentielle: false, lien: '/bagages/vendre' });
  }
  let n = t.groupes.length * 13 + Math.floor(maintenant() / 1000), ref = p.ref && !t.groupes.some((x) => x.ref === p.ref) ? p.ref : refAleatoire(n); while (t.groupes.some((x) => x.ref === ref)) ref = refAleatoire(++n);
  const groupe: GroupeDemande = { id: nouvelId('gd'), ref, compteId, droitId, volId: droit.volId, nombre: p.nombre, prixMax: p.prixMax, mode: p.mode, alerte: p.alerte, demandeIds: ids, creeLe: maintenant(), statut: 'ouverte' };
  t.groupes.push(groupe);
  const correspondances = offresSoute(droit.volId, compteId).filter((o) => o.prix <= p.prixMax).length;
  const achat = conclureAchatsAutomatiques(droit.volId).find((a) => a.acheteurId === compteId);
  if (!achat && correspondances > 0 && p.alerte) {
    notifier(compteId, { type: 'bagage', titre: `${correspondances} bagage${correspondances > 1 ? 's' : ''} correspond${correspondances > 1 ? 'ent' : ''} déjà`, sous: `Vol ${numero} · jusqu’à ${fmt(p.prixMax)}. Confirmez dans la soute : l’offre vous est réservée 15 min (hypothèse).`, essentielle: true, lien: `/bagages/ajouter?droit=${encodeURIComponent(droitId)}` });
  }
  return { groupe, achat, correspondances };
}

/** Achat automatique : pour chaque demande ouverte en mode « auto », achète les offres les moins chères qui respectent le prix maximum (dans la limite des bagages ajoutables). Les demandes servies passent à « servie ». */
export function conclureAchatsAutomatiques(volId: string): TransfertBagage[] {
  const faits: TransfertBagage[] = [];
  for (const g of trancheSoute().groupes.filter((x) => x.volId === volId && x.statut === 'ouverte' && x.mode === 'auto')) {
    const restants = g.demandeIds.filter((id) => app.monde.demandesBagage.find((d) => d.id === id)?.statut === 'ouverte');
    const k = Math.min(restants.length, offresSoute(volId, g.compteId).filter((o) => o.prix <= g.prixMax).length, ajoutPossible(g.compteId, volId));
    if (k < 1) continue;
    try {
      faits.push(acheterBagages(g.compteId, g.droitId, k, 'carte'));
      for (const id of restants.slice(0, k)) { const d = app.monde.demandesBagage.find((x) => x.id === id); if (d) d.statut = 'servie'; }
      if (k === restants.length) g.statut = 'servie';
    } catch { /* l'échéance ou la limite peut avoir changé : la demande reste ouverte */ }
  }
  return faits;
}

/** Retire ma demande (toutes ses copies) ; accepte l'identifiant d'un groupe ou d'une demande isolée (publiée depuis « Ajouter des bagages »). */
export function annulerDemandeBagage(compteId: string, id: string): void {
  const g = trancheSoute().groupes.find((x) => x.id === id && x.compteId === compteId);
  if (g) { for (const did of g.demandeIds) { try { annulerDemande(compteId, did); } catch { /* déjà retirée */ } } if (g.statut === 'ouverte') g.statut = 'annulee'; return; }
  annulerDemande(compteId, id);
}

/** Mes demandes ouvertes sur un vol : un bloc par demande publiée (nombre, prix max, mode), plus les demandes isolées. */
export interface MaDemande { id: string; ref?: string; nombre: number; prixMax: number; mode?: ModeDemande; alerte?: boolean }
export function mesDemandes(compteId: string, volId: string): MaDemande[] {
  const ouvertes = demandesOuvertes(volId).filter((d) => d.compteId === compteId), groupes = lireSoute().groupes.filter((g) => g.compteId === compteId && g.volId === volId && g.statut === 'ouverte');
  const dansGroupe = new Set(groupes.flatMap((g) => g.demandeIds));
  const deGroupe: MaDemande[] = groupes.map((g) => ({ id: g.id, ref: g.ref, nombre: g.demandeIds.filter((i) => ouvertes.some((d) => d.id === i)).length, prixMax: g.prixMax, mode: g.mode, alerte: g.alerte })).filter((g) => g.nombre > 0);
  return [...deGroupe, ...ouvertes.filter((d) => !dansGroupe.has(d.id)).map((d) => ({ id: d.id, nombre: 1, prixMax: d.prixMax }))];
}
