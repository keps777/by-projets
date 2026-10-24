// Contrôleur : contrôle inopiné dans le bus (comptage, scan des billets, voyageurs sans billet), anomalies, rapport à la gare, litige.
import { lireQr, sceauValide } from '../../core/sceau.ts';
import { amende, supportBillet, verdictControle } from '../../core/terrain.ts';
import { app } from '../../data/store.svelte.ts';
import { consigner, departParId, ligneDe, personne, regler, reserver, scannerBillet } from '../../domain/actions.ts';
import type { Litige } from '../../domain/types.ts';
import { arretsDe, billetsPayes, libelleDepart, maintenant, nouvelId, prevenirSuperviseurs } from './commun.ts';
import { controleDe, lireControle, lireSuivi, lireTerrain, terrain, type SansBillet } from './etat.ts';
import { etapeDe } from './route.ts';
import { bilanVentes } from './convoyeur.ts';

export type ResultatControle = 'ok' | 'deja' | 'autre_depart' | 'annule' | 'inconnu' | 'faux' | 'non_paye';
/** Bus à contrôler par défaut : un bus en route de la compagnie, sinon celui à quai. */
export function departAControler(compagnieId: string | undefined, jour: string) {
  const l = app.monde.departs.filter((d) => d.jour === jour && d.statut !== 'annule' && (!compagnieId || ligneDe(d).compagnieId === compagnieId));
  const id = lireTerrain().controleDepartId, choisi = l.find((d) => d.id === id);
  return choisi ?? l.filter((d) => d.statut === 'parti').find((d) => d.chauffeurId) ?? l.find((d) => d.statut === 'parti') ?? l.find((d) => d.statut === 'embarquement') ?? l.at(-1);
}
export const choisirDepartControle = (id: string) => { terrain().controleDepartId = id; };
export function compter(departId: string, delta: number) { const c = controleDe(departId); c.comptes = Math.max(0, c.comptes + delta); }
export function remettreAZero(departId: string) { controleDe(departId).comptes = 0; }
/** Scan d'un billet dans le bus : vérifie le sceau et le départ ; un billet valide contrôlé pour la première fois s'ajoute au comptage. */
export function controlerBillet(departId: string, contenu: string, agentId: string): { resultat: ResultatControle; billetId?: string } {
  const qr = lireQr(contenu), code = qr?.code ?? contenu.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), b = app.monde.billets.find((x) => x.code === code);
  if (!b) return { resultat: 'inconnu' };
  if (qr && !sceauValide({ code: b.code, departId: b.departId, siege: b.siege, nom: b.passager.nom, sceau: qr.sceau })) return { resultat: 'faux', billetId: b.id };
  if (b.departId !== departId) return { resultat: 'autre_depart', billetId: b.id };
  if (b.statut === 'annule' || b.statut === 'rembourse' || b.statut === 'expire') return { resultat: 'annule', billetId: b.id };
  if (b.statut === 'attente_paiement') return { resultat: 'non_paye', billetId: b.id };
  const c = controleDe(departId); if (c.controles[b.id]) return { resultat: 'deja', billetId: b.id };
  c.controles[b.id] = maintenant(); c.comptes += 1; consigner('controle', `Billet ${b.code} contrôlé à bord`, agentId, b.id); return { resultat: 'ok', billetId: b.id };
}
export const controleBascule = (departId: string, billetId: string) => { const c = controleDe(departId); if (c.controles[billetId]) { delete c.controles[billetId]; c.comptes = Math.max(0, c.comptes - 1); } else { c.controles[billetId] = maintenant(); c.comptes += 1; } };
export function chiffresControle(departId: string) {
  const bs = billetsPayes(departId), c = lireControle(departId), sup = { app: 0, papier: 0, sms: 0 };
  for (const b of bs) sup[supportBillet(b.canal)]++;
  return { valides: bs.length, ...sup, comptes: c.comptes, verdict: verdictControle(c.comptes, bs.length), controles: Object.keys(c.controles).length };
}
export interface Anomalie { niveau: 'er' | 'wa' | 'ok'; titre: string; sous: string; lien?: string }
/** Anomalies du bus : refus au quai, ventes non synchronisées, voyageurs sans billet, billets payés jamais scannés, soute. */
export function anomalies(departId: string): Anomalie[] {
  const d = departParId(departId); if (!d) return []; const res: Anomalie[] = [], t = lireTerrain(), c = lireControle(departId);
  for (const p of t.passages.filter((x) => x.departId === departId && x.statut === 'deja_scanne')) {
    const b = app.monde.billets.find((x) => x.id === p.billetId); res.push({ niveau: 'er', titre: `Place ${b?.siege ?? '?'} · billet déjà scanné`, sous: 'refusé au quai : copie ou capture d’écran' });
  }
  const file = chiffresVentesEnFile(departId); if (file > 0) res.push({ niveau: 'wa', titre: `${file} vente${file > 1 ? 's' : ''} du convoyeur pas synchronisée${file > 1 ? 's' : ''}`, sous: 'passagers montés en route, billets encore en file', lien: undefined });
  const sans = c.sansBillet.filter((s) => !s.billetId).length; if (sans) res.push({ niveau: 'er', titre: `${sans} voyageur${sans > 1 ? 's' : ''} sans billet`, sous: 'à régulariser' });
  const regul = c.sansBillet.filter((s) => s.billetId).length; if (regul) res.push({ niveau: 'ok', titre: `${regul} voyageur${regul > 1 ? 's' : ''} régularisé${regul > 1 ? 's' : ''}`, sous: 'billet vendu sur place' });
  if (d.statut === 'parti') { const absents = billetsPayes(departId).filter((b) => b.statut === 'valide' && !c.controles[b.id]).length; if (absents > 0) res.push({ niveau: 'wa', titre: `${absents} billet${absents > 1 ? 's' : ''} payé${absents > 1 ? 's' : ''} non contrôlé${absents > 1 ? 's' : ''}`, sous: 'jamais scannés ni vérifiés à bord' }); }
  const colis = app.monde.colis.filter((x) => x.departId === departId && x.statut !== 'annule'); if (colis.length) { const ok = colis.filter((x) => x.statut !== 'cree').length; res.push({ niveau: ok === colis.length ? 'ok' : 'wa', titre: `Soute · ${colis.length} colis étiquetés`, sous: ok === colis.length ? 'tous scannés' : `${colis.length - ok} pas encore scannés` }); }
  return res;
}
function chiffresVentesEnFile(departId: string) { const d = departParId(departId); return d?.convoyeurId ? bilanVentes(d.convoyeurId, departId).enFile : 0; }
/** Régularise un voyageur sans billet : billet vendu sur place + amende (ou geste commercial sans amende). */
export function verbaliser(p: { departId: string; agentId: string; nom: string; tel: string; geste: boolean; moyen: 'especes' | 'momo' }): SansBillet {
  const d = departParId(p.departId); if (!d) throw new Error('depart_inconnu');
  const r = reserver({ departId: p.departId, sieges: [null], passagers: [{ nom: p.nom.trim() || 'Voyageur sans billet', tel: p.tel.trim() }], acheteurId: p.agentId, canal: 'convoyeur', moyen: p.moyen, prixUnitaire: d.prix }), b = r.billets[0];
  if (p.moyen === 'momo') { regler(r.paiement.id, { ok: true }); const n = app.monde.notifications[0]; if (n && n.destId === p.agentId && n.type === 'billet') app.monde.notifications.shift(); }
  scannerBillet(b.code, p.agentId, p.departId); controleDe(p.departId).controles[b.id] = maintenant();
  const s: SansBillet = { id: nouvelId('sb'), ts: maintenant(), nom: p.nom.trim() || 'Voyageur sans billet', tel: p.tel.trim(), billetId: b.id, amende: p.geste ? 0 : amende(b.prix), geste: p.geste, prix: b.prix, moyen: p.moyen };
  controleDe(p.departId).sansBillet.unshift(s); consigner('amende', `Sans billet : ${s.nom} · billet ${b.prix} F${s.amende ? ` + amende ${s.amende} F` : ' · geste, sans amende'}`, p.agentId, b.id); return s;
}
/** Signale un voyageur sans billet qui n'a pas pu régulariser (sera dans le rapport). */
export function signalerSansBillet(departId: string, agentId: string, nom: string, tel: string): SansBillet {
  const s: SansBillet = { id: nouvelId('sb'), ts: maintenant(), nom: nom.trim() || 'Voyageur sans billet', tel: tel.trim(), amende: 0, geste: false, prix: 0, moyen: '' };
  controleDe(departId).sansBillet.unshift(s); consigner('amende', `Sans billet non régularisé : ${s.nom}`, agentId, departId); return s;
}
export const totalAmendes = (departId: string) => lireControle(departId).sansBillet.reduce((s, x) => s + x.amende, 0);
export function texteRapport(departId: string): string {
  const d = departParId(departId); if (!d) return ''; const c = chiffresControle(departId), a = anomalies(departId).filter((x) => x.niveau !== 'ok'), arrets = arretsDe(d), s = lireSuivi(d.id);
  const ou = etapeDe(d, s) === 'arret' ? `à ${arrets[s.k].nom}` : d.statut === 'parti' ? 'en route' : 'à quai';
  return `Bus ${libelleDepart(d)} ${ou} · ${c.comptes} comptés / ${c.valides} billets (${c.verdict.texte.toLowerCase()})${a.length ? ' · ' + a.map((x) => x.titre).join(' ; ') : ''}`;
}
export function envoyerRapport(departId: string, agentId: string) {
  const d = departParId(departId), agent = personne(agentId); if (!d) throw new Error('depart_inconnu'); const c = chiffresControle(departId), txt = texteRapport(departId);
  const sup = prevenirSuperviseurs(agent?.gareId, `Rapport de contrôle · ${libelleDepart(d)}`, `${agent?.prenom} · ${txt}`, '/superviseur/voir', 'controle');
  controleDe(departId).rapportA = maintenant(); consigner('controle', `Rapport de contrôle envoyé · ${txt}`, agentId, departId); return { superviseurs: sup.length, ecart: c.verdict.ecart };
}
export function ouvrirLitigeChauffeur(departId: string, agentId: string, texte: string): Litige {
  const d = departParId(departId); if (!d) throw new Error('depart_inconnu');
  const l: Litige = { id: nouvelId('lit'), ts: maintenant(), auteurId: agentId, type: 'chauffeur', objet: { type: 'depart', id: departId }, texte: texte.trim() || texteRapport(departId), statut: 'ouvert' };
  app.monde.litiges.unshift(l); controleDe(departId).litigeA = maintenant();
  prevenirSuperviseurs(personne(agentId)?.gareId, 'Litige chauffeur ouvert', `${libelleDepart(d)} · ${l.texte}`, '/superviseur/voir', 'litige'); consigner('litige', `Litige chauffeur · bus ${libelleDepart(d)}`, agentId, l.id); return l;
}
/** Choix du « simuler un scan » dans le bus : billets pas encore contrôlés, plus quelques cas pour s'entraîner. */
export function scansControleSimulables(departId: string) {
  const c = lireControle(departId), qr = (b: { code: string; sceau: string }) => `${b.code}.${b.sceau}`, payes = billetsPayes(departId);
  const autre = app.monde.billets.find((b) => b.statut === 'valide' && b.departId !== departId);
  return {
    valides: payes.filter((b) => !c.controles[b.id]).slice(0, 8).map((b) => ({ id: b.id, libelle: `${b.passager.nom || 'Sans nom'} · ${b.siege ?? 'sans place'}`, contenu: qr(b), code: b.code })),
    essais: [...(payes[0] ? [{ id: 'faux', libelle: 'Faux billet (sceau invalide)', contenu: `${payes[0].code}.000000000000`, code: payes[0].code }] : []), ...(autre ? [{ id: 'autre', libelle: 'Billet d’un autre départ', contenu: qr(autre), code: autre.code }] : []), { id: 'inconnu', libelle: 'Billet inconnu', contenu: 'ZZ2222ZZ', code: 'ZZ2222ZZ' }]
  };
}
