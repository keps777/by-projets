// Transactions partagées du monde AfriMove. Toute application (voyageur, guichet, quai, siège…) passe par ici pour modifier le monde :
// ainsi un billet vendu au guichet apparaît au quai, dans la caisse, dans les analyses du patron et dans l'app de la voyageuse.
import { codeBillet, lireQr, sceller, sceauValide } from '../core/sceau.ts';
import { supplementSiege } from '../core/sieges.ts';
import { prixDynamique, remboursement as calculRemboursement, type Remboursement } from '../core/tarif.ts';
import { ecartJours } from '../core/dates.ts';
import { attendu as attenduCaisse, evaluerEcart, totalCompte } from '../core/caisse.ts';
import { codeColis, codeRetrait, prixColis, suivant } from '../core/colis.ts';
import { minutes } from '../core/retard.ts';
import { DUREE_RESERVATION_MS } from '../data/constantes.ts';
import { app, aujourdhui, maintenant, nouvelId } from '../data/store.svelte.ts';
import type { Billet, Caisse, Canal, Colis, Compagnie, Depart, Gare, Ligne, MoyenPaiement, Paiement, Passager, Personne, Role, StatutColis } from './types.ts';

// ------------------------------------------------------------------ lectures
export const ligneDe = (d: Depart): Ligne => app.monde.lignes.find((l) => l.id === d.ligneId)!;
export const compagnieDe = (d: Depart): Compagnie => app.monde.compagnies.find((c) => c.id === ligneDe(d).compagnieId)!;
export const gare = (id: string): Gare | undefined => app.monde.gares.find((g) => g.id === id);
export const personne = (id: string | null | undefined): Personne | undefined => (id ? app.monde.personnes.find((p) => p.id === id) : undefined);
export const departParId = (id: string): Depart | undefined => app.monde.departs.find((d) => d.id === id);
export const billetParId = (id: string): Billet | undefined => app.monde.billets.find((b) => b.id === id);
/** Heure de départ réelle, en ms depuis l'époque (retard compris). */
export const departEnMs = (d: Depart) => new Date(`${d.jour}T${d.heure}:00`).getTime() + d.retardMin * 60_000;
const actif = (b: Billet, now: number) => b.statut === 'valide' || b.statut === 'scanne' || (b.statut === 'attente_paiement' && (app.monde.paiements.find((p) => p.id === b.paiementId)?.expireLe ?? 0) > now);
export const billetsDuDepart = (departId: string) => app.monde.billets.filter((b) => b.departId === departId && actif(b, maintenant()));
export function siegesIndisponibles(d: Depart): Set<string> { const s = new Set(d.prisAilleurs); for (const b of billetsDuDepart(d.id)) if (b.siege) s.add(b.siege); return s; }
export function placesLibres(d: Depart): number { const sans = billetsDuDepart(d.id).filter((b) => !b.siege).length; return Math.max(0, d.capacite - siegesIndisponibles(d).size - sans); }
export const remplissage = (d: Depart) => 1 - placesLibres(d) / d.capacite;
export const billetsDe = (personneId: string) => app.monde.billets.filter((b) => b.acheteurId === personneId || b.passager.tel === personne(personneId)?.tel).sort((a, b) => b.creeLe - a.creeLe);
export const departsDuJour = (jour: string, de?: string, vers?: string) => app.monde.departs.filter((d) => d.jour === jour && d.statut !== 'annule' && (!de || ligneDe(d).de === de) && (!vers || ligneDe(d).vers === vers)).sort((a, b) => a.heure.localeCompare(b.heure));
export const personneCourante = (): Personne | undefined => personne(app.session.personneId);
export const equipeDe = (gareId: string, role?: Role) => app.monde.personnes.filter((p) => p.gareId === gareId && (!role || p.role === role));

// ------------------------------------------------------------------ journal et notifications
export function consigner(type: string, texte: string, acteurId?: string, ref?: string) { app.monde.evenements.unshift({ id: nouvelId('ev'), ts: maintenant(), type, texte, acteurId, ref }); if (app.monde.evenements.length > 400) app.monde.evenements.length = 400; }
export function notifier(destId: string, titre: string, sous: string, lien?: string, type?: string) { app.monde.notifications.unshift({ id: nouvelId('n'), destId, ts: maintenant(), titre, sous, lu: false, lien, type }); }
export const notificationsDe = (personneId: string) => app.monde.notifications.filter((n) => n.destId === personneId);
export const nonLues = (personneId: string | null | undefined) => (personneId ? notificationsDe(personneId).filter((n) => !n.lu).length : 0);

// ------------------------------------------------------------------ session
export function verifierPin(personneId: string, pin: string) { const p = personne(personneId); return !!p && p.actif && !!p.pin && p.pin === pin; }
export function connecter(personneId: string) { const p = personne(personneId); if (!p) throw new Error('inconnu'); if (!p.actif) throw new Error('compte_inactif'); app.session.personneId = p.id; app.session.role = p.role; app.session.derniereActivite = maintenant(); }
export function deconnecter() { app.session.personneId = null; app.session.role = null; }

// ------------------------------------------------------------------ billets
/** Prix proposé pour un départ : tarif du départ ajusté par le prix dynamique du patron (−500 F veille peu rempli, +500 F presque plein). C'est ce prix que paie `reserver`. */
export const prixDuDepart = (d: Depart) => prixDynamique(d.prix, remplissage(d), Math.max(0, ecartJours(aujourdhui(), d.jour)), !!app.monde.params.tarifs.dynamique);
export interface DemandeReservation {
  departId: string; /** Un siège par passager (null = placement libre, ex. cadence ou convoyeur). */ sieges: (string | null)[]; passagers: Passager[];
  acheteurId: string; canal: Canal; moyen: MoyenPaiement; /** Prix unitaire négocié (étudiant…) ; sinon prix du départ. */ prixUnitaire?: number; caisseId?: string;
}
export interface ResultatReservation { paiement: Paiement; billets: Billet[] }
/** Crée les billets et le paiement. Espèces au guichet : réglé tout de suite. Autres moyens : « attente » 10 min, à finaliser avec `regler()`. */
export function reserver(r: DemandeReservation): ResultatReservation {
  const d = departParId(r.departId); if (!d) throw new Error('depart_inconnu');
  if (d.statut === 'annule' || d.statut === 'arrive') throw new Error('depart_ferme');
  if (r.sieges.length !== r.passagers.length || r.sieges.length === 0) throw new Error('demande_invalide');
  const pris = siegesIndisponibles(d), ligne = ligneDe(d), prixBase = prixDuDepart(d);
  if (new Set(r.sieges.filter(Boolean)).size !== r.sieges.filter(Boolean).length) throw new Error('siege_double');
  for (const s of r.sieges) if (s && pris.has(s)) throw new Error('siege_pris');
  if (r.sieges.length > placesLibres(d)) throw new Error('complet');
  const now = maintenant(), immediat = r.moyen === 'especes' && r.canal !== 'app';
  const pid = nouvelId('pay'), billets: Billet[] = r.sieges.map((siege, i) => {
    const code = codeBillet(now / 1000 + app.monde.billets.length * 13 + i * 7 + (r.passagers[i].nom.length * 31));
    const prix = (r.prixUnitaire ?? prixBase) + (siege ? supplementSiege(ligne.classe, siege) : 0);
    return { id: nouvelId('b'), code, departId: d.id, siege, passager: r.passagers[i], prix, canal: r.canal, acheteurId: r.acheteurId, paiementId: pid, statut: immediat ? 'valide' : 'attente_paiement', creeLe: now, sceau: sceller({ code, departId: d.id, siege, nom: r.passagers[i].nom }), caisseId: r.caisseId };
  });
  const paiement: Paiement = { id: pid, ts: now, montant: billets.reduce((s, b) => s + b.prix, 0), moyen: r.moyen, statut: immediat ? 'ok' : 'attente', ref: `${r.moyen.toUpperCase()}-${Math.floor(now / 1000) % 100000}`, canal: r.canal, payeurId: r.acheteurId, pour: { type: 'billet', ids: billets.map((b) => b.id) }, expireLe: now + DUREE_RESERVATION_MS };
  app.monde.billets.push(...billets); app.monde.paiements.push(paiement);
  if (immediat) consigner('vente', `${billets.length} billet(s) ${ligne.de}→${ligne.vers} ${d.heure} · ${paiement.montant} F`, r.acheteurId, d.id);
  return { paiement, billets };
}
/** Finalise un paiement en attente : accepté (billets valides) ou refusé (billets expirés, places libérées). */
export function regler(paiementId: string, issue: { ok: true } | { refus: string }): Paiement {
  const p = app.monde.paiements.find((x) => x.id === paiementId); if (!p) throw new Error('paiement_inconnu');
  if (p.statut !== 'attente') return p;
  const billets = app.monde.billets.filter((b) => b.paiementId === p.id);
  if ('ok' in issue) {
    if ((p.expireLe ?? 0) < maintenant()) { p.statut = 'refuse'; p.motif = 'Réservation expirée'; for (const b of billets) b.statut = 'expire'; return p; }
    p.statut = 'ok'; for (const b of billets) b.statut = 'valide';
    const d = billets[0] ? departParId(billets[0].departId) : undefined; if (d) { const l = ligneDe(d); notifier(p.payeurId, 'Billet confirmé', `${l.de} → ${l.vers} · ${d.jour} ${d.heure}${billets[0].siege ? ` · place ${billets.map((b) => b.siege).join(', ')}` : ''}`, '/pass', 'billet'); consigner('vente', `${billets.length} billet(s) ${l.de}→${l.vers} ${d.heure} · ${p.montant} F`, p.payeurId, d.id); }
  } else { p.statut = 'refuse'; p.motif = issue.refus; for (const b of billets) b.statut = 'expire'; }
  return p;
}
export interface ResultatAnnulation extends Remboursement { billet: Billet }
/** Annulation d'un billet : remboursement selon `core/tarif.remboursement` ; la place est libérée. */
export function annulerBillet(billetId: string, parCompagnie = false): ResultatAnnulation {
  const b = billetParId(billetId); if (!b) throw new Error('billet_inconnu');
  if (b.statut !== 'valide') return { billet: b, possible: false, frais: 0, rembourse: 0, raison: b.statut === 'scanne' ? 'Billet déjà utilisé' : 'Billet non remboursable' };
  const d = departParId(b.departId)!, r = calculRemboursement(b.prix, (departEnMs(d) - maintenant()) / 60_000, parCompagnie);
  if (!r.possible) return { billet: b, ...r };
  b.statut = 'rembourse'; b.annuleLe = maintenant(); b.rembourse = r.rembourse;
  const p = app.monde.paiements.find((x) => x.id === b.paiementId); if (p && app.monde.billets.filter((x) => x.paiementId === p.id && x.statut === 'valide').length === 0) p.statut = 'rembourse';
  notifier(b.acheteurId, 'Remboursement envoyé', `${r.rembourse.toLocaleString('fr-FR')} F renvoyés · place ${b.siege ?? ''} libérée`, '/pass', 'remboursement');
  consigner('annulation', `Billet ${b.code} remboursé ${r.rembourse} F`, b.acheteurId, b.id);
  return { billet: b, ...r };
}
export type StatutScan = 'ok' | 'deja_scanne' | 'annule' | 'faux' | 'mauvais_depart' | 'inconnu' | 'non_paye';
export interface ResultatScan { statut: StatutScan; billet?: Billet; message: string }
/** Scan au quai : contenu du QR (`code.sceau`) ou code saisi à la main. `departId` : on refuse un billet d'un autre départ. */
function scannerBilletBrut(contenu: string, agentId: string, departId?: string): ResultatScan {
  const qr = lireQr(contenu), code = (qr?.code ?? contenu.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')), b = app.monde.billets.find((x) => x.code === code);
  if (!b) return { statut: 'inconnu', message: 'Billet inconnu' };
  if (qr && !sceauValide({ code: b.code, departId: b.departId, siege: b.siege, nom: b.passager.nom, sceau: qr.sceau })) return { statut: 'faux', billet: b, message: 'Sceau invalide : billet falsifié' };
  if (b.statut === 'scanne') return { statut: 'deja_scanne', billet: b, message: `Déjà scanné à ${new Date(b.scanneLe!).toTimeString().slice(0, 5)}` };
  if (b.statut === 'annule' || b.statut === 'rembourse' || b.statut === 'expire') return { statut: 'annule', billet: b, message: 'Billet annulé' };
  if (b.statut === 'attente_paiement') return { statut: 'non_paye', billet: b, message: 'Paiement non confirmé' };
  if (departId && b.departId !== departId) return { statut: 'mauvais_depart', billet: b, message: 'Ce billet est pour un autre départ' };
  b.statut = 'scanne'; b.scanneLe = maintenant(); b.scannePar = agentId; consigner('scan', `Billet ${b.code} scanné`, agentId, b.id);
  return { statut: 'ok', billet: b, message: 'Billet valide' };
}

export function scannerBillet(contenu: string, agentId: string, departId?: string): ResultatScan {
  const r = scannerBilletBrut(contenu, agentId, departId);
  // Les refus sont consignés : le superviseur de la gare les voit dans ses alertes.
  if (r.statut !== 'ok') consigner('scan_refuse', `Scan refusé (${r.statut}) : ${r.message}`, agentId, r.billet?.id);
  return r;
}

// ------------------------------------------------------------------ caisse du guichet
export const caisseOuverte = (agentId: string): Caisse | undefined => app.monde.caisses.find((c) => c.agentId === agentId && c.statut === 'ouverte');
export function ouvrirCaisse(agentId: string, fond: number): Caisse {
  const deja = caisseOuverte(agentId); if (deja) return deja; const p = personne(agentId)!;
  const c: Caisse = { id: nouvelId('c'), agentId, gareId: p.gareId ?? '', jour: aujourdhui(), ouvertA: maintenant(), fond, statut: 'ouverte' };
  app.monde.caisses.push(c); consigner('caisse', `Ouverture de caisse · fond ${fond} F`, agentId, c.id); return c;
}
/** Espèces de la caisse : tout ce qui a été encaissé en espèces (billets même remboursés ensuite, colis) moins ce qui a réellement été rendu. */
export function especesCaisse(caisseId: string) {
  const bs = app.monde.billets.filter((b) => b.caisseId === caisseId && app.monde.paiements.find((p) => p.id === b.paiementId)?.moyen === 'especes');
  const encaisses = bs.filter((b) => b.statut === 'valide' || b.statut === 'scanne' || b.statut === 'rembourse');
  const rembourses = bs.filter((b) => b.statut === 'rembourse').reduce((s, b) => s + (b.rembourse ?? 0), 0);
  const colis = app.monde.colis.filter((c) => c.caisseId === caisseId && c.statut !== 'annule').reduce((s, c) => s + c.prix, 0);
  return { ventes: encaisses.reduce((s, b) => s + b.prix, 0) + colis, rembourses, billets: encaisses.filter((b) => b.statut !== 'rembourse').length };
}
export function attenduDeCaisse(c: Caisse) { const e = especesCaisse(c.id); return attenduCaisse(c.fond, e.ventes, e.rembourses); }
export function fermerCaisse(caisseId: string, compte: Record<string, number>, justification?: string) {
  const c = app.monde.caisses.find((x) => x.id === caisseId); if (!c || c.statut !== 'ouverte') throw new Error('caisse_non_ouverte');
  const att = attenduDeCaisse(c), ev = evaluerEcart(totalCompte(compte), att);
  Object.assign(c, { statut: 'fermee', fermeeA: maintenant(), compte, attendu: att, ecart: ev.montant, justification });
  consigner('caisse', `Fermeture de caisse · écart ${ev.montant} F`, c.agentId, c.id);
  if (ev.niveau !== 'juste') for (const s of app.monde.personnes.filter((p) => p.role === 'superviseur' && p.gareId === c.gareId)) notifier(s.id, 'Clôture à valider', `${personne(c.agentId)?.prenom} · écart ${ev.montant.toLocaleString('fr-FR')} F`, '/superviseur/valider', 'caisse');
  return { caisse: c, ...ev };
}
export function validerCaisse(caisseId: string, superviseurId: string, pin: string): boolean {
  const c = app.monde.caisses.find((x) => x.id === caisseId); if (!c || c.statut !== 'fermee' || !verifierPin(superviseurId, pin)) return false;
  c.statut = 'validee'; c.valideeA = maintenant(); c.validePar = superviseurId; consigner('caisse', 'Clôture validée', superviseurId, c.id); return true;
}

// ------------------------------------------------------------------ colis
export interface DemandeColis { expediteurId: string; destinataire: Passager; taille: Colis['taille']; options: Colis['options']; depart: string; arrivee: string; relaisId?: string; moyen: MoyenPaiement; canal: Canal; caisseId?: string }
export function creerColis(r: DemandeColis): { colis: Colis; paiement: Paiement | null } {
  const now = maintenant(), n = app.monde.colis.length + 1, prix = prixColis(r.taille, r.options);
  const colis: Colis = { id: nouvelId('col'), code: codeColis(now / 1000 + n), expediteurId: r.expediteurId, destinataire: r.destinataire, taille: r.taille, prix, options: r.options, depart: r.depart, arrivee: r.arrivee, relaisId: r.relaisId, statut: 'cree', codeRetrait: codeRetrait(now / 1000 + n), etapes: [{ ts: now, statut: 'cree', lieu: r.canal === 'app' ? 'App' : r.depart }], caisseId: r.caisseId };
  app.monde.colis.push(colis);
  let paiement: Paiement | null = null;
  if (!r.options.contreRemboursement) { paiement = { id: nouvelId('pay'), ts: now, montant: prix, moyen: r.moyen, statut: r.moyen === 'especes' ? 'ok' : 'attente', ref: `${r.moyen.toUpperCase()}-${Math.floor(now / 1000) % 100000}`, canal: r.canal, payeurId: r.expediteurId, pour: { type: 'colis', ids: [colis.id] }, expireLe: now + DUREE_RESERVATION_MS }; colis.paiementId = paiement.id; app.monde.paiements.push(paiement); }
  return { colis, paiement };
}
export function avancerColis(colisId: string, statut?: StatutColis, lieu = '', par?: string): Colis {
  const c = app.monde.colis.find((x) => x.id === colisId); if (!c) throw new Error('colis_inconnu');
  const s = statut ?? suivant(c.statut); if (!s) return c;
  c.statut = s; c.etapes.push({ ts: maintenant(), statut: s, lieu, par });
  notifier(c.expediteurId, `Colis ${c.code}`, s === 'livre' ? 'Livré au destinataire' : lieu || s, '/colis/suivi', 'colis'); consigner('colis', `Colis ${c.code} → ${s}`, par, c.id); return c;
}
export const colisDe = (personneId: string) => app.monde.colis.filter((c) => c.expediteurId === personneId);

// ------------------------------------------------------------------ retard et annulation d'un départ
export function annoncerRetard(departId: string, minutesRetard: number, acteurId?: string) {
  const d = departParId(departId); if (!d) return; d.retardMin = minutesRetard;
  for (const b of app.monde.billets.filter((x) => x.departId === departId && x.statut === 'valide')) notifier(b.acheteurId, `Retard +${minutesRetard} min`, `Nouveau départ ${new Date(departEnMs(d)).toTimeString().slice(0, 5)}`, '/direct/retard', 'retard');
  consigner('retard', `Départ ${d.heure} retardé de ${minutesRetard} min`, acteurId, d.id);
}
export function annulerDepart(departId: string, acteurId?: string) {
  const d = departParId(departId); if (!d) return 0; d.statut = 'annule'; let n = 0;
  for (const b of app.monde.billets.filter((x) => x.departId === departId && x.statut === 'valide')) { annulerBillet(b.id, true); n++; }
  consigner('annulation', `Départ ${d.heure} annulé · ${n} billets remboursés`, acteurId, d.id); return n;
}
/** Minutes avant le départ réel du bus (négatif si parti). */
export const minutesAvant = (d: Depart) => Math.round((departEnMs(d) - maintenant()) / 60_000);
export const heureLocale = (ms: number) => new Date(ms).toTimeString().slice(0, 5);
export { minutes };
