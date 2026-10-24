// Transactions propres à l'entrée et à « Moi » : comptes voyageurs, fidélité et parrainage, litiges, notifications, proches, remise à zéro.
// Elles s'appuient sur `app.monde` et sur les primitives de `domain/actions.ts` ; les montants sont en FCFA entiers.
import { app, maintenant, nouvelId, reinitialiser } from '../../data/store.svelte.ts';
import { aujourdhui } from '../../data/horloge.ts';
import { billetParId, billetsDe, connecter, consigner, departParId, ligneDe, notifier, personne, personneCourante } from '../../domain/actions.ts';
import type { Litige, Personne } from '../../domain/types.ts';
import { codeParrain, palierDe, POINTS_BON, POINTS_PARRAINAGE, pointsPourBillet, VALEUR_BON } from '../../core/fidelite.ts';
import { normaliserTel } from '../../core/telephone.ts';
import { jourCourt, jourDe } from '../../core/dates.ts';
import { fideliteDe, fideliteLue, preferences, type FideliteDe } from './etat.ts';

// ------------------------------------------------------------------ session et langue
/** Langue de l'interface : session, fiche de la personne connectée et attribut `lang` de la page. */
export function definirLangue(l: 'fr' | 'en' | 'pcm') {
  app.session.langue = l; const p = personneCourante(); if (p) p.langue = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'pcm' ? 'en' : l;
}
/** Ouvre la session d'un voyageur après une connexion réussie (passkey, visage ou code SMS) et le retient comme compte de l'appareil. */
export function ouvrirSession(personneId: string) {
  connecter(personneId); app.session.vuTuto = true; preferences().appareilId = personneId;
  const p = personne(personneId); if (p?.langue) definirLangue(p.langue);
  crediterBillets(personneId);
}
/** Compte reconnu par cet appareil (le dernier voyageur connecté, sinon Aïcha). */
export const compteAppareil = (): Personne | undefined => { const id = preferences().appareilId; return personne(id) ?? personne('p-aicha'); };

// ------------------------------------------------------------------ comptes
/** Voyageur (ou proche) dont le numéro est celui saisi (toute écriture camerounaise acceptée). */
export function personneParTel(saisie: string): Personne | undefined {
  const tel = normaliserTel(saisie); return tel ? app.monde.personnes.find((p) => normaliserTel(p.tel) === tel) : undefined;
}
export class ErreurCompte extends Error { constructor(public code: 'tel_invalide' | 'nom_invalide' | 'existe_deja') { super(code); } }
/** Sépare « Aïcha Ndiba » en prénom et nom (le premier mot est le prénom). */
export function separerNom(nomComplet: string): { prenom: string; nom: string } {
  const [prenom, ...reste] = nomComplet.trim().replace(/\s+/g, ' ').split(' '); return { prenom: prenom ?? '', nom: reste.join(' ') };
}
/** Crée un compte voyageur pour un numéro inconnu. Un code de parrainage valide donne 500 points au parrain et au nouveau voyageur. */
export function creerCompteVoyageur(telSaisi: string, nomComplet: string, codeParrainSaisi = ''): Personne {
  const tel = normaliserTel(telSaisi); if (!tel) throw new ErreurCompte('tel_invalide');
  const { prenom, nom } = separerNom(nomComplet); if (prenom.length < 2) throw new ErreurCompte('nom_invalide');
  if (personneParTel(tel)) throw new ErreurCompte('existe_deja');
  const p: Personne = { id: nouvelId('p'), prenom, nom, tel, role: 'voyageur', actif: true, langue: app.session.langue, points: 0, prochesIds: [], passkey: false, visage: false };
  app.monde.personnes.push(p);
  consigner('compte', `Nouveau voyageur ${prenom} ${nom}`.trim(), p.id);
  notifier(p.id, 'Bienvenue sur AfriMove', 'Ton compte est prêt. Choisis ton premier départ.', '/', 'compte');
  const parrain = parrainParCode(codeParrainSaisi);
  if (parrain && parrain.id !== p.id) {
    crediterPoints(parrain.id, POINTS_PARRAINAGE, `Parrainage · ${p.prenom}`); crediterPoints(p.id, POINTS_PARRAINAGE, `Parrainage · ${parrain.prenom}`);
    notifier(parrain.id, `+${POINTS_PARRAINAGE} points`, `${p.prenom} a rejoint AfriMove avec ton code`, '/moi/fidelite', 'fidelite');
  }
  return p;
}
export const codeParrainDe = (p: Personne) => codeParrain(p.prenom, p.tel, p.id);
export function parrainParCode(code: string): Personne | undefined {
  const c = code.trim().toUpperCase(); return c ? app.monde.personnes.find((p) => p.role === 'voyageur' && codeParrainDe(p) === c) : undefined;
}

// ------------------------------------------------------------------ fidélité
/** Fidélité d'une personne, créée au besoin : à appeler dans un script ou une action, jamais dans un `$derived` (lire avec `fideliteLue`). */
export const fidelite = (personneId: string): FideliteDe => fideliteDe(personneId, personne(personneId)?.points ?? 0, billetsDe(personneId));
/** À l'ouverture d'un écran de Moi : crée la fidélité de la personne et crédite les billets payés depuis. */
export function preparerFidelite(personneId: string) { fidelite(personneId); crediterBillets(personneId); }
/** Ajoute (ou retire) des points : met à jour le solde de la personne, l'historique et le cumul qui fixe le palier. */
export function crediterPoints(personneId: string, pts: number, libelle: string) {
  const p = personne(personneId); if (!p || pts === 0) return;
  const f = fidelite(personneId);
  p.points = Math.max(0, (p.points ?? 0) + pts); if (pts > 0) f.cumul += pts;
  f.mouvements.unshift({ id: nouvelId('m'), ts: maintenant(), libelle, pts });
}
/** Crédite 1 point par 100 F de chaque billet payé pas encore compté ; reprend les points des billets remboursés. Renvoie le gain net. */
export function crediterBillets(personneId: string): number {
  const f = fidelite(personneId); let net = 0;
  for (const b of billetsDe(personneId).filter((x) => x.acheteurId === personneId)) {
    const trajet = () => { const d = departParId(b.departId); const l = d && ligneDe(d); return l ? `${l.de} → ${l.vers}` : 'Billet'; };
    if ((b.statut === 'valide' || b.statut === 'scanne') && !f.credites.includes(b.id)) {
      f.credites.push(b.id); const pts = pointsPourBillet(b.prix); if (pts > 0) { crediterPoints(personneId, pts, `Billet ${trajet()}`); net += pts; }
    } else if ((b.statut === 'rembourse' || b.statut === 'annule') && f.credites.includes(b.id) && !f.repris.includes(b.id)) {
      f.repris.push(b.id); const pts = pointsPourBillet(b.prix); if (pts > 0) { crediterPoints(personneId, -pts, `Billet remboursé ${trajet()}`); net -= pts; }
    }
  }
  return net;
}
/** 500 points → un bon de 500 F à utiliser au paiement. */
export function utiliserPoints(personneId: string): { ok: true; montant: number } | { ok: false; raison: string } {
  const p = personne(personneId); if (!p) return { ok: false, raison: 'Compte inconnu' };
  if ((p.points ?? 0) < POINTS_BON) return { ok: false, raison: `Il te faut ${POINTS_BON} points (tu en as ${p.points ?? 0})` };
  crediterPoints(personneId, -POINTS_BON, 'Bon de réduction'); fidelite(personneId).bons.push({ id: nouvelId('bon'), ts: maintenant(), montant: VALEUR_BON, utilise: false });
  return { ok: true, montant: VALEUR_BON };
}
export const bonsDisponibles = (personneId: string) => (fideliteLue(personneId)?.bons ?? []).filter((b) => !b.utilise);
export const palierDeLaPersonne = (personneId: string) => palierDe(fideliteLue(personneId)?.cumul ?? personne(personneId)?.points ?? 0);
/** Date d'un mouvement : « aujourd'hui » ou « 18 oct. ». */
export const dateMouvement = (ts: number) => { const j = jourDe(new Date(ts)); return j === aujourdhui() ? 'aujourd’hui' : jourCourt(j); };

// ------------------------------------------------------------------ litiges
export const CATEGORIES_LITIGE = ['Retard', 'Bus annulé', 'Débitée sans billet', 'Bagage ou colis', 'Chauffeur', 'Autre'] as const;
export const EXEMPLES_LITIGE = ['Ex. : le bus de 08:00 est parti à 09:10, personne ne nous a prévenus.', 'Ex. : départ annulé au quai, pas de bus de remplacement.', 'Ex. : MoMo m’a débitée 7 500 F mais je n’ai pas de billet.', 'Ex. : ma valise n’était pas dans la soute à l’arrivée.', 'Ex. : conduite dangereuse entre Edéa et Yassa.', 'Dis-nous ce qui s’est passé.'];
export const LIBELLE_STATUT_LITIGE: Record<Litige['statut'], string> = { ouvert: 'ouvert', en_cours: 'en cours', resolu: 'résolu' };
export interface DemandeLitige { auteurId: string; categorie: string; objet: Litige['objet']; texte: string; photos?: number }
export class ErreurLitige extends Error { constructor(public code: 'texte_court' | 'objet_inconnu') { super(code); } }
/** Ouvre un dossier lié à un billet, un colis ou un départ ; prévient la voyageuse et le patron. */
/** L'écran « Signaler un problème » est celui de la voyageuse : un livreur, un relais ou un conducteur reçoit sa notification sans lien. */
const lienLitige = (auteurId: string) => (personne(auteurId)?.role === 'voyageur' ? '/litige' : undefined);
export function signalerProbleme(r: DemandeLitige): Litige {
  const texte = r.texte.trim(); if (texte.length < 5) throw new ErreurLitige('texte_court');
  const existe = r.objet.type === 'billet' ? billetParId(r.objet.id) : r.objet.type === 'colis' ? app.monde.colis.find((c) => c.id === r.objet.id) : departParId(r.objet.id);
  if (!existe) throw new ErreurLitige('objet_inconnu');
  const l: Litige = { id: `L-${2041 + app.monde.litiges.length}`, ts: maintenant(), auteurId: r.auteurId, type: r.categorie, objet: r.objet, statut: 'ouvert', texte: r.photos ? `${texte} (${r.photos} photo${r.photos > 1 ? 's' : ''} jointe${r.photos > 1 ? 's' : ''})` : texte };
  app.monde.litiges.push(l);
  notifier(r.auteurId, `Dossier ${l.id} ouvert`, `${r.categorie} · réponse sous 2 h`, lienLitige(r.auteurId), 'litige');
  for (const patron of app.monde.personnes.filter((p) => p.role === 'patron')) notifier(patron.id, `Nouveau litige ${l.id}`, `${r.categorie} · ${personne(r.auteurId)?.prenom ?? ''}`, '/patron', 'litige');
  consigner('litige', `Litige ${l.id} · ${r.categorie}`, r.auteurId, l.id);
  return l;
}
export const litigesDe = (personneId: string) => app.monde.litiges.filter((l) => l.auteurId === personneId).sort((a, b) => b.ts - a.ts);
export const litigesEnCours = (personneId: string) => litigesDe(personneId).filter((l) => l.statut !== 'resolu').length;
export const DELAI_PRISE_EN_CHARGE_MS = 15 * 60_000, DELAI_REPONSE_MS = 2 * 3_600_000;
/** Le monde simulé traite les dossiers : pris en charge après 15 min, réponse après 2 h (horloge de l'application). */
export function avancerLitiges(now = maintenant()) {
  for (const l of app.monde.litiges) {
    if (l.statut === 'ouvert' && now - l.ts >= DELAI_PRISE_EN_CHARGE_MS) { l.statut = 'en_cours'; notifier(l.auteurId, `Dossier ${l.id} pris en charge`, 'La compagnie examine ton signalement', lienLitige(l.auteurId), 'litige'); }
    if (l.statut === 'en_cours' && now - l.ts >= DELAI_REPONSE_MS) {
      l.statut = 'resolu'; l.reponse = 'Dossier traité par la compagnie. Si le préjudice est fondé, le remboursement part sur ton moyen de paiement.';
      notifier(l.auteurId, `Dossier ${l.id} résolu`, 'Lis la réponse de la compagnie', lienLitige(l.auteurId), 'litige');
    }
  }
}

// ------------------------------------------------------------------ notifications
export function marquerLu(id: string) { const n = app.monde.notifications.find((x) => x.id === id); if (n) n.lu = true; }
export function marquerToutLu(personneId: string): number { let k = 0; for (const n of app.monde.notifications) if (n.destId === personneId && !n.lu) { n.lu = true; k++; } return k; }

// ------------------------------------------------------------------ proches
export class ErreurProche extends Error { constructor(public code: 'tel_invalide' | 'nom_invalide' | 'soi_meme' | 'deja') { super(code); } }
/** Ajoute un proche par son numéro. Un numéro connu est rattaché tel quel ; sinon un contact (sans application) est créé. */
export function ajouterProche(personneId: string, nomComplet: string, telSaisi: string): Personne {
  const moi = personne(personneId)!, tel = normaliserTel(telSaisi); if (!tel) throw new ErreurProche('tel_invalide');
  if (tel === normaliserTel(moi.tel)) throw new ErreurProche('soi_meme');
  let p = personneParTel(tel);
  if (!p) {
    const { prenom, nom } = separerNom(nomComplet); if (prenom.length < 2) throw new ErreurProche('nom_invalide');
    p = { id: nouvelId('p'), prenom, nom, tel, role: 'voyageur', actif: true, ville: moi.ville }; app.monde.personnes.push(p);
  }
  moi.prochesIds ??= []; if (moi.prochesIds.includes(p.id)) throw new ErreurProche('deja');
  moi.prochesIds.push(p.id); return p;
}
export function retirerProche(personneId: string, procheId: string) { const moi = personne(personneId); if (moi?.prochesIds) moi.prochesIds = moi.prochesIds.filter((i) => i !== procheId); }
export const proches = (personneId: string): Personne[] => (personne(personneId)?.prochesIds ?? []).map((i) => personne(i)).filter((p): p is Personne => !!p);
const compte = (b: { statut: string }) => b.statut === 'valide' || b.statut === 'scanne';
/** Ce que la personne a payé pour un proche (billets où il est le passager) et ce qu'il a payé pour elle. */
export function bilanProche(personneId: string, procheId: string) {
  const moi = personne(personneId), lui = personne(procheId); if (!moi || !lui) return { paye: 0, voyages: 0, recu: 0 };
  const tm = normaliserTel(moi.tel), tl = normaliserTel(lui.tel);
  const pour = app.monde.billets.filter((b) => compte(b) && b.acheteurId === personneId && normaliserTel(b.passager.tel) === tl && tl !== tm);
  const recu = app.monde.billets.filter((b) => compte(b) && b.acheteurId === procheId && normaliserTel(b.passager.tel) === tm);
  return { paye: pour.reduce((s, b) => s + b.prix, 0), voyages: pour.length, recu: recu.reduce((s, b) => s + b.prix, 0) };
}
export interface MouvementProche { id: string; ini: string; titre: string; sous: string; montant: number; ts: number }
/** Derniers billets payés pour un proche (−) ou par un proche pour la personne (+). */
export function mouvementsProches(personneId: string, max = 5): MouvementProche[] {
  const moi = personne(personneId); if (!moi) return []; const tm = normaliserTel(moi.tel), res: MouvementProche[] = [];
  for (const b of app.monde.billets.filter(compte)) {
    const d = departParId(b.departId), l = d && ligneDe(d), trajet = l ? `${l.de} → ${l.vers}` : 'Billet', date = jourCourt(jourDe(new Date(b.creeLe)));
    if (b.acheteurId === personneId && normaliserTel(b.passager.tel) !== tm) res.push({ id: b.id, ini: (b.passager.nom[0] ?? '?').toUpperCase(), titre: `Billet pour ${b.passager.nom} · ${trajet}`, sous: date, montant: -b.prix, ts: b.creeLe });
    else if (b.acheteurId !== personneId && normaliserTel(b.passager.tel) === tm) { const q = personne(b.acheteurId); res.push({ id: b.id, ini: ((q?.prenom[0] ?? '?') + (q?.nom[0] ?? '')).toUpperCase(), titre: `${q?.prenom ?? 'Un proche'} a payé ton billet`, sous: `${date} · ${trajet}`, montant: b.prix, ts: b.creeLe }); }
  }
  return res.sort((a, b) => b.ts - a.ts).slice(0, max);
}
export const totalPayePourEux = (personneId: string) => proches(personneId).reduce((s, p) => s + bilanProche(personneId, p.id).paye, 0);
/** Billets déjà utilisés ou dont le départ est arrivé : l'historique des voyages. */
export function voyagesPasses(personneId: string) {
  return billetsDe(personneId).filter((b) => b.statut === 'scanne' || (b.statut === 'valide' && departParId(b.departId)?.statut === 'arrive'));
}
export function billetsAVenir(personneId: string) {
  return billetsDe(personneId).filter((b) => b.statut === 'valide' && !['arrive', 'annule', 'parti'].includes(departParId(b.departId)?.statut ?? 'arrive'));
}

// ------------------------------------------------------------------ remise à zéro
/** Efface le monde de démonstration (billets, litiges, tranches…), garde la langue ; la session est fermée. */
export function effacerMondeDemo() { reinitialiser(); }
export { preferences };
