// Entreprise partenaire : validation de l'inscription, part du Pass, retenues de paie, calendrier, import de salariés.
import { PLAFOND_ENDETTEMENT, type Pass } from './credit.ts';
import { ajouterJours, ajouterMois, enDate, jourDe, prochainePaie, type Jour } from './dates.ts';
import { lireCsv } from './csv.ts';
import { partEmployeurPass, partMembrePass } from './prelevement.ts';
import { PRIX_PASS } from './sante.ts';

export const PLAFOND_PART_EMPLOYEUR = 12_500;
export const PARTS_EMPLOYEUR = [0, 0.5, 1] as const;
export type PartEmployeur = (typeof PARTS_EMPLOYEUR)[number];
export const libellePart = (p: number) => (p === 0 ? 'Aucune' : `${Math.round(p * 100)} %`);

// ------------------------------------------------------------------ identifiants
/** Numéro de téléphone camerounais à 9 chiffres (indicatif +237 accepté) ; `fixe` autorise aussi les numéros en 2. */
export function normaliserTel(texte: string, fixe = false): string | null {
  const c = texte.replace(/[\s.\-()]/g, '');
  const m = /^(?:(?:\+|00)237)?(\d{9})$/.exec(c);
  if (!m) return null;
  return (fixe ? /^[26]/ : /^6/).test(m[1]) ? m[1] : null;
}
export const formaterTel = (n: string) => `+237 ${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
const compact = (s: string) => s.replace(/\s/g, '').toUpperCase();
export const niuValide = (s: string) => /^M\d{12}$/.test(compact(s));
export const rccmValide = (s: string) => /^RC\/[A-Z]{3}\/\d{4}\/[A-Z]\/\d{1,6}$/.test(compact(s));
export const normaliserId = compact;

// ------------------------------------------------------------------ inscription
export interface ChampsInscription {
  raisonSociale: string; rccm: string; niu: string; secteur: string; ville: string; effectif: string;
  contactNom: string; contactFonction: string; contactTelephone: string;
  jourPaie: string; part: number; signature: string; convention: boolean;
}
export type Erreurs = Partial<Record<keyof ChampsInscription, string>>;
export const OBLIGATOIRE = 'Champ obligatoire';

/** Valide une étape (1 entreprise · 2 contact RH · 3 paie et Pass). Aucune erreur = étape valide. */
export function validerEtape(etape: 1 | 2 | 3, c: ChampsInscription): Erreurs {
  const e: Erreurs = {};
  if (etape === 1) {
    if (c.raisonSociale.trim().length < 2) e.raisonSociale = OBLIGATOIRE;
    if (!c.rccm.trim()) e.rccm = OBLIGATOIRE; else if (!rccmValide(c.rccm)) e.rccm = 'Format attendu : RC/DLA/2014/B/1287';
    if (!c.niu.trim()) e.niu = OBLIGATOIRE; else if (!niuValide(c.niu)) e.niu = 'Le NIU commence par M et compte 13 caractères';
    const eff = Number(c.effectif.trim());
    if (!/^\d+$/.test(c.effectif.trim()) || eff < 1 || eff > 100_000) e.effectif = 'Indiquez un nombre de salariés entre 1 et 100 000';
    if (!c.ville.trim()) e.ville = OBLIGATOIRE;
  }
  if (etape === 2) {
    if (c.contactNom.trim().length < 2) e.contactNom = OBLIGATOIRE;
    if (!c.contactFonction.trim()) e.contactFonction = OBLIGATOIRE;
    if (!normaliserTel(c.contactTelephone, true)) e.contactTelephone = 'Numéro camerounais à 9 chiffres (ex. 6 91 22 48 21)';
  }
  if (etape === 3) {
    const j = Number(c.jourPaie);
    if (!/^\d{1,2}$/.test(c.jourPaie.trim()) || j < 1 || j > 31) e.jourPaie = 'Un jour entre 1 et 31';
    if (!(PARTS_EMPLOYEUR as readonly number[]).includes(c.part)) e.part = 'Choisissez 0, 50 ou 100 %';
    if (!c.signature.trim()) e.signature = 'Signez en tapant votre nom.';
    else if (!c.convention) e.convention = 'Cochez la case pour accepter la convention.';
  }
  return e;
}
export const toutValider = (c: ChampsInscription): Erreurs => ({ ...validerEtape(1, c), ...validerEtape(2, c), ...validerEtape(3, c) });
/** Étape de la première erreur (pour y revenir), ou 0 si tout est valide. */
export function etapeEnErreur(c: ChampsInscription): 0 | 1 | 2 | 3 {
  return Object.keys(validerEtape(1, c)).length ? 1 : Object.keys(validerEtape(2, c)).length ? 2 : Object.keys(validerEtape(3, c)).length ? 3 : 0;
}

/** Code que les salariés saisissent pour rejoindre l'entreprise : initiales + 4 chiffres tirés de `graine`. */
export function codeEntreprise(raisonSociale: string, graine: number): string {
  const mots = raisonSociale.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter((m) => m.length > 1 && !['SA', 'SARL', 'SAS', 'ET', 'DE', 'DU', 'DES', 'LA', 'LE'].includes(m));
  const ini = (mots.map((m) => m[0]).join('') + 'XXX').slice(0, 3);
  return `${ini}-${String(Math.abs(Math.floor(graine)) % 10_000).padStart(4, '0')}`;
}

// ------------------------------------------------------------------ Pass et retenues
export interface EntreeRetenue { salaire: number; pass: Pass | null; credit: number; coffre: number }
export interface Retenue { pass: number; credit: number; coffre: number; total: number; employeur: number; plafonne: boolean; plafondCredit: number }
/** Plafond mensuel des crédits d'un salarié : 33 % de son net. */
export const plafondCredit = (salaire: number) => Math.floor(salaire * PLAFOND_ENDETTEMENT);

/** Ce que l'employeur retient sur la paie d'un salarié : part du Pass restant à sa charge, crédits (limités à 33 % du net), coffre. */
export function retenueSalarie(e: EntreeRetenue, partEmployeur: number): Retenue {
  const prix = e.pass ? PRIX_PASS[e.pass] : 0;
  const plafond = plafondCredit(e.salaire);
  const credit = e.salaire > 0 ? Math.min(e.credit, plafond) : e.credit;
  const pass = e.pass ? partMembrePass(prix, partEmployeur, PLAFOND_PART_EMPLOYEUR) : 0;
  return { pass, credit, coffre: e.coffre, total: pass + credit + e.coffre, employeur: e.pass ? partEmployeurPass(prix, partEmployeur, PLAFOND_PART_EMPLOYEUR) : 0, plafonne: e.salaire > 0 && e.credit > plafond, plafondCredit: plafond };
}
/** Coût mensuel employeur : somme des parts de Pass prises en charge pour les salariés ayant un Pass. */
export const coutMensuelEmployeur = (pass: (Pass | null)[], partEmployeur: number) =>
  pass.reduce((s, p) => s + (p ? partEmployeurPass(PRIX_PASS[p], partEmployeur, PLAFOND_PART_EMPLOYEUR) : 0), 0);

// ------------------------------------------------------------------ calendrier de paie
export function ajouterJoursOuvres(j: Jour, n: number): Jour {
  let r = j, reste = n;
  while (reste > 0) { r = ajouterJours(r, 1); const d = enDate(r).getDay(); if (d !== 0 && d !== 6) reste--; }
  return r;
}
export interface EcheancePaie { paie: Jour; fichierAvant: Jour; reversement: Jour }
/** Les `n` prochaines paies à partir de `depuis` : fichier de retenues à intégrer 3 jours avant, reversement sous 2 jours ouvrés. */
export function calendrierPaie(jourPaie: number, depuis: Jour, n = 6): EcheancePaie[] {
  const res: EcheancePaie[] = [];
  let p = prochainePaie(depuis, jourPaie);
  while (res.length < n) { res.push({ paie: p, fichierAvant: ajouterJours(p, -3), reversement: ajouterJoursOuvres(p, 2) }); p = ajouterMois(p, 1, jourPaie); }
  return res;
}
export const jourAujourdhui = (now: number): Jour => jourDe(new Date(now));

// ------------------------------------------------------------------ import de salariés (CSV)
export interface LigneImport { ligne: number; nom: string; matricule: string; telephone: string; salaire: number; service: string; erreurs: string[] }
export interface AnalyseImport { lignes: LigneImport[]; valides: LigneImport[]; erreursGlobales: string[] }
export const MAX_IMPORT = 2000;
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const ALIAS: Record<string, 'nom' | 'matricule' | 'telephone' | 'salaire' | 'service'> = {
  nom: 'nom', salarie: 'nom', nomcomplet: 'nom', matricule: 'matricule', mat: 'matricule', telephone: 'telephone', tel: 'telephone', mobile: 'telephone', phone: 'telephone',
  salaire: 'salaire', salairenet: 'salaire', net: 'salaire', service: 'service', departement: 'service', poste: 'service'
};
export const MODELE_CSV = 'nom;matricule;telephone;salaire_net;service\r\nJean Exemple;NDL-0001;6 90 00 00 00;350000;Logistique\r\n';

/** Analyse un CSV de salariés : colonnes nom, matricule, téléphone (+ salaire net et service facultatifs). Erreurs ligne par ligne. */
export function analyserImport(texte: string, existants: { matricules: string[]; telephones: string[] } = { matricules: [], telephones: [] }): AnalyseImport {
  const rows = lireCsv(texte);
  const erreursGlobales: string[] = [];
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop();
  if (!rows.length) return { lignes: [], valides: [], erreursGlobales: ['Le fichier est vide.'] };
  const entete = rows[0].map((c) => ALIAS[sansAccent(c)]);
  const aEntete = entete.includes('nom') || entete.includes('matricule') || entete.includes('telephone');
  const cols = aEntete ? entete : (['nom', 'matricule', 'telephone', 'salaire', 'service'] as const);
  if (aEntete) for (const c of ['nom', 'matricule', 'telephone'] as const) if (!cols.includes(c)) erreursGlobales.push(`Colonne « ${c === 'telephone' ? 'téléphone' : c} » introuvable dans l'en-tête.`);
  if (rows.length - (aEntete ? 1 : 0) > MAX_IMPORT) erreursGlobales.push(`Trop de lignes : ${MAX_IMPORT} au maximum par import.`);
  if (erreursGlobales.length) return { lignes: [], valides: [], erreursGlobales };

  const dejaMat = new Map(existants.matricules.map((m) => [normaliserId(m), 'déjà enregistré']));
  const dejaTel = new Map(existants.telephones.map((t) => [t, 'déjà enregistré']));
  const lignes: LigneImport[] = [];
  rows.forEach((r, i) => {
    if (i === 0 && aEntete) return;
    if (r.every((c) => !c.trim())) return;
    const v = (k: string) => (r[cols.indexOf(k as never)] ?? '').trim();
    const erreurs: string[] = [];
    const nom = v('nom'), matricule = v('matricule'), brutTel = v('telephone'), brutSalaire = v('salaire').replace(/\s|FCFA|F$/gi, '');
    if (nom.length < 2) erreurs.push('Nom manquant'); else if (nom.length > 80) erreurs.push('Nom trop long');
    const mat = normaliserId(matricule);
    if (!matricule) erreurs.push('Matricule manquant'); else if (!/^[A-Z0-9._\-/]{2,20}$/.test(mat)) erreurs.push('Matricule invalide (2 à 20 caractères, sans espace)');
    else if (dejaMat.has(mat)) erreurs.push(`Matricule ${dejaMat.get(mat)}`);
    const tel = normaliserTel(brutTel);
    if (!brutTel) erreurs.push('Téléphone manquant'); else if (!tel) erreurs.push('Téléphone invalide (9 chiffres, commençant par 6)');
    else if (dejaTel.has(tel)) erreurs.push(`Téléphone ${dejaTel.get(tel)}`);
    let salaire = 0;
    if (brutSalaire) { if (/^\d{1,9}$/.test(brutSalaire)) salaire = Number(brutSalaire); else erreurs.push('Salaire illisible (chiffres uniquement)'); }
    if (!erreurs.length) { dejaMat.set(mat, `en double (ligne ${i + 1})`); if (tel) dejaTel.set(tel, `en double (ligne ${i + 1})`); }
    lignes.push({ ligne: i + 1, nom, matricule: mat || matricule, telephone: tel ?? brutTel, salaire, service: v('service'), erreurs });
  });
  if (!lignes.length) erreursGlobales.push('Aucune ligne de salarié dans le fichier.');
  return { lignes, valides: lignes.filter((l) => !l.erreurs.length), erreursGlobales };
}

/** Analyse la saisie d'invitations (un numéro par ligne) : numéros valides, et erreur par ligne. */
export function analyserInvitations(texte: string, deja: string[] = []): { valides: string[]; erreurs: { ligne: number; texte: string; message: string }[] } {
  const valides: string[] = [], erreurs: { ligne: number; texte: string; message: string }[] = [];
  const vus = new Set(deja);
  texte.split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    const t = normaliserTel(l);
    if (!t) erreurs.push({ ligne: i + 1, texte: l.trim(), message: l.includes('@') ? "Pas d'e-mail : un numéro de téléphone suffit" : 'Numéro invalide (9 chiffres, commençant par 6)' });
    else if (vus.has(t)) erreurs.push({ ligne: i + 1, texte: l.trim(), message: 'Déjà invité ou inscrit' });
    else { vus.add(t); valides.push(t); }
  });
  return { valides, erreurs };
}
