// En route : affectation des équipages, feuille de route du chauffeur, départ, arrêts, incidents.
import { ARRET_MAX_MIN, VITESSE_MAX } from '../../core/terrain.ts';
import { annoncerRetard, consigner, departEnMs, departParId, ligneDe, personne, scannerBillet } from '../../domain/actions.ts';
import type { Depart } from '../../domain/types.ts';
import { app } from '../../data/store.svelte.ts';
import { aBordIds, arretsDe, billetsPayes, libelleDepart, maintenant, nouvelId, prevenirSuperviseurs } from './commun.ts';
import { lireSuivi, lireTerrain, suiviDe, terrain, type Etape, type SuiviDepart } from './etat.ts';

/** Équipage de démonstration : Émile conduit et Youssouf convoie les départs de 08:00 (VIP), 13:00 (Bafoussam) et 19:00 (VIP) de Bêta Express à Mvan. */
const SERVICES = new Set(['08:00|l-BX-VIP-mvan-aller', '19:00|l-BX-VIP-mvan-aller', '13:00|l-BX-bafoussam']);
export function affecterEquipages() {
  for (const d of app.monde.departs) {
    if (!SERVICES.has(`${d.heure}|${d.ligneId}`)) continue;
    if (!d.chauffeurId) d.chauffeurId = 'p-emile'; if (!d.convoyeurId) d.convoyeurId = 'p-youssouf';
  }
}
export const CHECKLIST = [
  { id: 'vehicule', libelle: 'Véhicule contrôlé', sous: 'pneus, freins, feux, pare-brise' }, { id: 'carburant', libelle: 'Carburant suffisant', sous: 'pour tout le trajet' },
  { id: 'securite', libelle: 'Extincteur et trousse de secours', sous: 'en place et à jour' }, { id: 'bagages', libelle: 'Bagages en soute chargés et fermés', sous: 'étiquetés' },
  { id: 'colis', libelle: 'Colis chargés et scannés', sous: 'ou aucun colis' }, { id: 'comptage', libelle: 'Comptage à bord fait', sous: 'billets scannés = voyageurs assis' }
] as const;

/** Départs du jour confiés à un chauffeur ou à un convoyeur. */
export function feuilleDuJour(agentId: string, role: 'chauffeur' | 'convoyeur', jour: string): Depart[] {
  return app.monde.departs.filter((d) => d.jour === jour && d.statut !== 'annule' && (role === 'chauffeur' ? d.chauffeurId : d.convoyeurId) === agentId).sort((a, b) => departEnMs(a) - departEnMs(b));
}
/** Départ à suivre : celui choisi, sinon le bus en route, sinon le prochain à partir. */
export function departEnCours(agentId: string, role: 'chauffeur' | 'convoyeur', jour: string): Depart | undefined {
  const liste = feuilleDuJour(agentId, role, jour), id = lireTerrain().chauffeurDepartId, choisi = liste.find((d) => d.id === id);
  return choisi ?? liste.find((d) => d.statut === 'parti') ?? liste.find((d) => d.statut === 'embarquement') ?? liste.find((d) => d.statut === 'prevu') ?? liste.at(-1);
}
export const choisirDepartRoute = (departId: string) => { terrain().chauffeurDepartId = departId; };
/** Étape réelle du trajet : le monde simulé peut avoir fait partir ou arriver le bus. */
export function etapeDe(d: Depart, s: SuiviDepart = lireSuivi(d.id)): Etape {
  if (s.etape === 'termine' || d.statut === 'arrive') return 'termine';
  if (s.etape === 'quai' && d.statut === 'parti') return 'route';
  return s.etape;
}
export const checklistComplete = (s: SuiviDepart) => CHECKLIST.every((c) => s.checklist[c.id]);
export function cocher(departId: string, id: string, valeur?: boolean) { const s = suiviDe(departId); s.checklist[id] = valeur ?? !s.checklist[id]; }
/** Minutes d'écart entre l'heure prévue au programme et maintenant (positif : en retard). */
export const retardActuel = (d: Depart) => Math.floor((maintenant() - new Date(`${d.jour}T${d.heure}:00`).getTime()) / 60_000);
export type RaisonBlocage = 'pas_ouvert' | 'checklist' | 'trop_tot' | 'deja_parti' | null;
export function blocageDepart(d: Depart): RaisonBlocage {
  if (d.statut === 'parti' || d.statut === 'arrive') return 'deja_parti';
  if (d.statut === 'prevu') return 'pas_ouvert';
  if (retardActuel(d) < -10) return 'trop_tot';
  return checklistComplete(lireSuivi(d.id)) ? null : 'checklist';
}
/** Annonce un retard aux voyageurs (nouvelle heure de départ) sans faire partir le bus. */
export function declarerRetard(departId: string, minutes: number, chauffeurId: string) { annoncerRetard(departId, minutes, chauffeurId); }
/** Départ du bus : l'heure réelle devient l'heure de départ (retard déclaré aux voyageurs si besoin), le départ passe à « parti ». */
export function partir(departId: string, chauffeurId: string): Depart {
  const d = departParId(departId); if (!d) throw new Error('depart_inconnu');
  const raison = blocageDepart(d); if (raison) throw new Error(raison);
  const delta = retardActuel(d);
  if (delta > 0 && delta !== d.retardMin) annoncerRetard(d.id, delta, chauffeurId); else if (delta <= 0) d.retardMin = delta;
  d.statut = 'parti'; const s = suiviDe(d.id); Object.assign(s, { etape: 'route', k: 1, vitesse: 62, departA: maintenant(), arriveeArretA: undefined });
  consigner('depart', `Bus ${libelleDepart(d)} parti${delta > 0 ? ` avec ${delta} min de retard` : ''} · ${aBordIds(d.id).length} à bord`, chauffeurId, d.id); return d;
}
export function accelerer(departId: string) {
  const s = suiviDe(departId); s.vitesse = s.vitesse >= 96 ? 72 : s.vitesse + 8;
  if (s.vitesse > VITESSE_MAX && !s.vitesseAlertee) {
    s.vitesseAlertee = true; const d = departParId(departId), ch = personne(d?.chauffeurId);
    if (d) { prevenirSuperviseurs(ch?.gareId, 'Excès de vitesse', `Bus ${libelleDepart(d)} · ${s.vitesse} km/h`, '/superviseur/voir', 'vitesse'); consigner('vitesse', `Excès de vitesse ${s.vitesse} km/h`, ch?.id, d.id); }
  } else if (s.vitesse <= VITESSE_MAX) s.vitesseAlertee = false;
}
/** Arrivée à l'arrêt `k` (le prochain). Au terminus, le trajet est terminé. */
export function arriverArret(departId: string, chauffeurId: string) {
  const d = departParId(departId), s = suiviDe(departId); if (!d) return; const arrets = arretsDe(d);
  s.vitesse = 0; s.vitesseAlertee = false;
  if (s.k >= arrets.length - 1) { s.etape = 'termine'; consigner('arrivee', `Bus ${libelleDepart(d)} arrivé à ${arrets.at(-1)!.nom}`, chauffeurId, d.id); return; }
  s.etape = 'arret'; s.arriveeArretA = maintenant();
}
export function repartir(departId: string, chauffeurId: string) {
  const d = departParId(departId), s = suiviDe(departId); if (!d || s.etape !== 'arret') return;
  const arrets = arretsDe(d), dur = Math.round((maintenant() - (s.arriveeArretA ?? maintenant())) / 60_000);
  consigner('arret', `Arrêt ${arrets[s.k].nom} · ${dur} min${dur > ARRET_MAX_MIN ? ' (au-delà de ' + ARRET_MAX_MIN + ' min)' : ''} · ${aBordIds(d.id).length} à bord`, chauffeurId, d.id);
  s.k += 1; s.etape = 'route'; s.arriveeArretA = undefined; s.vitesse = 62;
}
/** Démo : prolonge l'arrêt d'une minute. */
export function prolongerArret(departId: string) { const s = suiviDe(departId); if (s.arriveeArretA) s.arriveeArretA -= 60_000; }
export function basculerDescente(departId: string, billetId: string) { const s = suiviDe(departId), i = s.descendus.indexOf(billetId); if (i >= 0) s.descendus.splice(i, 1); else s.descendus.push(billetId); }
/** Un voyageur monte à l'arrêt : son billet est scanné par le chauffeur. */
export function monterAuArret(departId: string, billetId: string, agentId: string) {
  const b = app.monde.billets.find((x) => x.id === billetId); if (!b || b.departId !== departId) throw new Error('billet_inconnu');
  const r = b.statut === 'scanne' ? { statut: 'ok' as const, message: 'Déjà à bord' } : scannerBillet(b.code, agentId, departId); if (r.statut === 'ok') { const s = suiviDe(departId); if (!s.montes.includes(b.id)) s.montes.push(b.id); }
  return r;
}
export const TYPES_INCIDENT = ['Panne', 'Pneu crevé', 'Malaise d’un voyageur', 'Route barrée', 'Accident', 'Contrôle de police'] as const;
export function signalerIncident(departId: string, type: string, note: string, agentId: string) {
  const d = departParId(departId); if (!d) throw new Error('depart_inconnu'); const s = suiviDe(departId), arrets = arretsDe(d), ou = s.etape === 'arret' ? arrets[s.k].nom : `avant ${arrets[Math.min(s.k, arrets.length - 1)].nom}`;
  s.incidents.unshift({ id: nouvelId('inc'), ts: maintenant(), type, note: note.trim(), arret: ou });
  prevenirSuperviseurs(personne(agentId)?.gareId, `Incident · ${type}`, `Bus ${libelleDepart(d)} · ${ou}${note.trim() ? ' · ' + note.trim() : ''}`, '/superviseur/voir', 'incident');
  consigner('incident', `${type} · bus ${libelleDepart(d)} · ${ou}`, agentId, d.id);
}
export const vendus = (departId: string) => billetsPayes(departId).length;

