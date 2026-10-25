// Transactions du règlement, au-dessus de `domain/actions.ts` : tunnel billet (réserver → régler / refuser avec places gardées),
// covoiturage (réserver des places d'une offre), cagnotte « bus entier », partage de billet. Tout changement du monde passe ici.
import { DUREE_RESERVATION_MS } from '../../data/constantes.ts';
import { app, maintenant, aujourdhui, nouvelId } from '../../data/store.svelte.ts';
import { jourSemaineCourt, jourLong } from '../../core/dates.ts';
import { supplementSiege } from '../../core/sieges.ts';
import { fmtF } from '../../core/tarif.ts';
import { codeAffiche, echeanceAtteinte, limiteRemboursement, messageProche, partParPersonne, totalBusEntier, type InfosMessage, type TailleBus, TAILLES_BUS } from '../../core/reglement.ts';
import { compagnieDe, consigner, departParId, ligneDe, notifier, personne, prixDuDepart, regler, reserver } from '../../domain/actions.ts';
import type { Billet, Colis, MoyenPaiement, OffreCovoit, Paiement } from '../../domain/types.ts';
import { calculerRemise, type Remise } from '../../core/remise.ts';
import { placesRestantes } from '../../core/covoit.ts';
import { bonsDisponibles, preparerFidelite } from '../entree/actions.ts';
import { fideliteLue } from '../entree/etat.ts';
import { cagnotteDe } from '../route/etat.ts';
import { debiterCagnotte } from '../route/actions.ts';
import { brouillonVide, cagnotte, defautCagnotte, etat, type Brouillon, type Cagnotte, type Proche } from './etat.ts';

const ref = (moyen: string) => `${moyen.toUpperCase()}-${Math.floor(maintenant() / 1000) % 100000}`;
export const DUREE_GUICHET_MS = 2 * 3_600_000;

// ------------------------------------------------------------------ lectures
/** Moyen enregistré dans le domaine : « proche » dès que quelqu'un d'autre est impliqué dans le règlement. */
export const moyenDomaine = (b: Brouillon): MoyenPaiement => (b.qui === 'moi' ? b.moyen : 'proche');
export const paiementDe = (b: Brouillon | null): Paiement | undefined => (b?.paiementId ? app.monde.paiements.find((p) => p.id === b.paiementId) : undefined);
export const paiementActif = (p: Paiement | undefined, now = maintenant()): p is Paiement => !!p && p.statut === 'attente' && (p.expireLe ?? 0) > now;
/** Paiement en attente et encore valable d'un billet, sinon rien. */
export const paiementActifDe = (b: Billet, now = maintenant()): Paiement | undefined => { const p = app.monde.paiements.find((x) => x.id === b.paiementId); return paiementActif(p, now) ? p : undefined; };
export const billetsDuPaiement = (paiementId: string): Billet[] => app.monde.billets.filter((b) => b.paiementId === paiementId);
export const colisDuBrouillon = (b: Brouillon | null): Colis | undefined => (b?.colisId ? app.monde.colis.find((c) => c.id === b.colisId) : undefined);
export const offreCovoit = (id: string | null): OffreCovoit | undefined => (id ? app.monde.covoits.find((o) => o.id === id) : undefined);

/** Prix des places choisies : prix du départ + supplément de siège (première rangée d'un Classique). */
export function totalBillets(departId: string, sieges: string[]): number {
  const d = departParId(departId); if (!d) return 0; const classe = ligneDe(d).classe;
  const base = prixDuDepart(d);
  return sieges.reduce((s, id) => s + base + supplementSiege(classe, id), 0);
}
/** Montant du brouillon, quelle que soit sa nature. */
export function montantBrouillon(b: Brouillon): number {
  if (b.nature === 'colis') { const c = colisDuBrouillon(b); return c ? paiementActif(paiementDe(b)) ? paiementDe(b)!.montant : c.prix : 0; }
  if (b.nature === 'billet' && b.sansSiege) { const d = b.departId ? departParId(b.departId) : undefined; return d ? b.passagers.length * (b.prixUnitaire ?? prixDuDepart(d)) : 0; }
  if (b.nature === 'billet') return b.departId ? totalBillets(b.departId, b.sieges) : 0;
  if (b.nature === 'covoit') return (offreCovoit(b.covoitId)?.prix ?? 0) * b.places;
  return b.montant;
}
/** Sièges que le brouillon retient déjà (réservation en attente) : ils restent choisissables pour lui-même. */
export function siegesRetenus(b: Brouillon | null): string[] {
  const p = paiementDe(b); if (!paiementActif(p)) return [];
  return billetsDuPaiement(p.id).filter((x) => x.statut === 'attente_paiement').flatMap((x) => (x.siege ? [x.siege] : []));
}

// ------------------------------------------------------------------ tunnel billet
export function libererReservation(b: Brouillon, motif = 'Réservation modifiée') {
  const p = paiementDe(b); if (!p) return;
  if (p.pour.type === 'covoit') reglerCovoit(p.id, { refus: motif }); else regler(p.id, { refus: motif });
  b.paiementId = null;
}
/** Abandonne le tunnel : places libérées, brouillon effacé. */
export function abandonnerBrouillon() {
  const b = etat().brouillon; if (b) libererReservation(b, 'Annulé par le voyageur'); etat().brouillon = null;
}
/** Un siège par passager, `null` pour un billet sans siège (montée en route). */
const siegesDemandes = (b: Brouillon): (string | null)[] => (b.sansSiege ? b.passagers.map(() => null) : b.sieges);
const prixDemande = (b: Brouillon) => (b.sansSiege ? b.prixUnitaire : undefined);
const memesBillets = (bs: Billet[], b: Brouillon, acheteurId: string) =>
  bs.length === siegesDemandes(b).length && bs.every((x, i) => x.siege === siegesDemandes(b)[i] && x.passager.nom === b.passagers[i]?.nom && x.passager.tel === b.passagers[i]?.tel && x.acheteurId === acheteurId);

/**
 * Lance le paiement du brouillon : appelle `reserver()` (billets en attente 10 min), réserve des places de covoiturage ou ouvre l'attente d'une part de cagnotte.
 * Si la même réservation est déjà retenue, on la reprend en changeant seulement le moyen. Lève une `Error` dont le message est le code du domaine
 * (`siege_pris`, `complet`, `depart_ferme`…).
 */
export function lancerPaiement(b: Brouillon, acheteurId: string): void {
  const moyen = moyenDomaine(b), now = maintenant(); b.refus = null;
  if (b.nature === 'billet') {
    if (!b.departId) throw new Error('depart_inconnu');
    const p = paiementDe(b);
    if (paiementActif(p, now) && p.payeurId === acheteurId && memesBillets(billetsDuPaiement(p.id), b, acheteurId)) { p.moyen = moyen; p.ref = ref(moyen); appliquerAvantages(b, p); return; }
    if (paiementActif(p, now)) libererReservation(b);
    const r = reserver({ departId: b.departId, sieges: siegesDemandes(b), passagers: b.passagers, acheteurId, canal: 'app', moyen, prixUnitaire: prixDemande(b) });
    b.paiementId = r.paiement.id; appliquerAvantages(b, r.paiement);
  } else if (b.nature === 'covoit') {
    const p = paiementDe(b);
    if (paiementActif(p, now)) { p.moyen = moyen; p.ref = ref(moyen); return; }
    b.paiementId = reserverCovoit(b.covoitId ?? '', b.places, acheteurId, moyen).paiement.id;
  } else if (b.nature === 'colis') {
    const c = colisDuBrouillon(b); if (!c) throw new Error('colis_inconnu');
    if (c.statut === 'annule') throw new Error('colis_annule');
    const p = paiementDe(b);
    if (paiementActif(p, now)) { p.moyen = moyen; p.ref = ref(moyen); return; }
    b.paiementId = nouveauPaiementColis(c, moyen, acheteurId).id;
  } else { b.paiementId = null; b.montant = montantBrouillon(b); b.expireLe = now + DUREE_RESERVATION_MS; }
}

/** Le paiement est accepté : billets valides (ou places de covoiturage confirmées, ou part de cagnotte versée). */
export function confirmerPaiement(b: Brouillon): { ok: boolean; paiement?: Paiement } {
  if (b.nature === 'groupe') { payerPartCagnotte(); return { ok: true }; }
  const p = paiementDe(b); if (!p) return { ok: false };
  const r = b.nature === 'covoit' ? reglerCovoit(p.id, { ok: true }) : regler(p.id, { ok: true });
  if (r.statut !== 'ok') return { ok: false, paiement: r };
  if (b.nature === 'colis') { const c = colisDuBrouillon(b); if (c) { notifier(c.expediteurId, `Colis ${c.code} payé`, `${fmtF(r.montant)} réglés · dépose-le au guichet`, `/colis/suivi?colis=${c.id}`, 'colis'); consigner('vente', `Colis ${c.code} payé · ${r.montant} F`, c.expediteurId, c.id); } return { ok: true, paiement: r }; }
  consommerAvantages(r);
  if (b.nature === 'billet' && b.qui !== 'moi' && b.proche) envoyerMessageBrouillon(b);
  return { ok: true, paiement: r };
}
/**
 * Le paiement est refusé. Les billets passent « expirés » (domaine) ; tant que la réservation d'origine n'a pas expiré, on retient de nouveau
 * les mêmes places avec la même échéance, pour que le voyageur puisse réessayer sans les perdre.
 */
export function refuserPaiement(b: Brouillon, motif: string): void {
  const p = paiementDe(b), now = maintenant(), moyen = b.qui === 'moi' ? b.moyen : 'proche';
  b.refus = { motif, moyen, nature: b.nature, ts: now, departId: b.departId, paiementId: p?.id ?? null };
  if (b.nature === 'billet' && p) {
    const echeance = p.expireLe ?? 0; regler(p.id, { refus: motif }); b.paiementId = null;
    if (echeance > now && b.departId) {
      try { const r = reserver({ departId: b.departId, sieges: siegesDemandes(b), passagers: b.passagers, acheteurId: p.payeurId, canal: 'app', moyen: p.moyen, prixUnitaire: prixDemande(b) }); r.paiement.expireLe = echeance; b.paiementId = r.paiement.id; appliquerAvantages(b, r.paiement); } catch { /* places reprises entre-temps */ }
    }
  } else if (b.nature === 'covoit' && p) { reglerCovoit(p.id, { refus: motif }); b.paiementId = null; }
  else if (b.nature === 'colis' && p) { regler(p.id, { refus: motif }); b.paiementId = null; }
}
/** « Payer au guichet » : les places restent bloquées 2 h, paiement en espèces à la gare. Retourne les billets en attente. */
export function bloquerPourGuichet(b: Brouillon, acheteurId: string): Billet[] {
  if (b.nature !== 'billet' || !b.departId) throw new Error('demande_invalide');
  let p = paiementDe(b);
  if (!paiementActif(p)) { p = reserver({ departId: b.departId, sieges: siegesDemandes(b), passagers: b.passagers, acheteurId, canal: 'app', moyen: 'especes', prixUnitaire: prixDemande(b) }).paiement; b.paiementId = p.id; }
  p.moyen = 'especes'; p.ref = ref('especes'); p.expireLe = maintenant() + DUREE_GUICHET_MS; retirerAvantages(p);
  const bs = billetsDuPaiement(p.id), d = departParId(b.departId)!, g = app.monde.gares.find((x) => x.id === ligneDe(d).gareDe);
  notifier(p.payeurId, 'Places bloquées 2 h', `Paie en espèces à ${g?.nom ?? 'la gare'} avec le code ${bs.map((x) => codeAffiche(x.code)).join(', ')}`, '/pass', 'billet');
  consigner('reservation', `${bs.length} place(s) bloquée(s) 2 h pour paiement au guichet`, p.payeurId, d.id);
  b.refus = null; return bs;
}

// ------------------------------------------------------------------ avantages (bons de fidélité, cagnotte)
/** Ce que la voyageuse peut déduire d'un billet : montants de ses bons (non utilisés) et solde de sa cagnotte AfriMove. */
export const avantagesDe = (personneId: string | null | undefined) => ({ bons: personneId ? bonsDisponibles(personneId).map((x) => x.montant) : [], cagnotte: cagnotteDe(personneId) });
/** Remise prévue pour un brouillon de billet (aucune pour un covoiturage, une cagnotte de groupe, ni quand quelqu'un d'autre paie). */
export function remiseDe(b: Brouillon | null, personneId: string | null | undefined): Remise {
  if (!b || b.nature !== 'billet' || b.avantages === false || b.qui !== 'moi') return calculerRemise(0, [], 0);
  const a = avantagesDe(personneId); return calculerRemise(montantBrouillon(b), a.bons, a.cagnotte);
}
const brutDe = (p: Paiement) => billetsDuPaiement(p.id).reduce((s, x) => s + x.prix, 0);
function retirerAvantages(p: Paiement) { if (p.remise && !p.remise.consommee) { p.montant = brutDe(p); delete p.remise; } }
/** Fixe la remise sur le paiement en attente : `montant` devient le net encaissé par l'opérateur ; bons et cagnotte ne sont consommés qu'à l'acceptation. */
export function appliquerAvantages(b: Brouillon, p: Paiement) {
  if (p.pour.type !== 'billet') return;
  retirerAvantages(p);
  const brut = brutDe(p), a = avantagesDe(p.payeurId), r = b.avantages === false || b.qui !== 'moi' ? calculerRemise(0, [], 0) : calculerRemise(brut, a.bons, a.cagnotte);
  if (r.total <= 0) return;
  p.montant = brut - r.total; p.remise = { bon: r.bon, bonIds: bonsDisponibles(p.payeurId).slice(0, r.bons).map((x) => x.id), cagnotte: r.cagnotte };
}
/** Paiement accepté : les bons sont marqués utilisés et la cagnotte débitée (une seule fois). */
function consommerAvantages(p: Paiement) {
  const rm = p.remise; if (!rm || rm.consommee) return;
  preparerFidelite(p.payeurId); const bons = fideliteLue(p.payeurId)?.bons ?? [];
  for (const x of bons) if (rm.bonIds.includes(x.id)) x.utilise = true;
  if (rm.cagnotte > 0) debiterCagnotte(p.payeurId, rm.cagnotte);
  rm.consommee = true; consigner('fidelite', `Avantages utilisés : −${rm.bon + rm.cagnotte} F`, p.payeurId, p.id);
}

// ------------------------------------------------------------------ reprise d'un paiement en attente (/paiement?paiement=<id>)
export type IssueReprise = 'ok' | 'introuvable' | 'expire' | 'deja_regle';
/** Rouvre l'écran de paiement sur un paiement déjà créé ailleurs (montée en route, places bloquées au guichet…) : le brouillon reprend ses billets. */
export function reprendrePaiement(paiementId: string, personneId: string): IssueReprise {
  const p = app.monde.paiements.find((x) => x.id === paiementId), moi = personne(personneId);
  if (!p || !moi || p.payeurId !== personneId || p.pour.type === 'colis') return 'introuvable';
  if (p.statut === 'ok') return 'deja_regle';
  if (!paiementActif(p)) return 'expire';
  const e = etat(), a = e.brouillon; if (a?.paiementId === p.id) return 'ok';
  const moyen = p.moyen === 'om' || p.moyen === 'carte' || p.moyen === 'visage' ? p.moyen : 'momo';
  if (p.pour.type === 'covoit') {
    const o = offreCovoit(p.pour.ids[0] ?? null), res = o?.reservations.find((r) => r.paiementId === p.id); if (!o || !res) return 'introuvable';
    if (a) libererReservation(a); e.brouillon = brouillonVide({ nature: 'covoit', covoitId: o.id, places: res.places, moyen, tel: moi.tel, paiementId: p.id, expireLe: p.expireLe ?? 0 }); return 'ok';
  }
  const bs = billetsDuPaiement(p.id).filter((x) => x.statut === 'attente_paiement'); if (!bs.length) return 'introuvable';
  const sansSiege = bs.some((x) => !x.siege);
  if (a) libererReservation(a);
  e.brouillon = brouillonVide({ nature: 'billet', departId: bs[0].departId, sieges: sansSiege ? [] : bs.map((x) => x.siege!), passagers: bs.map((x) => x.passager), sansSiege, prixUnitaire: sansSiege ? bs[0].prix : undefined, moyen, tel: moi.tel, paiementId: p.id, expireLe: p.expireLe ?? 0 });
  return 'ok';
}

/** Nouveau paiement d'un colis (le précédent est refusé, expiré ou n'a jamais été ouvert) : 10 minutes pour valider. */
export function nouveauPaiementColis(c: Colis, moyen: MoyenPaiement, payeurId: string): Paiement {
  const now = maintenant(), p: Paiement = { id: nouvelId('pay'), ts: now, montant: c.prix, moyen, statut: 'attente', ref: ref(moyen), canal: 'app', payeurId, pour: { type: 'colis', ids: [c.id] }, expireLe: now + DUREE_RESERVATION_MS };
  app.monde.paiements.push(p); c.paiementId = p.id; return p;
}
export type IssueColis = 'ok' | 'introuvable' | 'deja_regle' | 'sans_paiement' | 'annule';
/** `/paiement?colis=<id>` : règle (ou règle de nouveau) le port d'un colis de la voyageuse ; un paiement refusé ou expiré est remplacé par un nouveau. */
export function reprendreColis(colisId: string, personneId: string): IssueColis {
  const c = app.monde.colis.find((x) => x.id === colisId), moi = personne(personneId);
  if (!c || !moi || c.expediteurId !== personneId) return 'introuvable';
  if (c.statut === 'annule') return 'annule';
  if (c.options.contreRemboursement) return 'sans_paiement';
  const p = app.monde.paiements.find((x) => x.id === c.paiementId); if (p?.statut === 'ok') return 'deja_regle';
  const e = etat(), a = e.brouillon; if (a?.nature === 'colis' && a.colisId === c.id) return 'ok';
  if (a) libererReservation(a);
  const moyen = p?.moyen === 'om' || p?.moyen === 'carte' || p?.moyen === 'visage' ? p.moyen : 'momo';
  e.brouillon = brouillonVide({ nature: 'colis', colisId: c.id, moyen, tel: moi.tel, paiementId: paiementActif(p) ? p!.id : null, expireLe: paiementActif(p) ? p!.expireLe ?? 0 : 0 });
  return 'ok';
}

// ------------------------------------------------------------------ covoiturage
export function reserverCovoit(offreId: string, places: number, voyageurId: string, moyen: MoyenPaiement): { paiement: Paiement; offre: OffreCovoit } {
  const o = offreCovoit(offreId); if (!o) throw new Error('offre_inconnue');
  if (o.statut !== 'ouverte') throw new Error('offre_fermee');
  if (!Number.isInteger(places) || places < 1) throw new Error('demande_invalide');
  if (places > placesRestantes(o)) throw new Error('complet'); // `o.places` est la capacité de l'offre ; les places prises sont dans `reservations`
  const now = maintenant(), pid = nouvelId('pay');
  const paiement: Paiement = { id: pid, ts: now, montant: o.prix * places, moyen, statut: 'attente', ref: ref(moyen), canal: 'app', payeurId: voyageurId, pour: { type: 'covoit', ids: [o.id] }, expireLe: now + DUREE_RESERVATION_MS };
  o.reservations.push({ voyageurId, places, paiementId: pid }); app.monde.paiements.push(paiement);
  return { paiement, offre: o };
}
/** Règle un paiement de covoiturage : accepté (places confirmées, conducteur prévenu) ou refusé / expiré (places rendues à l'offre). */
export function reglerCovoit(paiementId: string, issue: { ok: true } | { refus: string }): Paiement {
  const p = app.monde.paiements.find((x) => x.id === paiementId); if (!p || p.pour.type !== 'covoit') throw new Error('paiement_inconnu');
  if (p.statut !== 'attente') return p;
  const o = offreCovoit(p.pour.ids[0] ?? null), res = o?.reservations.find((r) => r.paiementId === p.id);
  const expire = (p.expireLe ?? 0) < maintenant();
  if ('ok' in issue && !expire) {
    p.statut = 'ok';
    if (o && res) {
      const c = personne(o.conducteurId);
      notifier(p.payeurId, 'Covoiturage confirmé', `${o.de} → ${o.vers} · ${o.jour} ${o.heure} · ${res.places} place${res.places > 1 ? 's' : ''} avec ${c?.prenom ?? 'ton conducteur'}`, '/covoit', 'covoit');
      notifier(o.conducteurId, 'Nouvelle réservation', `${personne(p.payeurId)?.prenom ?? 'Un voyageur'} · ${res.places} place${res.places > 1 ? 's' : ''}`, '/conducteur', 'covoit');
      consigner('vente', `Covoiturage ${o.de}→${o.vers} ${o.heure} · ${res.places} place(s) · ${p.montant} F`, p.payeurId, o.id);
    }
    return p;
  }
  p.statut = 'refuse'; p.motif = 'ok' in issue ? 'Réservation expirée' : issue.refus;
  if (o && res) o.reservations = o.reservations.filter((r) => r.paiementId !== p.id);
  return p;
}

// ------------------------------------------------------------------ proche : messages et partages
export function infosMessage(b: Brouillon, billets: Billet[] = []): InfosMessage | null {
  const d = b.departId ? departParId(b.departId) : undefined; if (!d) return null;
  const l = ligneDe(d), aicha = personne('p-aicha'), sieges = billets.length ? billets.map((x) => x.siege).filter(Boolean) : b.sieges;
  return {
    payeur: aicha?.prenom ?? 'Un proche', voyageur: aicha?.prenom ?? 'Un proche', trajet: `${l.de} → ${l.vers}`,
    quand: `${compagnieDe(d).nom} ${jourSemaineCourt(d.jour)} ${d.heure}`, places: sieges.length ? `${sieges.length > 1 ? 'places' : 'place'} ${sieges.join(', ')}` : 'place libre',
    code: billets.length ? codeAffiche(billets[0].code) : 'AM-····-··', montant: fmtF(montantBrouillon(b))
  };
}
/** Au règlement d'un billet « pour un proche » : le proche reçoit son billet ; quand un proche a payé pour moi, je suis prévenue. */
export function envoyerMessageBrouillon(b: Brouillon) {
  const p = paiementDe(b); if (!p || !b.proche) return;
  const bs = billetsDuPaiement(p.id), i = infosMessage(b, bs); if (!i) return;
  if (b.qui === 'paie_pour') enregistrerPartage(b.proche, messageProche('paie', i, b.proche.nom), 'whatsapp', bs[0]?.id);
  else if (b.qui === 'demande') notifier('p-aicha', `${b.proche.nom} a payé ton billet`, `${i.trajet} · ${i.quand} · ${i.places}`, '/pass', 'billet');
}
/** Envoie la demande de paiement (« peux-tu payer mon billet ? ») au proche, par WhatsApp ou SMS (simulé). */
export function envoyerDemande(b: Brouillon, canal: 'whatsapp' | 'sms'): string | null {
  const i = infosMessage(b); if (!i || !b.proche) return null;
  const texte = messageProche('demande', i, b.proche.nom); enregistrerPartage(b.proche, texte, canal); return texte;
}
export function enregistrerPartage(vers: Proche, texte: string, canal: 'whatsapp' | 'sms', billetId?: string) {
  etat().partages.unshift({ ts: maintenant(), versNom: vers.nom, versTel: vers.tel, canal, texte, billetId });
  if (vers.id) notifier(vers.id, 'Message AfriMove', texte, '/pass', 'billet');
  consigner('message', `${canal === 'whatsapp' ? 'WhatsApp' : 'SMS'} simulé à ${vers.nom}`, 'p-aicha', billetId);
}
/** Texte du message de partage d'un billet. */
export function texteBilletPartage(b: Billet, destinataire: string): string {
  const d = departParId(b.departId)!, l = ligneDe(d);
  return messageProche('partage', {
    payeur: personne('p-aicha')?.prenom ?? 'Un proche', voyageur: personne('p-aicha')?.prenom ?? 'Un proche', trajet: `${l.de} → ${l.vers}`,
    quand: `${compagnieDe(d).nom} ${jourSemaineCourt(d.jour)} ${d.heure}`, places: b.siege ? `place ${b.siege}` : 'place libre', code: codeAffiche(b.code), montant: fmtF(b.prix)
  }, destinataire);
}
/** Partage d'un billet avec un proche : message avec le code, le billet reste au nom du passager. */
export function partagerBillet(billetId: string, proche: Proche, canal: 'whatsapp' | 'sms' = 'whatsapp', texteFourni?: string): string {
  const b = app.monde.billets.find((x) => x.id === billetId); if (!b) throw new Error('billet_inconnu');
  const texte = texteFourni ?? texteBilletPartage(b, proche.nom); enregistrerPartage(proche, texte, canal, b.id); return texte;
}
/** Un paiement terminé n'a plus de brouillon : on repart de zéro au prochain choix de place. */
export function purgerBrouillonTermine() { const e = etat(); const b = e.brouillon; if (b && paiementDe(b)?.statut === 'ok') e.brouillon = null; }

// ------------------------------------------------------------------ cagnotte « bus entier »
export const totalCagnotte = (c: Cagnotte) => totalBusEntier(c.taille);
export const partCagnotte = (c: Cagnotte) => partParPersonne(totalBusEntier(c.taille), c.taille);
export const nbPayes = (c: Cagnotte) => c.participants.filter((p) => p.paye && !p.rembourse).length;
export const maPart = (c: Cagnotte) => c.participants.find((p) => p.moi);
export const taillePossible = (c: Cagnotte, t: TailleBus) => TAILLES_BUS.includes(t) && nbPayes(c) === 0 && c.statut !== 'complete' && c.statut !== 'remboursee';
export function choisirTaille(t: TailleBus): boolean { const c = cagnotte(); if (!taillePossible(c, t)) return false; c.taille = t; return true; }
export function renommerCagnotte(motif: string, jour: string) { const c = cagnotte(); if (c.statut === 'complete' || c.statut === 'remboursee') return; c.motif = motif.trim() || c.motif; if (jour) c.jour = jour; }
/** Ouvre la cagnotte et « envoie » le lien sur WhatsApp (simulé). */
export function partagerCagnotte(): string {
  const c = cagnotte(); if (c.statut === 'brouillon') { c.statut = 'ouverte'; c.creeLe = maintenant(); consigner('groupe', `Cagnotte « ${c.motif} » ouverte · bus ${c.taille} places`, 'p-aicha'); }
  if (!c.lien) c.lien = `afrimove.app/g/${Math.floor(maintenant() / 1000).toString(36).slice(-5).toUpperCase()}`;
  c.envoyeLe = maintenant(); return messageCagnotte(c);
}
export const messageCagnotte = (c: Cagnotte) => `AfriMove : Aïcha organise « ${c.motif} » le ${jourLong(c.jour)} — bus de ${c.taille} places. Ta part : ${fmtF(partCagnotte(c))}. Paie en MoMo ou Orange Money : ${c.lien || 'afrimove.app/g/…'} (ou *123# → 5). Remboursé si le bus n'est pas plein le ${jourLong(limiteRemboursement(c.jour))}.`;
export function payerPartCagnotte(): boolean {
  const c = cagnotte(), moi = maPart(c); if (!moi || moi.paye || c.statut === 'complete' || c.statut === 'remboursee') return false;
  if (c.statut === 'brouillon') partagerCagnotte();
  moi.paye = true; moi.ts = maintenant(); consigner('groupe', `Part payée ${partCagnotte(c)} F · cagnotte « ${c.motif} »`, 'p-aicha');
  notifier('p-aicha', 'Part de la cagnotte payée', `${fmtF(partCagnotte(c))} pour « ${c.motif} » · ${nbPayes(c)}/${c.taille} parts`, '/groupe', 'groupe');
  verifierCagnotte(); return true;
}
const NOMS_DEMO = ['Marie', 'Paul', 'Sandrine', 'Moussa', 'Aminata', 'Boris', 'Clarisse', 'Joseph', 'Nadège', 'Samuel', 'Brigitte', 'Mado', 'Fatou', 'Ibrahim', 'Émile', 'Youssouf'];
/** Démonstration : un participant de plus règle sa part. */
export function ajouterParticipantDemo(): boolean {
  const c = cagnotte(); if (c.statut === 'complete' || c.statut === 'remboursee' || c.participants.length >= c.taille) return false;
  if (c.statut === 'brouillon') partagerCagnotte();
  const n = c.participants.length; c.participants.push({ id: nouvelId('g'), nom: NOMS_DEMO[n % NOMS_DEMO.length], paye: true, ts: maintenant() });
  verifierCagnotte(); return true;
}
/** Bus plein → réservé ; sinon, à J-2 du voyage, chacun est remboursé. */
export function verifierCagnotte(): Cagnotte['statut'] {
  const c = cagnotte();
  if (c.statut === 'complete' || c.statut === 'remboursee' || c.statut === 'brouillon') return c.statut;
  if (nbPayes(c) >= c.taille) {
    c.statut = 'complete'; notifier('p-aicha', 'Bus entier réservé', `« ${c.motif} » · ${c.taille} places · ${jourLong(c.jour)}`, '/groupe', 'groupe');
    consigner('groupe', `Cagnotte « ${c.motif} » complète : bus de ${c.taille} places réservé`, 'p-aicha');
  } else if (echeanceAtteinte(c.jour, aujourdhui())) {
    const payes = c.participants.filter((p) => p.paye); c.rembourse = payes.length * partCagnotte(c);
    for (const p of payes) p.rembourse = true;
    c.statut = 'remboursee'; notifier('p-aicha', 'Cagnotte non complète : remboursement', `${payes.length} part(s) remboursée(s), ${fmtF(c.rembourse)} au total`, '/groupe', 'groupe');
    consigner('groupe', `Cagnotte « ${c.motif} » non complète à J-2 : ${fmtF(c.rembourse)} remboursés`, 'p-aicha');
  }
  return c.statut;
}
export function recommencerCagnotte() { Object.assign(cagnotte(), defautCagnotte()); }
