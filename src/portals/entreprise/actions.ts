// Actions du portail employeur : elles écrivent uniquement dans la tranche « entreprise » (l'état du membre n'est jamais modifié).
import { analyserInvitations, codeEntreprise, etapeEnErreur, normaliserId, normaliserTel, toutValider, validerEtape, type ChampsInscription, type Erreurs, type LigneImport, type PartEmployeur } from '../../core/entreprise.ts';
import type { Jour } from '../../core/dates.ts';
import { maintenant, nouvelId } from '../../data/store.svelte.ts';
import { ent, type Attestation, type Entreprise, type Salarie } from './etat.ts';
import { lignes } from './vues.ts';

export const champsVides = (): ChampsInscription => ({
  raisonSociale: '', rccm: '', niu: '', secteur: 'Transport et logistique', ville: 'Douala', effectif: '', contactNom: '', contactFonction: '', contactTelephone: '',
  jourPaie: '28', part: 0.5, signature: '', convention: false
});
export const champsDe = (e: Entreprise): ChampsInscription => ({
  raisonSociale: e.raisonSociale, rccm: e.rccm, niu: e.niu, secteur: e.secteur, ville: e.ville, effectif: String(e.effectif),
  contactNom: e.contact.nom, contactFonction: e.contact.fonction, contactTelephone: e.contact.telephone, jourPaie: String(e.jourPaie), part: e.part, signature: e.signataire, convention: true
});
/** Valeurs de départ du formulaire : l'entreprise déjà inscrite (modification), sinon le brouillon, sinon un formulaire vide. */
export function champsInitiaux(): ChampsInscription {
  const t = ent();
  return t.entreprise ? champsDe(t.entreprise) : { ...champsVides(), ...(t.brouillon ?? {}) };
}

export function enregistrerBrouillon(c: ChampsInscription) { ent().brouillon = { ...c, signature: '', convention: false }; }

export type ResultatEnvoi = { ok: true } | { ok: false; erreurs: Erreurs; etape: 1 | 2 | 3 };
/** Crée l'entreprise (dossier « envoyé » : la part Pass ne s'applique qu'une fois validé) ou met à jour celle qui existe. */
export function envoyerDossier(c: ChampsInscription): ResultatEnvoi {
  const erreurs = toutValider(c);
  const etape = etapeEnErreur(c);
  if (etape) return { ok: false, erreurs, etape };
  const t = ent();
  const base = {
    raisonSociale: c.raisonSociale.trim(), rccm: normaliserId(c.rccm), niu: normaliserId(c.niu), secteur: c.secteur, ville: c.ville.trim(), effectif: Number(c.effectif),
    contact: { nom: c.contactNom.trim(), fonction: c.contactFonction.trim(), telephone: normaliserTel(c.contactTelephone, true)! },
    jourPaie: Number(c.jourPaie), part: c.part as PartEmployeur, signataire: c.signature.trim()
  };
  if (t.entreprise) Object.assign(t.entreprise, base);
  else t.entreprise = { ...base, code: codeEntreprise(base.raisonSociale, maintenant()), statut: 'envoye', cree: maintenant() };
  t.brouillon = null;
  return { ok: true };
}
/** Simulation : l'équipe partenaires valide le dossier (à partir de là, la part employeur réduit le Pass des salariés). */
export function simulerValidationDossier() { const e = ent().entreprise; if (e) e.statut = 'valide'; }

export type ResultatParametres = { ok: true } | { ok: false; erreurs: Erreurs };
export function enregistrerParametres(p: Pick<ChampsInscription, 'contactNom' | 'contactFonction' | 'contactTelephone' | 'jourPaie' | 'part'>): ResultatParametres {
  const e = ent().entreprise; if (!e) return { ok: false, erreurs: {} };
  const c = { ...champsDe(e), ...p };
  const erreurs = { ...validerEtape(2, c), ...validerEtape(3, c) };
  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  e.contact = { nom: c.contactNom.trim(), fonction: c.contactFonction.trim(), telephone: normaliserTel(c.contactTelephone, true)! };
  e.jourPaie = Number(c.jourPaie); e.part = c.part as PartEmployeur;
  return { ok: true };
}

// ------------------------------------------------------------------ salariés
export const telephonesConnus = () => { const t = ent(); return [...t.salaries.map((s) => s.telephone), ...t.invitations.map((i) => i.telephone)]; };
export const matriculesConnus = () => ent().salaries.map((s) => s.matricule);

/** Ajoute les lignes valides d'un import CSV (statut « invité » : le salarié rejoint l'entreprise avec son code). */
export function importerSalaries(valides: LigneImport[]): number {
  const t = ent(); let n = 0;
  for (const l of valides) {
    if (l.erreurs.length || t.salaries.some((s) => s.telephone === l.telephone || normaliserId(s.matricule) === normaliserId(l.matricule))) continue;
    t.salaries.push({ id: nouvelId('s'), nom: l.nom, matricule: l.matricule, telephone: l.telephone, service: l.service, salaire: l.salaire, pass: null, score: 0, credit: 0, coffre: 0, statut: 'invite', ajoute: maintenant() });
    n++;
  }
  return n;
}
/** Enregistre les invitations (SMS simulé). Les numéros déjà connus sont ignorés. */
export function inviter(texte: string) {
  const t = ent();
  const r = analyserInvitations(texte, telephonesConnus());
  for (const tel of r.valides) t.invitations.push({ id: nouvelId('i'), telephone: tel, envoyee: maintenant(), relances: 0 });
  return r;
}
export function relancer(id: string) { const i = ent().invitations.find((x) => x.id === id); if (i) { i.relances++; i.envoyee = maintenant(); } }
export function annulerInvitation(id: string) { const t = ent(); t.invitations = t.invitations.filter((x) => x.id !== id); }

/** Le salarié enregistré ; la ligne du membre (compte de cet appareil) est enregistrée à sa première modification. */
function enregistre(id: string): Salarie | undefined {
  const t = ent();
  const trouve = t.salaries.find((s) => s.id === id);
  if (trouve || !id.startsWith('m-')) return trouve;
  const l = lignes().find((x) => x.id === id); if (!l) return undefined;
  t.salaries.push({ id: l.id, nom: l.nom, matricule: l.matricule, telephone: l.telephone, service: l.service, salaire: l.salaire, pass: l.pass, score: l.score, credit: 0, coffre: l.coffre, statut: l.statut, ajoute: l.ajoute, anciennete: l.anciennete });
  return t.salaries[t.salaries.length - 1];
}
export function validerRetenue(id: string): boolean { const s = enregistre(id); if (!s || s.statut !== 'nouveau') return false; s.statut = 'valide'; return true; }
/** Simulation : le salarié invité crée son compte (Pass Essentiel, niveau Start). */
export function simulerInscription(id: string): boolean {
  const t = ent(); const s = t.salaries.find((x) => x.id === id); if (!s || s.statut !== 'invite') return false;
  s.statut = 'nouveau'; s.pass = 'essentiel'; s.score = 500;
  t.invitations = t.invitations.filter((i) => i.telephone !== s.telephone);
  return true;
}
export function modifierSalaire(id: string, texte: string): string | null {
  const brut = texte.replace(/\s|FCFA/gi, '');
  if (!/^\d{1,9}$/.test(brut)) return 'Indiquez un montant en chiffres, sans virgule.';
  const n = Number(brut); if (n < 1) return 'Le salaire doit être supérieur à 0.';
  if (lignes().find((l) => l.id === id)?.membre) return 'Le salaire de ce membre vient de son compte AssureMe.';
  const s = enregistre(id); if (!s) return 'Salarié introuvable.';
  s.salaire = n; return null;
}

// ------------------------------------------------------------------ paie et attestations
export function avancerSuivi(paie: Jour): 'integre' | 'reverse' | null {
  const t = ent(); const cur = t.suivi[paie];
  if (!cur) { t.suivi[paie] = 'integre'; return 'integre'; }
  if (cur === 'integre') { t.suivi[paie] = 'reverse'; return 'reverse'; }
  return null;
}
export type ResultatAttestation = { ok: true; attestation: Attestation } | { ok: false; erreur: string };
export function emettreAttestation(id: string): ResultatAttestation {
  const t = ent(); const l = lignes().find((x) => x.id === id);
  if (!l) return { ok: false, erreur: 'Salarié introuvable.' };
  if (l.statut === 'invite') return { ok: false, erreur: "Ce salarié n'est pas encore inscrit." };
  if (l.salaire <= 0) return { ok: false, erreur: 'Renseignez le salaire net avant de délivrer une attestation.' };
  const annee = new Date(maintenant()).getFullYear();
  const a: Attestation = { id: nouvelId('a'), numero: `ATT-${annee}-${String(t.attestations.length + 1).padStart(4, '0')}`, salarieId: l.id, salarie: l.nom, matricule: l.matricule, salaire: l.salaire, ts: maintenant() };
  t.attestations.unshift(a);
  return { ok: true, attestation: a };
}
