// Transactions du guichet, bâties sur les primitives de domain/actions.ts : ouverture et clôture de caisse, vente, cadence, colis, dépôt prépayé, remboursement.
import { aujourdhui, app, maintenant } from '../../data/store.svelte.ts';
import { annulerBillet, avancerColis, billetParId, caisseOuverte, consigner, creerColis, departEnMs, equipeDe, gare, ligneDe, notifier, ouvrirCaisse, personne, personneCourante, placesLibres, regler, reserver, type ResultatReservation } from '../../domain/actions.ts';
import type { Billet, Caisse, Colis, Depart, MoyenPaiement, Paiement, Passager, Personne } from '../../domain/types.ts';
import { evaluerEcart, totalCompte } from '../../core/caisse.ts';
import { TAILLES, prixColis } from '../../core/colis.ts';
import { supplementSiege } from '../../core/sieges.ts';
import { remboursement as calculRemboursement } from '../../core/tarif.ts';
import { attenduGuichet, cadenceParMinute, codeBilletSaisi, normaliserCodeColis, normaliserTel, rendu, supplementTaille, type PiecesCaisse } from '../../core/guichet.ts';
import { etat } from './etat.ts';

/** Délai pendant lequel une vente peut être annulée d'un geste (erreur de touche). */
export const DELAI_ANNULATION_VENTE_MS = 10 * 60_000;
function erreur(code: string): never { throw new Error(code); }

// ------------------------------------------------------------------ qui est à l'écran
/** L'agent dont on voit le guichet : soi-même si on est agent de guichet ; sinon (superviseur, patron) l'agent de la gare, en lecture seule. */
export function contexte(): { agent: Personne | undefined; lecture: boolean } {
  const moi = personneCourante();
  if (moi?.role === 'guichet') return { agent: moi, lecture: false };
  const equipe = moi?.gareId ? equipeDe(moi.gareId, 'guichet') : app.monde.personnes.filter((p) => p.role === 'guichet');
  return { agent: equipe[0] ?? app.monde.personnes.find((p) => p.role === 'guichet'), lecture: true };
}
function agentGuichet(agentId: string): Personne { const p = personne(agentId); if (!p || p.role !== 'guichet') return erreur('droit_refuse'); return p; }
function caisseDe(agentId: string): Caisse { return caisseOuverte(agentId) ?? erreur('caisse_fermee'); }
const debutDuJour = () => new Date(`${aujourdhui()}T00:00:00`).getTime();
const moyenDe = (b: Billet) => app.monde.paiements.find((p) => p.id === b.paiementId)?.moyen;
const valide = (b: Billet) => b.statut === 'valide' || b.statut === 'scanne';

// ------------------------------------------------------------------ départs de la gare
/** Prochains départs de la gare (aujourd'hui, puis demain si la journée est finie), du plus proche au plus lointain. */
export function departsDeLaGare(gareId: string, max = 8): Depart[] {
  const auj = aujourdhui();
  return app.monde.departs.filter((d) => ligneDe(d).gareDe === gareId && (d.statut === 'prevu' || d.statut === 'embarquement') && d.jour >= auj)
    .sort((a, b) => departEnMs(a) - departEnMs(b)).slice(0, max);
}
/** Prochains départs de la gare vers une ville. */
export const departsVers = (gareId: string, ville: string, max = 4) => departsDeLaGare(gareId, 200).filter((d) => ligneDe(d).vers === ville).slice(0, max);
export const nomDepart = (d: Depart) => { const l = ligneDe(d); return `${l.vers}${l.classe === 'VIP' ? ' VIP' : ''}`; };
export const nomGare = (id: string | undefined) => { const g = id ? gare(id) : undefined; return g ? `${g.ville} · ${g.nom}` : ''; };

// ------------------------------------------------------------------ caisse
/** Billets vendus par une caisse. */
export const billetsDeCaisse = (caisseId: string) => app.monde.billets.filter((b) => b.caisseId === caisseId);
export const colisDeCaisse = (caisseId: string) => app.monde.colis.filter((c) => c.caisseId === caisseId && c.statut !== 'annule');
export function piecesCaisse(c: Caisse): PiecesCaisse {
  const e = etat(), bs = billetsDeCaisse(c.id).filter((b) => moyenDe(b) === 'especes' && (valide(b) || b.statut === 'rembourse'));
  return {
    fond: c.fond, billetsEspeces: bs.reduce((s, b) => s + b.prix, 0), colisEspeces: colisDeCaisse(c.id).reduce((s, x) => s + x.prix, 0),
    supplements: e.supplements.filter((x) => x.caisseId === c.id).reduce((s, x) => s + x.montant, 0), remboursements: e.remboursements.filter((x) => x.caisseId === c.id).reduce((s, x) => s + x.montant, 0)
  };
}
/** Espèces attendues en caisse. Écart avec `attenduDeCaisse` (domain) : le billet remboursé reste encaissé et le remboursement se déduit une seule fois ; les suppléments de colis comptent. */
export const attenduDeLaCaisse = (c: Caisse) => attenduGuichet(piecesCaisse(c));
export function resumeCaisse(c: Caisse) {
  const bs = billetsDeCaisse(c.id).filter(valide), p = piecesCaisse(c);
  return {
    attendu: attenduGuichet(p), fond: c.fond, billets: bs.length, colis: colisDeCaisse(c.id).length,
    especes: bs.filter((b) => moyenDe(b) === 'especes').reduce((s, b) => s + b.prix, 0) + p.colisEspeces + p.supplements, mobile: bs.filter((b) => moyenDe(b) !== 'especes').reduce((s, b) => s + b.prix, 0)
  };
}
export function ouvrirLaCaisse(agentId: string, fond: number): Caisse {
  agentGuichet(agentId);
  if (!Number.isInteger(fond) || fond < 0 || fond > 500_000) erreur('fond_invalide');
  return ouvrirCaisse(agentId, fond);
}
export interface DemandeCloture { agentId: string; caisseId: string; compte: Record<string, number>; justification?: string; /** Miniature (data URL) du bordereau de dépôt. */ bordereau?: string }
/** Clôture : comptage par coupure, écart (≤ 1 000 F toléré, sinon validation du superviseur), bordereau obligatoire si la règle est active. */
export function cloturerCaisse(r: DemandeCloture) {
  agentGuichet(r.agentId);
  const c = app.monde.caisses.find((x) => x.id === r.caisseId); if (!c || c.statut !== 'ouverte' || c.agentId !== r.agentId) return erreur('caisse_non_ouverte');
  const att = attenduDeLaCaisse(c), ev = evaluerEcart(totalCompte(r.compte), att), justification = r.justification?.trim();
  if (ev.niveau !== 'juste' && !justification) erreur('justification_requise');
  if (app.monde.params.regles.bordereau && !r.bordereau) erreur('bordereau_requis');
  if (r.bordereau) etat().bordereaux[c.id] = r.bordereau;
  Object.assign(c, { statut: 'fermee', fermeeA: maintenant(), compte: { ...r.compte }, attendu: att, ecart: ev.montant, justification });
  consigner('caisse', `Fermeture de caisse · écart ${ev.montant} F`, c.agentId, c.id);
  if (ev.niveau !== 'juste') for (const s of app.monde.personnes.filter((p) => p.role === 'superviseur' && p.gareId === c.gareId)) notifier(s.id, 'Clôture à valider', `${personne(c.agentId)?.prenom} · écart ${ev.montant.toLocaleString('fr-FR')} F`, '/superviseur/valider', 'caisse');
  return { caisse: c, ...ev };
}
/** Dernière caisse de l'agent (ouverte, sinon la plus récente). */
export const derniereCaisse = (agentId: string): Caisse | undefined => app.monde.caisses.filter((c) => c.agentId === agentId).sort((a, b) => b.ouvertA - a.ouvertA).sort((a, b) => Number(b.statut === 'ouverte') - Number(a.statut === 'ouverte'))[0];

// ------------------------------------------------------------------ vente
/** Prix d'une vente : tarif du départ (ou négocié) + supplément de place. */
export const totalVente = (d: Depart, sieges: (string | null)[], prixUnitaire?: number) => sieges.reduce((s, siege) => s + (prixUnitaire ?? d.prix) + (siege ? supplementSiege(ligneDe(d).classe, siege) : 0), 0);
export interface DemandeVente { agentId: string; departId: string; sieges: (string | null)[]; passagers: Passager[]; moyen: 'especes' | 'momo' | 'om'; prixUnitaire?: number; /** Espèces reçues (par défaut : le juste prix). */ recu?: number }
function notifierVoyageur(billets: Billet[]) {
  const d = app.monde.departs.find((x) => x.id === billets[0].departId); if (!d) return; const l = ligneDe(d);
  for (const tel of new Set(billets.map((b) => b.passager.tel))) { const v = app.monde.personnes.find((p) => p.role === 'voyageur' && p.tel === tel); if (v) notifier(v.id, 'Billet confirmé', `${l.de} → ${l.vers} · ${d.jour} ${d.heure} · acheté au guichet`, '/pass', 'billet'); }
}
function enregistrerVente(agentId: string, res: ResultatReservation, recu?: { recu: number; rendu: number }) {
  const e = etat(), ids = res.billets.map((b) => b.id);
  if (recu) e.recus[res.paiement.id] = recu;
  e.annulables.push(ids); if (e.annulables.length > 20) e.annulables.shift();
  if (app.session.hors_ligne) e.aSynchroniser.push(...ids);
  if (res.paiement.statut === 'ok') notifierVoyageur(res.billets);
}
/** Vend des billets au guichet. Espèces : valides tout de suite ; MoMo / OM : paiement en attente (le passager valide sur son téléphone). */
export function vendre(r: DemandeVente): ResultatReservation & { recu: number; rendu: number } {
  agentGuichet(r.agentId); const caisse = caisseDe(r.agentId), d = app.monde.departs.find((x) => x.id === r.departId); if (!d) return erreur('depart_inconnu');
  if (r.moyen !== 'especes' && app.session.hors_ligne) erreur('hors_ligne');
  const du = totalVente(d, r.sieges, r.prixUnitaire), recu = r.moyen === 'especes' ? (r.recu ?? du) : du, monnaie = rendu(recu, du);
  if (monnaie === null) return erreur('recu_insuffisant');
  const res = reserver({ departId: r.departId, sieges: r.sieges, passagers: r.passagers, acheteurId: r.agentId, canal: 'guichet', moyen: r.moyen as MoyenPaiement, prixUnitaire: r.prixUnitaire, caisseId: caisse.id });
  enregistrerVente(r.agentId, res, r.moyen === 'especes' ? { recu, rendu: monnaie } : undefined);
  return { ...res, recu, rendu: monnaie };
}
/** Issue d'un paiement MoMo / OM en attente. */
export function finaliserPaiement(agentId: string, paiementId: string, issue: { ok: true } | { refus: string }): Paiement {
  agentGuichet(agentId); const p = regler(paiementId, issue);
  if (p.statut === 'ok') notifierVoyageur(app.monde.billets.filter((b) => b.paiementId === p.id));
  return p;
}
/** Paiements MoMo / OM encore en attente pour les ventes de cet agent. */
export const paiementsEnAttente = (agentId: string): Paiement[] => app.monde.paiements.filter((p) => p.statut === 'attente' && p.canal === 'guichet' && p.payeurId === agentId && p.pour.type === 'billet' && (p.expireLe ?? 0) > maintenant());
/** Vente tout juste faite : annulation d'un geste, l'argent est rendu (aucun frais). Retourne le montant, ou null s'il n'y a rien d'annulable. */
export function annulerDerniereVente(agentId: string): { montant: number; billets: number } | null {
  agentGuichet(agentId); const caisse = caisseDe(agentId), e = etat();
  while (e.annulables.length) {
    const ids = e.annulables.pop()!, bs = ids.map((i) => billetParId(i)).filter((b): b is Billet => !!b);
    if (!bs.length || bs.some((b) => b.caisseId !== caisse.id || (b.statut !== 'valide' && b.statut !== 'attente_paiement') || maintenant() - b.creeLe > DELAI_ANNULATION_VENTE_MS)) continue;
    const p = app.monde.paiements.find((x) => x.id === bs[0].paiementId), montant = bs.reduce((s, b) => s + b.prix, 0);
    for (const b of bs) { b.statut = 'annule'; b.annuleLe = maintenant(); }
    if (p) p.statut = p.statut === 'ok' ? 'rembourse' : 'refuse';
    e.aSynchroniser = e.aSynchroniser.filter((i) => !ids.includes(i));
    consigner('annulation', `Vente annulée au guichet · ${bs.length} billet(s) · ${montant} F`, agentId, bs[0].paiementId);
    return { montant, billets: bs.length };
  }
  return null;
}
/** Passe de nouveau en ligne : les ventes faites hors ligne sont synchronisées. */
export function synchroniser(): number { const e = etat(), n = e.aSynchroniser.length; e.aSynchroniser = []; e.derniereSync = maintenant(); return n; }
export function basculerReseau(): { ligne: boolean; synchronises: number } { app.session.hors_ligne = !app.session.hors_ligne; return { ligne: !app.session.hors_ligne, synchronises: app.session.hors_ligne ? 0 : synchroniser() }; }
/** Billet imprimé : compte une impression (1 = original, 2 = copie 2…). */
export function compterImpression(cle: string): number { const e = etat(); e.copies[cle] = (e.copies[cle] ?? 0) + 1; return e.copies[cle]; }

// ------------------------------------------------------------------ cadence
export const cadenceActive = () => !!app.monde.params.regles.cadence;
/** Une touche = un ou plusieurs billets sans siège, en espèces, au tarif du départ. */
export function vendreCadence(agentId: string, departId: string, quantite = 1): ResultatReservation {
  if (!cadenceActive()) erreur('cadence_desactivee');
  agentGuichet(agentId); const caisse = caisseDe(agentId), n = Math.max(1, Math.min(10, Math.floor(quantite)));
  const res = reserver({ departId, sieges: Array(n).fill(null), passagers: Array.from({ length: n }, () => ({ nom: 'Sans nom', tel: '' })), acheteurId: agentId, canal: 'guichet', moyen: 'especes', caisseId: caisse.id });
  enregistrerVente(agentId, res, { recu: res.paiement.montant, rendu: 0 }); return res;
}
/** Billets cadence (sans siège) d'une caisse, dans l'ordre de vente. */
export const billetsCadence = (caisseId: string) => billetsDeCaisse(caisseId).filter((b) => b.siege === null && valide(b)).sort((a, b) => a.creeLe - b.creeLe);
export function statsCadence(agentId: string) {
  const c = caisseOuverte(agentId), bs = c ? billetsCadence(c.id) : [], premier = bs[0]?.creeLe ?? maintenant();
  return { depuis: c?.ouvertA ?? maintenant(), billets: bs.length, encaisse: bs.reduce((s, b) => s + b.prix, 0), parMinute: cadenceParMinute(bs.length, (maintenant() - premier) / 60_000) };
}
/** Compte une montée (ou la retire) au quai, entre 0 et la capacité. */
export function compterMontee(departId: string, delta: number, capacite: number): number { const e = etat(); e.montes[departId] = Math.max(0, Math.min(capacite, (e.montes[departId] ?? 0) + delta)); return e.montes[departId]; }
/** Passagers attendus : places occupées (billets du monde et places prises ailleurs). */
export const vendusDuDepart = (d: Depart) => d.capacite - placesLibres(d);
export function enregistrerComptage(agentId: string, d: Depart) { const m = etat().montes[d.id] ?? 0; consigner('quai', `Comptage cadence ${d.heure} ${nomDepart(d)} : ${m} montés / ${vendusDuDepart(d)} vendus`, agentId, d.id); }

// ------------------------------------------------------------------ colis au guichet
export interface DemandeColisGuichet { agentId: string; expediteur: Passager; destinataire: Passager; taille: keyof typeof TAILLES; options: { moto: boolean; assurance: boolean }; /** Ville d'arrivée. */ vers: string; relaisId?: string; departId?: string }
/** Enregistre un colis, l'encaisse en espèces dans la caisse et le dépose tout de suite (il part avec le prochain bus). */
export function enregistrerColis(r: DemandeColisGuichet): Colis {
  const agent = agentGuichet(r.agentId), caisse = caisseDe(r.agentId), tel = normaliserTel(r.destinataire.tel);
  if (!r.destinataire.nom.trim() || !tel) erreur('destinataire_invalide');
  const telExp = normaliserTel(r.expediteur.tel), voyageur = telExp ? app.monde.personnes.find((p) => p.role === 'voyageur' && p.tel === telExp) : undefined;
  const g = gare(agent.gareId ?? ''), arrivee = app.monde.lignes.find((l) => l.gareDe === agent.gareId && l.vers === r.vers), relais = r.relaisId ? personne(r.relaisId) : undefined;
  const depart = `${g?.ville ?? ''} · ${g?.nom ?? ''}`, remise = relais ? `relais Chez ${relais.prenom}` : (arrivee?.gareVers ? gare(arrivee.gareVers)?.nom : '') ?? '';
  const { colis } = creerColis({ expediteurId: voyageur?.id ?? agent.id, destinataire: { nom: r.destinataire.nom.trim(), tel }, taille: r.taille, options: { ...r.options, contreRemboursement: false }, depart, arrivee: `${r.vers} · ${remise}`, relaisId: r.relaisId, moyen: 'especes', canal: 'guichet', caisseId: caisse.id });
  etat().expediteurs[colis.id] = { nom: r.expediteur.nom.trim() || 'Client du guichet', tel: telExp ?? '' };
  if (r.departId) colis.departId = r.departId;
  avancerColis(colis.id, 'depose', colis.depart, r.agentId); return colis;
}
/** Point relais de la ville d'arrivée (le seed en compte un seul, à Douala). */
export const relaisDe = (ville: string) => app.monde.personnes.filter((p) => p.role === 'relais' && p.actif && (p.zone ?? '').startsWith(ville));
export const prixDuColis = (taille: keyof typeof TAILLES, o: { moto: boolean; assurance: boolean }) => prixColis(taille, o);

// ------------------------------------------------------------------ dépôt d'un colis prépayé
export type LectureColis = { ok: true; colis: Colis; paye: Paiement } | { ok: false; raison: string };
/** Cherche un colis par son code (AM-C-…) et vérifie qu'il est prêt à être déposé : créé, payé dans l'app. */
export function lireColis(texte: string): LectureColis {
  const code = normaliserCodeColis(texte); if (!code) return { ok: false, raison: 'Ce n’est pas un code de colis (AM-C-…)' };
  const c = app.monde.colis.find((x) => x.code === code); if (!c) return { ok: false, raison: `Colis ${code} introuvable` };
  if (c.statut === 'annule') return { ok: false, raison: 'Ce colis a été annulé' };
  if (c.statut !== 'cree') return { ok: false, raison: `Colis déjà déposé · ${c.etapes.find((e) => e.statut === 'depose')?.lieu ?? c.statut}` };
  const p = app.monde.paiements.find((x) => x.id === c.paiementId);
  if (!p) return { ok: false, raison: 'Colis en contre-remboursement : pas de paiement dans l’app, crée-le au guichet' };
  if (p.statut !== 'ok') return { ok: false, raison: p.statut === 'attente' ? 'Paiement MoMo / OM encore en attente : demande au client de valider' : 'Paiement refusé : le colis n’est pas prépayé' };
  return { ok: true, colis: c, paye: p };
}
/** Dépose le colis prépayé. Plus gros que déclaré : la taille est corrigée et le supplément encaissé en espèces dans la caisse. */
export function deposerColisPrepaye(agentId: string, colisId: string, tailleReelle?: keyof typeof TAILLES): { colis: Colis; supplement: number } {
  const agent = agentGuichet(agentId), c = app.monde.colis.find((x) => x.id === colisId); if (!c) return erreur('colis_inconnu');
  const lu = lireColis(c.code); if (!lu.ok) throw new Error('colis_inconnu');
  const reelle = tailleReelle ?? c.taille, sup = supplementTaille(c.taille, reelle, c.options), caisse = sup > 0 ? caisseDe(agentId) : undefined;
  if (caisse) { c.taille = reelle; c.prix += sup; etat().supplements.push({ caisseId: caisse.id, colisId: c.id, montant: sup, ts: maintenant() }); consigner('colis', `Supplément colis ${c.code} : ${sup} F en espèces`, agentId, c.id); }
  if (!c.departId) c.departId = departsVers(agent.gareId ?? '', c.arrivee.split(' · ')[0], 1)[0]?.id;
  avancerColis(c.id, 'depose', c.depart || nomGare(agent.gareId), agentId); return { colis: c, supplement: sup };
}

// ------------------------------------------------------------------ remboursement au guichet
export type LectureBillet = { billet: Billet; depart: Depart; moyen: MoyenPaiement | undefined; especes: boolean; /** Remboursement déjà accordé (départ annulé…) mais pas encore rendu en espèces. */ dejaAccorde: boolean; apercu: ReturnType<typeof calculRemboursement> } | null;
export function lireBillet(texte: string): LectureBillet {
  const code = codeBilletSaisi(texte), b = app.monde.billets.find((x) => x.code === code); if (!b) return null;
  const d = app.monde.departs.find((x) => x.id === b.departId)!, moyen = moyenDe(b), especes = moyen === 'especes';
  const rendu = etat().remboursements.some((x) => x.billetId === b.id);
  return { billet: b, depart: d, moyen, especes, dejaAccorde: b.statut === 'rembourse' && especes && !rendu, apercu: calculRemboursement(b.prix, (departEnMs(d) - maintenant()) / 60_000) };
}
/** Rembourse un billet (frais de service si c'est le voyageur qui renonce) ; en espèces, la somme rendue sort de la caisse ouverte. */
export function rembourserAuGuichet(agentId: string, billetId: string): { rembourse: number; frais: number; especes: boolean } {
  agentGuichet(agentId); const b = billetParId(billetId); if (!b) return erreur('billet_inconnu');
  const especes = moyenDe(b) === 'especes', caisse = especes ? caisseDe(agentId) : undefined;
  let montant: number, frais = 0;
  if (b.statut === 'rembourse') { if (!especes || etat().remboursements.some((x) => x.billetId === b.id)) throw new Error('Billet non remboursable'); montant = b.prix; }
  else { const r = annulerBillet(billetId); if (!r.possible) throw new Error(r.raison); montant = r.rembourse; frais = r.frais; }
  if (caisse) { etat().remboursements.push({ caisseId: caisse.id, billetId, montant, ts: maintenant() }); consigner('caisse', `Remboursement espèces ${montant} F · billet ${b.code}`, agentId, b.id); }
  return { rembourse: montant, frais, especes };
}

// ------------------------------------------------------------------ accueil
export function statsDuJour(agentId: string) {
  const caisses = app.monde.caisses.filter((c) => c.agentId === agentId && (c.statut === 'ouverte' || c.ouvertA >= debutDuJour())), ids = new Set(caisses.map((c) => c.id));
  const bs = app.monde.billets.filter((b) => b.caisseId && ids.has(b.caisseId) && valide(b));
  return { billets: bs.length, especes: bs.filter((b) => moyenDe(b) === 'especes').reduce((s, b) => s + b.prix, 0), mobile: bs.filter((b) => moyenDe(b) !== 'especes').reduce((s, b) => s + b.prix, 0), colis: app.monde.colis.filter((c) => c.caisseId && ids.has(c.caisseId) && c.statut !== 'annule').length };
}
export interface Alerte { ton: 'wa' | 'er' | 'inf'; texte: string; lien?: string }
export function alertes(agent: Personne): Alerte[] {
  const a: Alerte[] = [], caisse = caisseOuverte(agent.id), e = etat();
  if (!caisse) a.push({ ton: 'wa', texte: 'Caisse fermée : ouvre-la pour vendre', lien: '/caisse' });
  if (app.session.hors_ligne) a.push({ ton: 'wa', texte: `Hors ligne · ${e.aSynchroniser.length} vente(s) à synchroniser` });
  for (const p of paiementsEnAttente(agent.id)) a.push({ ton: 'inf', texte: `${p.moyen === 'om' ? 'Orange Money' : 'MoMo'} ${p.montant.toLocaleString('fr-FR')} F en attente de validation`, lien: `/vente?paiement=${p.id}` });
  const jour = aujourdhui();
  for (const d of app.monde.departs.filter((x) => x.jour === jour && ligneDe(x).gareDe === agent.gareId)) {
    if (d.statut === 'annule') a.push({ ton: 'er', texte: `Départ ${d.heure} ${nomDepart(d)} annulé : rembourse les billets`, lien: '/guichet/rembourser' });
    else if (d.retardMin > 0 && (d.statut === 'prevu' || d.statut === 'embarquement')) a.push({ ton: 'wa', texte: `Départ ${d.heure} ${nomDepart(d)} retardé de ${d.retardMin} min` });
  }
  const derniere = derniereCaisse(agent.id);
  if (derniere?.statut === 'bloquee') a.push({ ton: 'er', texte: 'Caisse bloquée : appelle le superviseur' });
  if (derniere?.statut === 'fermee') a.push({ ton: 'inf', texte: 'Clôture envoyée : en attente du superviseur', lien: '/caisse' });
  return a;
}
