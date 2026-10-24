// Transactions du superviseur de gare. Elles s'appuient sur les primitives de `domain/actions.ts` (annulerBillet, annulerDepart, validerCaisse, notifier, consigner…)
// et ne touchent au monde que pour ce que le domaine ne sait pas faire : PIN, comptes, blocage de caisse, demande d'annulation, recomptage, rapport, clôture.
import { app, maintenant, nouvelId } from '../../data/store.svelte.ts';
import { annulerBillet, annulerDepart, billetParId, caisseOuverte, consigner, departParId, ligneDe, notifier, personne, validerCaisse } from '../../domain/actions.ts';
import { aleaSur, chiffresTel, formaterTel, genererPin, quiValide, telValide } from '../../core/supervision.ts';
import { evaluerCloture, texteRapport, type Rapport } from '../../core/rapport.ts';
import { jourDe } from '../../core/dates.ts';
import { fcfa, fcfaSigne } from '../../core/money.ts';
import { gareDuBillet, gareDuDepartId } from './alertes.ts';
import { cleJour, creerTranche } from './etat.svelte.ts';
import type { Litige, Personne, Role } from '../../domain/types.ts';

export type Resultat<T extends object = object> = ({ ok: true } & T) | { ok: false; erreur: string };
const ko = (erreur: string): { ok: false; erreur: string } => ({ ok: false, erreur });
export const ROLES_AJOUTABLES: Role[] = ['guichet', 'quai', 'chauffeur', 'convoyeur', 'controleur'];

const decideur = (id: string): Personne | undefined => { const p = personne(id); return p && p.actif && (p.role === 'superviseur' || p.role === 'patron') ? p : undefined; };
/** Un superviseur n'agit que dans sa gare ; le patron partout. */
const dansLaGare = (s: Personne, gareId: string | undefined) => s.role === 'patron' || (!!gareId && s.gareId === gareId);
const patrons = () => app.monde.personnes.filter((p) => p.role === 'patron' && p.actif);
const superviseursDe = (gareId: string) => app.monde.personnes.filter((p) => p.role === 'superviseur' && p.gareId === gareId && p.actif);
const lieuDe = (departId: string) => { const d = departParId(departId); return d ? `${d.heure} ${ligneDe(d).vers}` : departId; };

// ------------------------------------------------------------------ équipe
/** Peut-on agir sur ce compte ? Pas sur le patron, pas sur un autre superviseur (sauf le patron), uniquement dans sa gare. */
function cibleAutorisee(s: Personne, c: Personne | undefined): string | null {
  if (!c) return 'Personne inconnue';
  if (c.role === 'patron') return 'Le compte du patron ne se modifie pas ici';
  if (!dansLaGare(s, c.gareId)) return 'Cette personne n’est pas dans ta gare';
  if (c.role === 'superviseur' && c.id !== s.id && s.role !== 'patron') return 'Seul le patron gère un autre superviseur';
  return null;
}
/** Nouveau PIN à 4 chiffres, non trivial et différent de l'ancien ; il part par SMS (simulé : notification à la personne). */
export function reinitialiserPin(superviseurId: string, personneId: string, alea: () => number = aleaSur()): Resultat<{ pin: string; tel: string }> {
  const s = decideur(superviseurId), c = personne(personneId);
  if (!s) return ko('Action réservée au superviseur');
  const refus = cibleAutorisee(s, c); if (refus) return ko(refus);
  const cible = c!, pin = genererPin(alea, [cible.pin]);
  cible.pin = pin;
  notifier(cible.id, 'Nouveau PIN', `Ton nouveau PIN est ${pin}. SMS envoyé au ${formaterTel(cible.tel)} par ${s.prenom}. Change-le dès ta connexion.`, undefined, 'pin');
  consigner('equipe', `Nouveau PIN pour ${cible.prenom} ${cible.nom}`, s.id, cible.id);
  return { ok: true, pin, tel: formaterTel(cible.tel) };
}
/** Active ou désactive un compte. Refusé pour soi-même et pour un agent dont la caisse est ouverte. */
export function basculerCompte(superviseurId: string, personneId: string, actif: boolean): Resultat {
  const s = decideur(superviseurId), c = personne(personneId);
  if (!s) return ko('Action réservée au superviseur');
  const refus = cibleAutorisee(s, c); if (refus) return ko(refus);
  if (c!.id === s.id) return ko('Tu ne peux pas désactiver ton propre compte');
  if (!actif && caisseOuverte(c!.id)) return ko(`La caisse de ${c!.prenom} est ouverte : fais-la fermer et valider d’abord`);
  c!.actif = actif;
  consigner('equipe', `Compte de ${c!.prenom} ${actif ? 'réactivé' : 'désactivé'}`, s.id, c!.id);
  return { ok: true };
}
export interface NouvelAgent { prenom: string; nom: string; tel: string; role: Role }
export function ajouterAgent(superviseurId: string, a: NouvelAgent, gareId?: string, alea: () => number = aleaSur()): Resultat<{ personne: Personne; pin: string }> {
  const s = decideur(superviseurId); if (!s) return ko('Action réservée au superviseur');
  const gare = s.role === 'patron' ? gareId : s.gareId, prenom = a.prenom.trim(), nom = a.nom.trim(), tel = chiffresTel(a.tel);
  if (!gare) return ko('Choisis la gare de l’agent');
  if (prenom.length < 2 || nom.length < 2) return ko('Prénom et nom : 2 lettres au moins');
  if (!ROLES_AJOUTABLES.includes(a.role)) return ko('Ce rôle ne s’ajoute pas ici');
  if (!telValide(tel)) return ko('Téléphone : 9 chiffres, commençant par 6');
  if (app.monde.personnes.some((p) => chiffresTel(p.tel) === tel)) return ko('Ce numéro est déjà utilisé');
  const pin = genererPin(alea);
  const p: Personne = { id: nouvelId('p'), prenom, nom, tel, role: a.role, actif: true, gareId: gare, compagnieId: s.compagnieId, pin, ...(a.role === 'convoyeur' ? { commission: 5 } : {}) };
  app.monde.personnes.push(p);
  notifier(p.id, 'Bienvenue chez Bêta Express', `Ton PIN est ${pin}. SMS envoyé au ${formaterTel(tel)}.`, undefined, 'pin');
  consigner('equipe', `${prenom} ${nom} ajouté(e) à l’équipe (${a.role})`, s.id, p.id);
  return { ok: true, personne: p, pin };
}

/** À appeler par le quai à chaque scan refusé : alimente les alertes et le rapport du superviseur de la gare. */
export function signalerScanRefuse(agentId: string, texte: string, billetId?: string) { consigner('scan_refuse', texte, agentId, billetId); }

// ------------------------------------------------------------------ annulations
const ouvertsPour = (objetId: string) => app.monde.litiges.filter((l) => l.objet.id === objetId && l.statut !== 'resolu');
function resoudre(l: Litige, reponse: string, par: Personne) { l.statut = 'resolu'; l.reponse = reponse; notifier(l.auteurId, 'Décision du superviseur', `${reponse} · ${par.prenom}`, undefined, 'litige'); }
/** Le quai (ou le guichet) demande une annulation après départ : un litige « annulation » s'ouvre et le superviseur de la gare est prévenu. */
export function demanderAnnulation(demandeurId: string, billetId: string, motif: string): Resultat<{ litige: Litige }> {
  const b = billetParId(billetId); if (!b) return ko('Billet inconnu');
  if (!motif.trim()) return ko('Indique le motif');
  const deja = ouvertsPour(b.id).find((l) => l.type === 'annulation'); if (deja) return { ok: true, litige: deja };
  const l: Litige = { id: nouvelId('lit'), ts: maintenant(), auteurId: demandeurId, type: 'annulation', objet: { type: 'billet', id: b.id }, texte: motif.trim(), statut: 'ouvert' };
  app.monde.litiges.unshift(l);
  for (const s of superviseursDe(gareDuBillet(app.monde, b.id) ?? '')) notifier(s.id, 'Annulation demandée', `${b.code} · ${motif.trim()}`, `/superviseur/voir?litige=${l.id}`, 'litige');
  consigner('annulation_demandee', `Annulation demandée pour le billet ${b.code} : ${motif.trim()}`, demandeurId, b.id);
  return { ok: true, litige: l };
}
/** Annule un billet. Remboursé intégralement (annulation par la compagnie) ou, après départ, libéré sans remboursement (règle Bêta Express). */
export function annulerBilletDecide(superviseurId: string, billetId: string, o: { motif: string; rembourser: boolean }): Resultat<{ rembourse: number }> {
  const s = decideur(superviseurId), b = billetParId(billetId);
  if (!s) return ko('Action réservée au superviseur');
  if (!b) return ko('Billet inconnu');
  if (!dansLaGare(s, gareDuBillet(app.monde, b.id))) return ko('Ce billet n’est pas d’un départ de ta gare');
  if (!o.motif.trim()) return ko('Indique le motif');
  if (b.statut !== 'valide' && b.statut !== 'scanne') return ko(b.statut === 'attente_paiement' ? 'Paiement en attente : le billet expirera seul' : 'Billet déjà annulé');
  let rembourse = 0;
  if (o.rembourser && b.statut === 'valide') rembourse = annulerBillet(b.id, true).rembourse;
  else { b.statut = 'annule'; b.annuleLe = maintenant(); notifier(b.acheteurId, 'Billet annulé par la gare', `Billet ${b.code} · ${o.motif.trim()}. Pas de remboursement après départ.`, '/pass', 'annulation'); }
  consigner('annulation', `Billet ${b.code} annulé par ${s.prenom} · ${o.motif.trim()} · ${rembourse ? `remboursé ${fcfa(rembourse)} F` : 'sans remboursement'}`, s.id, b.id);
  for (const l of ouvertsPour(b.id)) resoudre(l, `Annulation acceptée${rembourse ? ' et remboursée' : ''}`, s);
  return { ok: true, rembourse };
}
/** Refuse l'annulation : la demande est close, la copie reste bloquée (un billet déjà scanné est refusé au second scan). */
export function refuserAnnulation(superviseurId: string, billetId: string, motif = 'Annulation refusée'): Resultat {
  const s = decideur(superviseurId), b = billetParId(billetId);
  if (!s) return ko('Action réservée au superviseur');
  if (!b) return ko('Billet inconnu');
  if (!dansLaGare(s, gareDuBillet(app.monde, b.id))) return ko('Ce billet n’est pas d’un départ de ta gare');
  for (const l of ouvertsPour(b.id)) resoudre(l, motif, s);
  consigner('annulation', `Annulation du billet ${b.code} refusée par ${s.prenom}`, s.id, b.id);
  return { ok: true };
}
/** Annule un départ (avant qu'il ne parte et tant que personne n'est monté) : tous les billets valides sont remboursés, l'équipe est prévenue. */
export function annulerDepartDecide(superviseurId: string, departId: string, motif: string): Resultat<{ rembourses: number }> {
  const s = decideur(superviseurId), d = departParId(departId);
  if (!s) return ko('Action réservée au superviseur');
  if (!d) return ko('Départ inconnu');
  if (!dansLaGare(s, gareDuDepartId(app.monde, d.id))) return ko('Ce départ n’est pas de ta gare');
  if (!motif.trim()) return ko('Indique le motif');
  if (d.statut !== 'prevu' && d.statut !== 'embarquement') return ko(d.statut === 'annule' ? 'Départ déjà annulé' : 'Le bus est parti : annule plutôt les billets un par un');
  const scannes = app.monde.billets.filter((b) => b.departId === d.id && b.statut === 'scanne').length;
  if (scannes > 0) return ko(`${scannes} passager${scannes > 1 ? 's sont déjà montés' : ' est déjà monté'} : fais d’abord descendre le bus`);
  const rembourses = annulerDepart(d.id, s.id);
  for (const id of [d.chauffeurId, d.convoyeurId, ...app.monde.personnes.filter((p) => p.gareId === ligneDe(d).gareDe && (p.role === 'quai' || p.role === 'guichet')).map((p) => p.id)]) if (id) notifier(id, 'Départ annulé', `${lieuDe(d.id)} · ${motif.trim()}`, '/superviseur', 'annulation');
  consigner('annulation', `Départ ${lieuDe(d.id)} annulé par ${s.prenom} · ${motif.trim()}`, s.id, d.id);
  for (const l of ouvertsPour(d.id)) resoudre(l, `Départ annulé · ${motif.trim()}`, s);
  return { ok: true, rembourses };
}

// ------------------------------------------------------------------ clôtures de caisse
export type Preuve = { pin: string } | { visage: true };
/** Valide une clôture avec le PIN du superviseur ou son visage (simulé). Au-delà de 2 000 F d'écart, seul le patron peut valider. */
export function validerCloture(superviseurId: string, caisseId: string, preuve: Preuve): Resultat<{ ecart: number }> {
  const s = decideur(superviseurId), c = app.monde.caisses.find((x) => x.id === caisseId);
  if (!s) return ko('Action réservée au superviseur');
  if (!c) return ko('Caisse inconnue');
  if (!dansLaGare(s, c.gareId)) return ko('Cette caisse n’est pas dans ta gare');
  if (c.statut !== 'fermee') return ko(c.statut === 'validee' ? 'Clôture déjà validée' : 'Cette caisse n’est pas à valider');
  const ecart = c.ecart ?? 0;
  if (quiValide(ecart) === 'patron' && s.role !== 'patron') return ko(`Écart de ${fcfaSigne(ecart)} F : seul le patron peut valider`);
  let pin: string;
  if ('visage' in preuve) { if (!s.visage || !app.monde.params.regles.visage) return ko('Visage non disponible : utilise ton PIN'); pin = s.pin ?? ''; } else pin = preuve.pin;
  if (!validerCaisse(c.id, s.id, pin)) return ko('PIN incorrect');
  const agent = personne(c.agentId);
  if (ecart !== 0) consigner('ecart', `Écart ${fcfaSigne(ecart)} F imputé à ${agent?.prenom ?? '—'}`, s.id, c.id);
  if (agent) notifier(agent.id, 'Clôture validée', ecart === 0 ? 'Ta caisse est juste. Merci.' : `Écart de ${fcfaSigne(ecart)} F retenu pour cette clôture.`, '/caisse', 'caisse');
  return { ok: true, ecart };
}
/** Refuse la clôture : la caisse repasse « ouverte » et l'agent doit la recompter puis la fermer de nouveau. */
export function demanderRecomptage(superviseurId: string, caisseId: string, motif = 'Recompte ta caisse'): Resultat {
  const s = decideur(superviseurId), c = app.monde.caisses.find((x) => x.id === caisseId);
  if (!s) return ko('Action réservée au superviseur');
  if (!c) return ko('Caisse inconnue');
  if (!dansLaGare(s, c.gareId)) return ko('Cette caisse n’est pas dans ta gare');
  if (c.statut !== 'fermee') return ko('Cette caisse n’est pas à valider');
  if (caisseOuverte(c.agentId)) return ko('Cet agent a déjà une autre caisse ouverte');
  c.statut = 'ouverte'; delete c.fermeeA; delete c.compte; delete c.attendu; delete c.ecart; delete c.justification;
  notifier(c.agentId, 'Recomptage demandé', `${motif} · ${s.prenom}`, '/caisse', 'caisse');
  consigner('caisse', `Recomptage demandé à ${personne(c.agentId)?.prenom ?? '—'}`, s.id, c.id);
  return { ok: true };
}
/** Écart au-delà du seuil : la décision est transmise au patron. */
export function transmettreAuPatron(superviseurId: string, caisseId: string): Resultat {
  const s = decideur(superviseurId), c = app.monde.caisses.find((x) => x.id === caisseId);
  if (!s || !c) return ko('Caisse inconnue');
  if (!dansLaGare(s, c.gareId)) return ko('Cette caisse n’est pas dans ta gare');
  for (const p of patrons()) notifier(p.id, 'Écart à valider', `${personne(c.agentId)?.prenom} · ${fcfaSigne(c.ecart ?? 0)} F · transmis par ${s.prenom}`, '/superviseur/valider?caisse=' + c.id, 'caisse');
  consigner('caisse', `Écart de ${fcfaSigne(c.ecart ?? 0)} F transmis au patron`, s.id, c.id);
  return { ok: true };
}

// ------------------------------------------------------------------ blocage et déblocage d'un guichet
/** Bloque la caisse ouverte d'un agent (3 PIN faux, écart non justifié…) et prévient le superviseur de la gare. */
export function bloquerCaisse(caisseId: string, motif: string): Resultat {
  const c = app.monde.caisses.find((x) => x.id === caisseId); if (!c) return ko('Caisse inconnue');
  if (c.statut !== 'ouverte') return ko('Seule une caisse ouverte se bloque');
  c.statut = 'bloquee'; consigner('blocage', motif, c.agentId, c.id);
  for (const s of superviseursDe(c.gareId)) notifier(s.id, 'Guichet bloqué', `${personne(c.agentId)?.prenom} · ${motif}`, `/superviseur/debloquer?caisse=${c.id}`, 'acces');
  return { ok: true };
}
/** Un PIN faux de plus pour cet agent ; au troisième, sa caisse ouverte est bloquée. À appeler depuis l'écran de PIN du guichet. */
export function signalerPinFaux(agentId: string): { tentatives: number; bloque: boolean } {
  const c = caisseOuverte(agentId), depuis = c?.ouvertA ?? 0;
  consigner('pin_faux', 'PIN erroné', agentId, c?.id);
  const tentatives = app.monde.evenements.filter((e) => e.type === 'pin_faux' && e.acteurId === agentId && e.ts >= depuis).length;
  const bloque = tentatives >= 3 && !!c && bloquerCaisse(c.id, `${tentatives} PIN faux`).ok;
  return { tentatives, bloque };
}
export interface OptionsDeblocage { visageReconnu: boolean; nouveauPin: boolean; recompter: boolean }
/** Rouvre un guichet bloqué après reconnaissance du visage (simulée) de l'agent. */
export function debloquerCaisse(superviseurId: string, caisseId: string, o: OptionsDeblocage, alea?: () => number): Resultat<{ pin?: string }> {
  const s = decideur(superviseurId), c = app.monde.caisses.find((x) => x.id === caisseId);
  if (!s) return ko('Action réservée au superviseur');
  if (!c) return ko('Caisse inconnue');
  if (!dansLaGare(s, c.gareId)) return ko('Cette caisse n’est pas dans ta gare');
  if (c.statut !== 'bloquee') return ko('Ce guichet n’est pas bloqué');
  if (!o.visageReconnu) return ko('Reconnais d’abord le visage de l’agent');
  const agent = personne(c.agentId)!;
  let pin: string | undefined;
  if (o.nouveauPin) { const r = reinitialiserPin(s.id, agent.id, alea); if (!r.ok) return ko(r.erreur); pin = r.pin; }
  agent.visage = true; c.statut = 'ouverte';
  if (o.recompter) notifier(agent.id, 'Guichet débloqué', 'Recompte ta caisse avant de reprendre les ventes.', '/caisse', 'caisse');
  else notifier(agent.id, 'Guichet débloqué', `Tu peux reprendre les ventes · ${s.prenom}`, '/guichet', 'caisse');
  consigner('deblocage', `Guichet de ${agent.prenom} débloqué par ${s.prenom}${o.recompter ? ' · recomptage demandé' : ''}`, s.id, c.id);
  return pin ? { ok: true, pin } : { ok: true };
}
/** Suspend un agent pour la journée (réactivé automatiquement le lendemain au démarrage). */
export function suspendreJournee(superviseurId: string, personneId: string): Resultat {
  const r = basculerCompte(superviseurId, personneId, false); if (!r.ok) return r;
  creerTranche().suspensions[personneId] = jourDe(new Date(maintenant()));
  return r;
}
/** Réactive les comptes suspendus un jour passé. */
export function leverSuspensions(): number {
  const t = app.tranches.superviseur as { suspensions?: Record<string, string> } | undefined, auj = jourDe(new Date(maintenant())); let n = 0;
  if (!t?.suspensions) return 0;
  for (const [id, jour] of Object.entries(t.suspensions)) if (jour < auj) { const p = personne(id); if (p) { p.actif = true; n++; } delete t.suspensions[id]; }
  return n;
}

// ------------------------------------------------------------------ rapport du soir et clôture de la gare
/** Consigne l'envoi du rapport (WhatsApp ou partage) et prévient le patron dans l'application. */
export function envoyerRapport(superviseurId: string, r: Rapport, via: 'whatsapp' | 'partage'): Resultat {
  const s = decideur(superviseurId); if (!s) return ko('Action réservée au superviseur');
  if (!dansLaGare(s, r.gareId)) return ko('Ce rapport n’est pas de ta gare');
  const texte = texteRapport(r);
  creerTranche().rapports[cleJour(r.gareId, r.jour)] = { envoyeLe: maintenant(), par: s.id, texte, via };
  for (const p of patrons()) notifier(p.id, `Rapport du soir · ${r.gareNom}`, `Recette ${fcfa(r.recette)} F · ${r.billets} billets · ${r.departs.partis}/${r.departs.total} bus`, `/patron/gare?gare=${r.gareId}`, 'rapport');
  consigner('rapport', `Rapport du soir ${r.gareNom} envoyé`, s.id, r.gareId);
  return { ok: true };
}
/** Clôture de la gare pour la journée. Règle `cloture` active : après 20:00, le patron est alerté (la clôture reste acceptée). */
export function cloturerGare(superviseurId: string, gareId: string): Resultat<{ tardive: boolean; retardMin: number }> {
  const s = decideur(superviseurId); if (!s) return ko('Action réservée au superviseur');
  if (!dansLaGare(s, gareId)) return ko('Ce n’est pas ta gare');
  const t = creerTranche(), now = maintenant(), jour = jourDe(new Date(now)), cle = cleJour(gareId, jour), deja = t.clotures[cle];
  if (deja) return ko('Gare déjà clôturée aujourd’hui');
  const d = new Date(now), ev = evaluerCloture(d.getHours() * 60 + d.getMinutes(), !!app.monde.params.regles.cloture), nom = app.monde.gares.find((g) => g.id === gareId)?.nom ?? gareId;
  t.clotures[cle] = { ts: now, par: s.id, tardive: ev.tardive, retardMin: ev.retardMin };
  if (ev.tardive) for (const p of patrons()) notifier(p.id, `Clôture tardive · ${nom}`, `Clôturée à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} au lieu de ${ev.limite} (+${ev.retardMin} min) par ${s.prenom}`, `/patron/gare?gare=${gareId}`, 'cloture');
  consigner('cloture', `Gare ${nom} clôturée${ev.tardive ? ` avec ${ev.retardMin} min de retard` : ''}`, s.id, gareId);
  return { ok: true, tardive: ev.tardive, retardMin: ev.retardMin };
}
