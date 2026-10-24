// Convoyeur : ventes de billets en route (commission 5 %), code SMS pour le passager, file hors ligne synchronisée au retour du réseau.
import { commission } from '../../core/caisse.ts';
import { codeBillet, sceller } from '../../core/sceau.ts';
import { prixDepuisArret } from '../../core/terrain.ts';
import { app } from '../../data/store.svelte.ts';
import { consigner, departParId, ligneDe, notifier, personne, placesLibres, regler, reserver, scannerBillet } from '../../domain/actions.ts';
import type { Billet } from '../../domain/types.ts';
import { arretsDe, fcfaF, libelleDepart, maintenant, nouvelId } from './commun.ts';
import { convoyeurEtat, lireConvoyeur, lireTerrain, terrain, type DerniereVente, type VenteFile } from './etat.ts';

const ERREURS: Record<string, string> = { complet: 'Bus complet : plus aucune place libre', depart_ferme: 'Ce départ est terminé', depart_inconnu: 'Départ inconnu', terminus: 'Terminus : pas de vente à ce dernier arrêt', demande_invalide: 'Vente invalide' };
export const erreurLisible = (e: unknown) => ERREURS[(e as Error)?.message] ?? 'Vente impossible pour le moment';
export const TAUX_PAR_DEFAUT = 5;
export const tauxDe = (agentId: string) => personne(agentId)?.commission ?? TAUX_PAR_DEFAUT;
/** Prix d'un billet monté à l'arrêt `arret` du départ. */
export function prixAuDepart(departId: string, arret: number): number {
  const d = departParId(departId); if (!d) return 0; return prixDepuisArret(d.prix, arretsDe(d)[arret]?.offsetMin ?? 0, ligneDe(d).dureeMin);
}
export const smsCode = (nom: string, d: { heure: string }, code: string, arret: string) => `Bêta Express : ${nom || 'votre billet'} · bus ${d.heure} · montée à ${arret} · code ${code}. Présentez ce code au contrôle.`;
function codeUnique(graine: number): string {
  const pris = new Set([...app.monde.billets.map((b) => b.code), ...convoyeurEtat().file.map((v) => v.code)]);
  let code = codeBillet(graine); for (let i = 1; pris.has(code); i++) code = codeBillet(graine + i * 101); return code;
}
/** Exécute une vente sur le monde : réservation, confirmation MoMo, montée à bord (billet scanné), arrêt de montée. */
function executer(v: VenteFile): Billet {
  const nom = v.nom.trim() || 'Passager en route', r = reserver({ departId: v.departId, sieges: [null], passagers: [{ nom, tel: v.tel }], acheteurId: v.agentId, canal: 'convoyeur', moyen: v.moyen, prixUnitaire: v.prix });
  const b = r.billets[0];
  if (v.moyen === 'momo') {
    regler(r.paiement.id, { ok: true });
    const n = app.monde.notifications[0]; if (n && n.destId === v.agentId && n.type === 'billet') app.monde.notifications.shift(); // le passager est notifié par SMS, pas l'agent
  }
  b.code = v.code; b.sceau = sceller({ code: b.code, departId: b.departId, siege: b.siege, nom: b.passager.nom });
  scannerBillet(b.code, v.agentId, v.departId); b.scanneLe = v.ts; terrain().montees[b.id] = v.arret;
  const d = departParId(v.departId)!;
  if (v.tel) consigner('sms', `SMS au ${v.tel} : billet ${b.code} · bus ${libelleDepart(departParId(v.departId)!)}`, v.agentId, b.id);
  consigner('vente_route', `Billet ${b.code} vendu en route à ${arretsDe(d)[v.arret]?.nom} · ${v.prix} F · ${v.moyen}`, v.agentId, b.id); return b;
}
/** Vend un billet à un arrêt. Hors ligne : la vente part en file avec un code provisoire (le même sera gardé à la synchronisation). */
export function vendreEnRoute(p: { agentId: string; departId: string; arret: number; moyen: 'especes' | 'momo'; nom?: string; tel?: string }): { vente: DerniereVente; enFile: boolean } {
  const d = departParId(p.departId); if (!d) throw new Error('depart_inconnu');
  const arrets = arretsDe(d), prix = prixAuDepart(p.departId, p.arret); if (prix <= 0 || p.arret >= arrets.length - 1) throw new Error('terminus');
  const c = convoyeurEtat(), enAttente = c.file.filter((x) => x.departId === p.departId).length;
  const code = codeUnique(maintenant() / 1000 + app.monde.billets.length * 13 + c.file.length * 17 + 3);
  const v: VenteFile = { id: nouvelId('vf'), departId: p.departId, agentId: p.agentId, arret: p.arret, prix, moyen: p.moyen, nom: p.nom ?? '', tel: (p.tel ?? '').trim(), ts: maintenant(), code, etat: 'file' };
  if (placesLibres(d) - enAttente <= 0) throw new Error('complet');
  const resume = (enFile: boolean): DerniereVente => ({ code: v.code, tel: v.tel, nom: v.nom.trim(), prix, moyen: p.moyen, arret: arrets[p.arret].nom, ts: v.ts, enFile });
  if (c.horsLigne) { c.file.push(v); c.derniere = resume(true); return { vente: c.derniere, enFile: true }; }
  executer(v); c.derniere = resume(false); return { vente: c.derniere, enFile: false };
}
/** Envoie la file au serveur : les ventes qui passent sont retirées, les autres restent avec leur erreur. */
export function synchroniser(): { envoyees: number; echecs: number } {
  const c = convoyeurEtat(); let envoyees = 0, echecs = 0; const reste: VenteFile[] = [];
  for (const v of [...c.file]) {
    try { executer(v); envoyees++; if (c.derniere?.code === v.code) c.derniere.enFile = false; } catch (e) { echecs++; reste.push({ ...v, etat: 'echec', erreur: erreurLisible(e) }); }
  }
  c.file.splice(0, c.file.length, ...reste); if (envoyees) c.derniereSync = maintenant(); return { envoyees, echecs };
}
export const abandonnerVente = (id: string) => { const c = convoyeurEtat(), i = c.file.findIndex((v) => v.id === id); if (i >= 0) c.file.splice(i, 1); };
/** Coupe ou rétablit le réseau (démo) ; au retour du réseau la file est synchronisée. */
export function reglerHorsLigne(horsLigne: boolean): { envoyees: number; echecs: number } | null {
  const c = convoyeurEtat(); if (c.horsLigne === horsLigne) return null; c.horsLigne = horsLigne; return horsLigne ? null : synchroniser();
}
export interface BilanVentes { n: number; especes: number; momo: number; total: number; enFile: number; commission: number }
/** Ventes du convoyeur sur un départ (synchronisées + en file), commission comprise. */
export function bilanVentes(agentId: string, departId: string): BilanVentes {
  const sync = app.monde.billets.filter((b) => b.canal === 'convoyeur' && b.acheteurId === agentId && b.departId === departId && (b.statut === 'valide' || b.statut === 'scanne'));
  const pay = (b: Billet) => app.monde.paiements.find((x) => x.id === b.paiementId)?.moyen;
  const file = lireConvoyeur().file.filter((v) => v.agentId === agentId && v.departId === departId);
  const especes = sync.filter((b) => pay(b) === 'especes').reduce((s, b) => s + b.prix, 0) + file.filter((v) => v.moyen === 'especes').reduce((s, v) => s + v.prix, 0);
  const momo = sync.filter((b) => pay(b) === 'momo').reduce((s, b) => s + b.prix, 0) + file.filter((v) => v.moyen === 'momo').reduce((s, v) => s + v.prix, 0);
  return { n: sync.length + file.length, especes, momo, total: especes + momo, enFile: file.length, commission: commission(especes + momo, tauxDe(agentId)) };
}
export const ventesRecentes = (agentId: string, departId: string) => app.monde.billets.filter((b) => b.canal === 'convoyeur' && b.acheteurId === agentId && b.departId === departId).reverse().sort((a, b) => b.creeLe - a.creeLe).slice(0, 6);

/** Remise des espèces du convoyeur à la gare (la commission lui est versée en retour, voir `bilanVentes`). */
export function remettreEspecesConvoyeur(agentId: string, departId: string, jour: string): number {
  const b = bilanVentes(agentId, departId), deja = terrain().remises.filter((r) => r.agentId === agentId && r.jour === jour).reduce((s, r) => s + r.montant, 0), reste = Math.max(0, b.especes - deja);
  if (reste <= 0) return 0; const d = departParId(departId);
  terrain().remises.push({ agentId, jour, montant: reste, ts: maintenant() });
  const gareId = personne(agentId)?.gareId; for (const s of app.monde.personnes.filter((p) => p.role === 'superviseur' && p.gareId === gareId)) notifier(s.id, 'Remise du convoyeur', `${personne(agentId)?.prenom} · ${fcfaF(reste)} d’espèces · bus ${d ? libelleDepart(d) : ''}`, '/superviseur/valider', 'caisse');
  consigner('remise', `${personne(agentId)?.prenom} remet ${reste} F d'espèces`, agentId, departId); return reste;
}
export const especesRemises = (agentId: string, jour: string) => lireTerrain().remises.filter((r) => r.agentId === agentId && r.jour === jour).reduce((s, r) => s + r.montant, 0);
