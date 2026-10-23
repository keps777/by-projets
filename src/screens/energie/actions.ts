// Actions de l'énergie solaire : aperçu de décision, commande du kit (crédit sur salaire), mensualités, report, fin du plan.
import { app, maintenant, nouvelId, notifier, totalMensualites } from '../../data/store.svelte.ts';
import { KITS, mensualiteKit, type Kit } from '../../core/energie.ts';
import { PLAFONDS, SEUILS_NIVEAU, capaciteRestante, niveauDuScore, partSalaire, type Decision } from '../../core/credit.ts';
import { ajouterMois, jourCourt, jourDe } from '../../core/dates.ts';
import { creneauxInstallation, deciderService, niveauPourKit, premierPrelevementKit, type Creneau } from '../../core/services.ts';
import { kitDe, tauxSolaire } from './calcul.ts';
import { etat, type Plan } from './etat.ts';

export type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string; decision?: Decision };
export const niveau = () => niveauDuScore(app.score.valeur);
export const taux = () => tauxSolaire(app.compte?.pass ?? 'essentiel', niveau());
export const creneaux = (now = maintenant()): Creneau[] => creneauxInstallation(jourDe(new Date(now)));

export interface Evaluation { mensualite: number; decision: Decision; part: number; capacite: number }
/** Évalue une commande (aperçu comme décision finale) : mensualité réelle, règle des 33 %, score requis. */
export function evaluer(kitId: Kit['id'], duree: number): Evaluation | null {
  const c = app.compte; if (!c) return null;
  const kit = kitDe(kitId); const mensualite = mensualiteKit(kit.prix, duree, taux());
  const existantes = totalMensualites();
  const decision = deciderService({
    score: app.score.valeur, seuilScore: SEUILS_NIVEAU[niveauPourKit(kit.prix) ?? 'ELITE'], salaire: c.salaireNet,
    mensualiteNouvelle: mensualite, mensualitesExistantes: existantes, employeurPartenaire: c.employeur.trim().length > 0, ancienneteAns: parseInt(c.anciennete) || 1
  });
  return { mensualite, decision, part: partSalaire(mensualite + existantes, c.salaireNet), capacite: capaciteRestante(c.salaireNet, existantes) };
}

export function commander(kitId: Kit['id'], duree: number, jourInstallation: string, now = maintenant()): Resultat<{ plan: Plan }> {
  const c = app.compte; const e = etat();
  if (!c) return { ok: false, erreur: 'Compte introuvable.' };
  if (!KITS.some((k) => k.id === kitId) || ![12, 24, 36].includes(duree)) return { ok: false, erreur: 'Kit ou durée invalide.' };
  const kit = kitDe(kitId);
  if (kit.prix > PLAFONDS[niveau()].credit) return { ok: false, erreur: 'Ce kit dépasse le plafond de votre niveau.' };
  const slot = creneaux(now).find((s) => s.jour === jourInstallation);
  if (!slot) return { ok: false, erreur: 'Choisissez un créneau d\'installation.' };
  const ev = evaluer(kitId, duree)!;
  if (!ev.decision.approuve) return { ok: false, erreur: ev.decision.motif ?? 'Demande refusée.', decision: ev.decision };
  const premier = premierPrelevementKit(slot.jour, c.jourPaie);
  const creditId = nouvelId('c');
  app.credits.push({ id: creditId, produit: 'solaire', libelle: `Kit solaire ${kit.court} · ${duree} mois`, capital: kit.prix, mensualite: ev.mensualite, duree, payees: 0, prochaine: premier, statut: 'actif' });
  const plan: Plan = { id: nouvelId('pl'), kit: kitId, nom: kit.court, prix: kit.prix, duree, mensualite: ev.mensualite, ts: now, installation: slot.jour, creneau: `${slot.label} · ${slot.sous.split(' · ')[0].toLowerCase()}`, creditId, premier, veille: false, termine: false };
  e.plans.unshift(plan);
  notifier({ titre: `Kit ${kit.court} commandé`, sous: `Installation ${slot.label.toLowerCase()} · ${ev.mensualite.toLocaleString('fr-FR')} / mois sur salaire dès le ${jourCourt(premier)}`, lien: '/energie', ts: now });
  return { ok: true, plan };
}

const planDe = (creditId: string) => (app.tranches['energie'] as { plans: Plan[] } | undefined)?.plans.find((p) => p.creditId === creditId);
/** Une mensualité a été prélevée : le plan avance, et à la dernière le kit devient celui du membre. */
export function mensualitePayee(creditId: string, paie: string) {
  const c = app.credits.find((x) => x.id === creditId); if (!c) return;
  c.payees++; const p = planDe(creditId); if (p) p.veille = false;
  if (c.payees >= c.duree) {
    c.statut = 'termine';
    if (p) { p.termine = true; notifier({ titre: `Votre kit solaire ${p.nom} est à vous`, sous: `Les ${c.duree} mensualités sont payées : le kit vous appartient.`, lien: '/energie' }); }
  } else c.prochaine = ajouterMois(paie, 1, app.compte?.jourPaie);
}
/** Solde insuffisant : la mensualité est reportée d'un mois, sans pénalité ; le kit se met en veille. */
export function mensualiteReportee(creditId: string, paie: string) {
  const c = app.credits.find((x) => x.id === creditId); if (!c) return;
  c.prochaine = ajouterMois(paie, 1, app.compte?.jourPaie);
  const p = planDe(creditId); if (p) p.veille = true;
}
