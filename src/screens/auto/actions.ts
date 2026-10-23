// Actions du crédit auto : côté membre (simuler, décider, signer, livrer) et côté concessionnaire (étudier, accorder, livrer, stock).
// Toute règle de calcul est dans core/auto.ts et core/credit.ts ; ici on ne fait que modifier l'état.
import { app, maintenant, notifier, nouvelId, totalMensualites } from '../../data/store.svelte.ts';
import { apresEchec, apresSucces, estVerrouille, secondesAvantDeverrou, verifierHash } from '../../core/auth.ts';
import {
  FINANCEMENT_MINIMUM, ancienneteEnAnnees, apportMinimum, creneaux, employeurPartenaire, offreJusqua, peutRefuser, premierPrelevement, simuler, statistiquesVentes,
  validerDemande, verifierTransition, COLONNES, type Assurance, type Creneau, type Etape, type EntreeSimulation, type Simulation
} from '../../core/auto.ts';
import { SEUILS_NIVEAU, decider, niveauDuScore, tauxMensuel, type Decision, type Niveau } from '../../core/credit.ts';
import { jourDe, jourLong } from '../../core/dates.ts';
import { fcfa } from '../../core/money.ts';
import { auto, coffreVoiture, dossierDe, libelleCredit, monDossier, vehiculeDe, CONCESSION, type Dossier, type EtatVehicule, type Vehicule } from './etat.ts';
import { prendreDansCoffres, rendreAuxCoffres } from '../coffres/actions.ts';

// ------------------------------------------------------------------ lectures
export const niveauMembre = (): Niveau => niveauDuScore(app.score.valeur);
export const tauxMembre = (): number => tauxMensuel(app.compte?.pass ?? 'essentiel', niveauMembre());
/** Vehicules proposés au catalogue : publiés, non vendus. */
export const catalogue = (type?: Vehicule['type']) => auto().vehicules.filter((x) => x.publie && !x.vendu && (!type || x.type === type));
const jourAujourdhui = () => jourDe(new Date(maintenant()));

/** Dossier du membre encore ouvert (ni refusé, ni annulé, ni livré). */
export function dossierOuvert(): Dossier | undefined {
  const d = monDossier();
  return d && d.etape !== 'refusee' && d.etape !== 'annulee' && d.etape !== 'livree' ? d : undefined;
}
/** Mensualités des autres crédits (celui du dossier en cours, déjà signé, ne se compte pas deux fois). */
export function mensualitesExistantes(exclureCredit: string | null = null): number {
  return app.credits.filter((c) => c.statut === 'actif' && c.id !== exclureCredit).reduce((s, c) => s + c.mensualite, 0);
}
export function entreeSimulation(prix: number, apport: number, duree: number, assurance: Assurance): EntreeSimulation {
  return { prix, apport, duree, assurance, tauxMensuel: tauxMembre(), salaire: app.compte?.salaireNet ?? 0, mensualitesExistantes: mensualitesExistantes() };
}
export const simulerBrouillon = (): Simulation | null => {
  const b = auto().brouillon; const veh = vehiculeDe(b?.vehiculeId);
  return b && veh ? simuler(entreeSimulation(veh.prix, b.apport, b.duree, b.assurance)) : null;
};
export const erreurBrouillon = (): string | null => {
  const b = auto().brouillon; const veh = vehiculeDe(b?.vehiculeId);
  if (!b || !veh) return 'Choisissez un véhicule dans le catalogue.';
  return validerDemande({ prix: veh.prix, apport: b.apport, duree: b.duree, assurance: b.assurance, niveau: niveauMembre(), coffre: coffreVoiture() });
};
export const offreValide = (d: Dossier) => jourAujourdhui() <= d.offreJusqua;
export const estSigne = (d: Dossier) => d.signeLe != null;

// ------------------------------------------------------------------ côté membre
/** Apport proposé par défaut : 500 000 si possible, sinon le minimum exigé (plafonné au coffre). */
export function apportParDefaut(prix: number): number {
  const min = apportMinimum(prix, niveauMembre());
  return Math.max(0, Math.min(Math.max(min, Math.min(500_000, coffreVoiture())), prix - FINANCEMENT_MINIMUM));
}
export function choisirVehicule(id: string): string | null {
  const veh = vehiculeDe(id); const t = auto();
  if (!veh || !veh.publie || veh.vendu) return "Ce véhicule n'est plus proposé.";
  const ouvert = dossierOuvert();
  if (ouvert && estSigne(ouvert)) return 'Vous avez déjà un financement signé en cours de livraison.';
  t.brouillon = { vehiculeId: id, apport: apportParDefaut(veh.prix), duree: 36, assurance: 'tous_risques' };
  return null;
}
export function reglerBrouillon(m: Partial<{ apport: number; duree: number; assurance: Assurance }>) {
  const b = auto().brouillon; if (b) Object.assign(b, m);
}

function entreeDecision(veh: Vehicule, sim: Simulation, exclureCredit: string | null) {
  const c = app.compte!; const ans = ancienneteEnAnnees(c.anciennete);
  return {
    score: app.score.valeur, seuilScore: SEUILS_NIVEAU.PRO, salaire: c.salaireNet, mensualiteNouvelle: sim.mensualite, mensualitesExistantes: mensualitesExistantes(exclureCredit),
    employeurPartenaire: employeurPartenaire(c.employeur), ancienneteAns: Math.floor(ans), contratStable: ans >= 1,
    vehiculeControle: veh.controle, valeurExpertisee: veh.valeurExpertisee, prix: veh.prix, financement: sim.financement
  };
}
const aDecision = (d: Decision) => ({ approuve: d.approuve, motif: d.motif, controles: d.controles.map((x) => ({ ...x })) });

/** Soumet la simulation en cours : décision automatique (score, 33 %, employeur, véhicule). Retourne le dossier ou un message d'erreur. */
export function demander(): { dossier: Dossier } | { erreur: string } {
  const t = auto(); const b = t.brouillon; const veh = vehiculeDe(b?.vehiculeId); const c = app.compte;
  if (!b || !veh || !c) return { erreur: 'Choisissez un véhicule dans le catalogue.' };
  const erreur = erreurBrouillon(); if (erreur) return { erreur };
  const ouvert = dossierOuvert();
  if (ouvert && estSigne(ouvert)) return { erreur: 'Vous avez déjà un financement signé en cours de livraison.' };
  const sim = simuler(entreeSimulation(veh.prix, b.apport, b.duree, b.assurance));
  const decision = decider(entreeDecision(veh, sim, null));
  const now = maintenant();
  const champs = {
    client: `${c.prenom} ${c.nom}`, score: app.score.valeur, vehiculeId: veh.id, vehiculeTitre: veh.titre, prix: veh.prix, apport: b.apport, duree: b.duree, assurance: b.assurance, taux: tauxMembre(),
    financement: sim.financement, mensualite: sim.mensualite, decision: aDecision(decision), etape: (decision.approuve ? 'nouvelle' : 'refusee') as Etape,
    docs: decision.approuve ? [true, true, true] : [false, false, false], creeLe: now, offreJusqua: offreJusqua(jourDe(new Date(now))), motifRefus: decision.approuve ? null : decision.motif
  };
  const existant = monDossier();
  let d: Dossier;
  if (existant && existant.membre && !estSigne(existant) && existant.etape !== 'livree' && existant.etape !== 'annulee') { Object.assign(existant, champs); d = existant; }
  else {
    const j = new Date(now);
    d = { id: nouvelId('d'), numero: `CR-${j.getFullYear()}-${String(j.getMonth() + 1).padStart(2, '0')}-${c.numeroMembre.replace(/\D/g, '') || '0000'}`, membre: true, signeLe: null, signature: null, creditId: null, rdv: null, livreLe: null, ...champs };
    t.dossiers.unshift(d);
    d = t.dossiers[0];
  }
  t.monDossier = d.id;
  notifier(decision.approuve
    ? { titre: 'Crédit auto approuvé', sous: `${fcfa(sim.financement)} FCFA accordés pour ${veh.court}. Offre valable jusqu'au ${jourLong(d.offreJusqua)}.`, lien: '/auto/decision' }
    : { titre: 'Crédit auto refusé', sous: decision.motif ?? 'Dossier non retenu', lien: '/auto/decision' });
  return { dossier: d };
}

/** Signe le contrat : vérifie le code AssureMe, revérifie les 33 %, prend l'apport au coffre voiture et enregistre le crédit. */
export async function signer(trace: string, code: string): Promise<string | null> {
  const t = auto(); const d = monDossier(); const c = app.compte;
  if (!d || !c || !d.decision?.approuve) return "Aucune offre approuvée à signer.";
  if (estSigne(d)) return 'Ce contrat est déjà signé.';
  if (d.etape !== 'nouvelle' && d.etape !== 'etude' && d.etape !== 'accordee') return "Ce dossier n'est plus ouvert.";
  if (!offreValide(d)) return "L'offre a expiré (7 jours). Relancez une simulation.";
  if (!trace.trim()) return 'Signez dans le cadre pour continuer.';
  if (coffreVoiture() < d.apport) return `Votre coffre voiture contient ${fcfa(coffreVoiture())}, il faut ${fcfa(d.apport)} d'apport.`;
  const now = maintenant();
  if (estVerrouille(app.auth.verrou, now)) return `Trop d'essais. Réessayez dans ${Math.ceil(secondesAvantDeverrou(app.auth.verrou, now) / 60)} min.`;
  if (!/^\d{6}$/.test(code)) return 'Le code AssureMe compte 6 chiffres.';
  const bon = !!app.auth.hash && !!app.auth.sel && (await verifierHash(code, app.auth.sel, app.auth.hash).catch(() => false));
  if (!bon) { app.auth.verrou = apresEchec(app.auth.verrou, now); return 'Code incorrect.'; }
  app.auth.verrou = apresSucces();
  // La situation a pu changer depuis la décision (autre crédit pris entre-temps) : on revérifie.
  const veh = vehiculeDe(d.vehiculeId); if (!veh) return "Ce véhicule n'est plus au catalogue.";
  const sim = simuler({ prix: d.prix, apport: d.apport, duree: d.duree, assurance: d.assurance, tauxMensuel: d.taux, salaire: c.salaireNet, mensualitesExistantes: mensualitesExistantes() });
  const nouvelle = decider(entreeDecision(veh, sim, null));
  if (!nouvelle.approuve) return `Votre situation a changé depuis la décision : ${nouvelle.motif}.`;

  prendreDansCoffres('Voiture', d.apport, `Apport ${d.vehiculeTitre}`);
  const creditId = `c-auto-${d.id}`;
  app.credits.push({ id: creditId, produit: 'auto', libelle: libelleCredit(d.vehiculeTitre), capital: d.financement, mensualite: d.mensualite, duree: d.duree, payees: 0, prochaine: premierPrelevement(jourDe(new Date(now)), c.jourPaie), statut: 'actif' });
  d.signeLe = now; d.signature = trace; d.creditId = creditId;
  t.signatureEnregistree = trace;
  notifier({ titre: 'Contrat signé', sous: `${d.numero} · ${d.vehiculeTitre}. Rien n'est prélevé avant la remise des clés.`, lien: '/auto/livraison' });
  return null;
}

export const creneauxProposes = (): Creneau[] => creneaux(jourAujourdhui());
export function choisirCreneau(cr: Creneau): string | null {
  const d = monDossier(); if (!d || !estSigne(d)) return "Signez d'abord le contrat.";
  if (d.etape === 'livree') return 'Le véhicule est déjà livré.';
  d.rdv = { jour: cr.jour, heure: cr.heure, label: cr.label };
  return null;
}

/** Rétractation (48 h sans frais avant la livraison) : le crédit disparaît et l'apport revient dans le coffre. */
export function annuler(id: string): string | null {
  const d = dossierDe(id); if (!d || d.etape === 'livree' || d.etape === 'refusee' || d.etape === 'annulee') return 'Ce dossier ne peut plus être annulé.';
  rembourserSiSigne(d);
  d.etape = 'annulee'; d.rdv = null;
  if (auto().monDossier === d.id) auto().monDossier = null;
  return null;
}
function rembourserSiSigne(d: Dossier) {
  if (!d.signeLe) return;
  if (d.creditId) { const i = app.credits.findIndex((c) => c.id === d.creditId); if (i >= 0) app.credits.splice(i, 1); }
  if (d.membre) rendreAuxCoffres('Voiture', d.apport, `Apport rendu · ${d.vehiculeTitre}`);
  d.signeLe = null; d.signature = null; d.creditId = null;
}

// ------------------------------------------------------------------ côté concessionnaire
const SUIVANTE: Partial<Record<Etape, Etape>> = { nouvelle: 'etude', etude: 'accordee', accordee: 'livree' };
export const etapeSuivante = (d: Dossier): Etape | null => SUIVANTE[d.etape] ?? null;
export const LIBELLE_AVANCER: Partial<Record<Etape, string>> = { nouvelle: 'Passer en étude', etude: 'Accorder le financement', accordee: 'Confirmer la livraison' };
export const ouvrables = () => auto().dossiers.filter((d) => COLONNES.includes(d.etape));
export const clos = () => auto().dossiers.filter((d) => d.etape === 'refusee' || d.etape === 'annulee');

/** Remise des clés (confirmée par la concession ou par le membre) : AssureMe paie le concessionnaire, les prélèvements sur salaire démarrent. */
export function confirmerLivraison(id: string): string | null {
  const d = dossierDe(id); if (!d) return 'Dossier introuvable.';
  const err = verifierTransition(d, 'livree'); if (err) return err;
  const now = maintenant();
  d.etape = 'livree'; d.livreLe = now;
  const veh = vehiculeDe(d.vehiculeId); if (veh) { veh.vendu = true; veh.publie = false; }
  const credit = d.creditId ? app.credits.find((c) => c.id === d.creditId) : undefined;
  if (credit && app.compte) credit.prochaine = premierPrelevement(jourDe(new Date(now)), app.compte.jourPaie);
  if (d.membre) notifier({ titre: 'Clés remises, bonne route !', sous: credit ? `${d.vehiculeTitre}. Première mensualité de ${fcfa(d.mensualite)} FCFA le ${jourLong(credit.prochaine)}.` : d.vehiculeTitre, lien: '/auto/livraison' });
  return null;
}

/** Passe le dossier à l'étape suivante. Retourne un message d'erreur, ou null et le texte de confirmation via `resultat`. */
export function avancer(id: string): { erreur: string } | { ok: string } {
  const d = dossierDe(id); if (!d) return { erreur: 'Dossier introuvable.' };
  const vers = etapeSuivante(d); if (!vers) return { erreur: 'Cette demande est terminée.' };
  const err = verifierTransition(d, vers); if (err) return { erreur: err };
  if (vers === 'livree') {
    const e = confirmerLivraison(id); if (e) return { erreur: e };
    return { ok: `Livraison confirmée : AssureMe vous paie ${fcfa(d.financement)} FCFA` };
  }
  d.etape = vers;
  if (d.membre) notifier(vers === 'accordee'
    ? { titre: 'Véhicule réservé à votre nom', sous: `${CONCESSION} a accordé votre financement pour ${d.vehiculeTitre}.`, lien: '/auto/livraison' }
    : { titre: 'Dossier en étude', sous: `${CONCESSION} vérifie votre dossier (48 h en moyenne).`, lien: '/auto/livraison' });
  return { ok: vers === 'etude' ? 'Dossier en étude' : `Financement accordé à ${d.client.split(' ')[0]}` };
}
export function refuserDossier(id: string, motif = 'Refusé par le concessionnaire'): string | null {
  const d = dossierDe(id); if (!d) return 'Dossier introuvable.';
  if (!peutRefuser(d)) return 'Un dossier accordé ne peut plus être refusé.';
  rembourserSiSigne(d);
  d.etape = 'refusee'; d.motifRefus = motif; d.rdv = null;
  if (d.membre) notifier({ titre: 'Dossier refusé par le concessionnaire', sous: `${d.vehiculeTitre} : ${motif}.`, lien: '/auto/decision' });
  return null;
}
export function basculerPiece(id: string, i: number) {
  const d = dossierDe(id); if (d && d.etape === 'etude' && i >= 0 && i < d.docs.length) d.docs[i] = !d.docs[i];
}

export interface FormVehicule { titre: string; annee: string; prix: string; type: Vehicule['type']; etat: EtatVehicule; controle: boolean }
export function publierVehicule(f: FormVehicule): string | null {
  const titre = f.titre.trim(); const annee = f.annee.trim();
  const anneeMax = new Date(maintenant()).getFullYear() + 1;
  const prix = Number(f.prix.replace(/\D/g, ''));
  if (!titre) return 'Renseignez la marque et le modèle.';
  if (!/^(19|20)\d\d$/.test(annee) || Number(annee) > anneeMax) return 'Renseignez une année à 4 chiffres.';
  if (!prix || prix < 100_000) return 'Renseignez un prix en FCFA (100 000 minimum).';
  auto().vehicules.unshift({
    id: nouvelId('v'), titre: `${titre} ${annee}`, court: 'ce véhicule', type: f.type, etat: f.etat, prix, concession: CONCESSION, controle: f.controle, publie: true, vendu: false, couleur: '#9AA3B2',
    meta: `${f.etat === 'neuve' ? 'Neuve' : f.etat === 'quasi_neuve' ? 'Quasi neuve' : 'Occasion'} · ${CONCESSION}${f.controle ? ' · contrôlée' : ' · contrôle à venir'}`
  });
  return null;
}
export function basculerVehicule(id: string): string {
  const x = vehiculeDe(id); if (!x || x.vendu) return '';
  x.publie = !x.publie;
  return x.publie ? `${x.titre} publié` : `${x.titre} masqué du catalogue`;
}
export function supprimerVehicule(id: string): string | null {
  const t = auto(); const x = vehiculeDe(id); if (!x) return null;
  if (t.dossiers.some((d) => d.vehiculeId === id && COLONNES.includes(d.etape) && d.etape !== 'livree')) return 'Un dossier est en cours pour ce véhicule.';
  t.vehicules = t.vehicules.filter((y) => y.id !== id);
  if (t.brouillon?.vehiculeId === id) t.brouillon = null;
  return null;
}
export const basculerAssurance = () => { const t = auto(); t.assuranceProposee = !t.assuranceProposee; return t.assuranceProposee; };

export const statsMois = () => statistiquesVentes(auto().dossiers.map((d) => ({ montant: d.financement, livreLe: d.livreLe, etape: d.etape })), auto().baseVentes, maintenant());
export const livrees = () => auto().dossiers.filter((d) => d.etape === 'livree').sort((a, b) => (b.livreLe ?? 0) - (a.livreLe ?? 0));

/** Relevé des paiements en CSV (séparateur « ; », ouvrable dans un tableur). */
export function releveCsv(): string {
  const l = livrees().map((d) => [d.numero, d.client, d.vehiculeTitre, String(d.financement), d.livreLe ? jourDe(new Date(d.livreLe)) : ''].join(';'));
  return ['Dossier;Client;Véhicule;Montant reçu (FCFA);Date de réception', ...l].join('\n');
}
