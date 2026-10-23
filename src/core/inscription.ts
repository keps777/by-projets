// Inscription et profil : employeur, Pass, identité, numéros, appareils. Fonctions pures (testées dans inscription.test.ts).
import { type Jour, enDate, jourDe } from './dates.ts';
import type { Pass } from './credit.ts';
import { partEmployeurPass } from './prelevement.ts';

// ------------------------------------------------------------------ employeur
export interface Employeur { code: string; nom: string; nomCompte: string; effectif: number; part: number; plafond: number; scoreDepart: number }
/** Employeurs partenaires connus (backend simulé). */
export const EMPLOYEURS: Employeur[] = [
  { code: 'NDIBA-2026', nom: 'Groupe Ndiba Logistique', nomCompte: 'NDIBA LOGISTIQUE', effectif: 312, part: 0.5, plafond: 12_500, scoreDepart: 610 }
];
export const SCORE_DEPART_DEFAUT = 500;
export const normaliserCodeEmployeur = (s: string) => s.trim().toUpperCase();
export const trouverEmployeur = (s: string): Employeur | null => EMPLOYEURS.find((e) => e.code === normaliserCodeEmployeur(s)) ?? null;
export const trouverEmployeurParNom = (nom: string): Employeur | null => EMPLOYEURS.find((e) => e.nomCompte === nom.trim().toUpperCase()) ?? null;
export type StatutEmployeur = 'vide' | 'valide' | 'inconnu';
export const statutEmployeur = (s: string): StatutEmployeur => (normaliserCodeEmployeur(s) === '' ? 'vide' : trouverEmployeur(s) ? 'valide' : 'inconnu');
export const scoreDepart = (e: Employeur | null) => (e ? e.scoreDepart : SCORE_DEPART_DEFAUT);

// ------------------------------------------------------------------ Pass
export type Facturation = 'mensuel' | 'annuel';
export const REMISE_ANNUELLE = 0.1;
export interface PlanPass { id: Pass; nom: string; etiquette: string; prix: number; description: string; inclus: [string, string][] }
export const PLANS: PlanPass[] = [
  { id: 'essentiel', nom: 'Essentiel', etiquette: 'SOLO', prix: 9_000, description: 'Santé de base pour une personne, assurance obsèques, épargne automatique.',
    inclus: [['Santé de base, 1 personne', '80 %'], ['Assurance obsèques', '1 M'], ['Épargne automatique', 'inclus'], ['Téléconsultation', '2 / an']] },
  { id: 'famille', nom: 'Famille', etiquette: 'LE PLUS CHOISI', prix: 25_000, description: "Santé complète jusqu'à 6 personnes, téléconsultation, obsèques et perte d'emploi, crédits école, loyer, équipement.",
    inclus: [["Santé complète, jusqu'à 6 personnes", '80 %'], ['Téléconsultation illimitée', '24 h / 24'], ["Obsèques et perte d'emploi", '2 M'], ['Crédits école, loyer, équipement', '1,5 % / mois'], ['Carte famille partagée', '6 cartes']] },
  { id: 'premium', nom: 'Premium', etiquette: 'MOBILITÉ INCLUSE', prix: 60_000, description: "Tout Famille, évacuation sanitaire, assurance auto, taux réduits partout.",
    inclus: [['Tout le Pass Famille', 'inclus'], ['Évacuation sanitaire', 'Afrique'], ['Assurance auto tous risques', '1 véhicule'], ['Taux réduits partout', '− 0,3 pt'], ['Conseiller dédié', 'WhatsApp']] }
];
export const planDe = (p: Pass): PlanPass => PLANS.find((x) => x.id === p) ?? PLANS[1];
/** Nombre de cartes santé du Pass (le titulaire compte pour une). */
export const CARTES_MAX: Record<Pass, number> = { essentiel: 1, famille: 6, premium: 6 };
export interface TarifPass { total: number; employeur: number; membre: number; unite: 'mois' | 'an' }
/** Prix du Pass pour la période choisie. L'employeur prend sa part (plafonnée par mois) ; l'annuel est remisé de 10 %. */
export function tarifPass(pass: Pass, facturation: Facturation, employeur: Employeur | null): TarifPass {
  const plan = planDe(pass);
  const annuel = facturation === 'annuel';
  const mois = annuel ? 12 : 1;
  const total = Math.round(plan.prix * mois * (annuel ? 1 - REMISE_ANNUELLE : 1));
  const emp = employeur ? Math.min(partEmployeurPass(plan.prix, employeur.part, employeur.plafond) * mois, total) : 0;
  return { total, employeur: emp, membre: total - emp, unite: annuel ? 'an' : 'mois' };
}

// ------------------------------------------------------------------ identité
const MAJ = /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’-]*$/;
export const capitaliser = (s: string) => s.toLocaleLowerCase('fr').replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('fr'));
/** Sur une CNI le nom est en capitales, suivi des prénoms : « NGONO Aïcha Marthe » → nom « Ngono », prénom « Aïcha ». */
export function separerNom(complet: string): { nom: string; prenom: string } {
  const mots = complet.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return { nom: '', prenom: '' };
  let n = 0;
  while (n < mots.length && MAJ.test(mots[n])) n++;
  if (n === 0) return { nom: capitaliser(mots[mots.length - 1]), prenom: mots[0] === mots[mots.length - 1] ? '' : mots[0] };
  if (n === mots.length) return mots.length === 1 ? { nom: capitaliser(mots[0]), prenom: '' } : { nom: capitaliser(mots[0]), prenom: capitaliser(mots[1]) };
  return { nom: capitaliser(mots.slice(0, n).join(' ')), prenom: mots[n] };
}
/** « 14 · 03 · 1991 », « 14/03/1991 », « 14031991 » → « 1991-03-14 » ; null si la date n'existe pas. */
export function lireNaissance(texte: string): Jour | null {
  const t = texte.trim();
  const m = /^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/.exec(t) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (!m) return null;
  const [j, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(a, mo - 1, j, 12);
  if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j) return null;
  return jourDe(d);
}
export function ageAu(naissance: Jour, now: number): number {
  const n = enDate(naissance), a = new Date(now);
  let age = a.getFullYear() - n.getFullYear();
  if (a.getMonth() < n.getMonth() || (a.getMonth() === n.getMonth() && a.getDate() < n.getDate())) age--;
  return age;
}
export interface ErreursIdentite { nom?: string; cni?: string; naissance?: string }
export function verifierIdentite(i: { nomComplet: string; cni: string; naissance: string }, now: number): { ok: boolean; erreurs: ErreursIdentite } {
  const erreurs: ErreursIdentite = {};
  const { nom, prenom } = separerNom(i.nomComplet);
  if (!nom || !prenom) erreurs.nom = 'Nom puis prénom, comme sur votre CNI.';
  const cni = i.cni.replace(/\s/g, '');
  if (cni.length < 6 || cni.length > 20) erreurs.cni = 'Numéro de CNI incomplet.';
  const dob = lireNaissance(i.naissance);
  if (!dob) erreurs.naissance = 'Date au format JJ / MM / AAAA.';
  else { const age = ageAu(dob, now); if (age < 18) erreurs.naissance = 'Il faut avoir 18 ans pour ouvrir un compte.'; else if (age > 110) erreurs.naissance = 'Date de naissance improbable.'; }
  return { ok: Object.keys(erreurs).length === 0, erreurs };
}
/** Le code est une date de naissance (JJMMAA ou AAMMJJ) : à éviter. */
export function codeEstNaissance(code: string, naissance: Jour | null): boolean {
  if (!naissance || code.length !== 6) return false;
  const [a, m, j] = naissance.split('-');
  return code === `${j}${m}${a.slice(2)}` || code === `${a.slice(2)}${m}${j}` || code === `${m}${j}${a.slice(2)}`;
}
export const initiales = (prenom: string, nom: string) => `${prenom[0] ?? ''}${nom[0] ?? ''}`.toLocaleUpperCase('fr') || '?';

// ------------------------------------------------------------------ numéros de membre
function empreinte(s: string, graine: number): number {
  let h = 0x811c9dc5 ^ graine;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** Numéro de membre (« AM4821 ») et fin du numéro de carte (« 0937 ») tirés du téléphone : stables pour un même numéro. */
export function numerosMembre(tel: string): { membre: string; fin: string } {
  return { membre: `AM${String(empreinte(tel, 1) % 9000 + 1000)}`, fin: String(empreinte(tel, 2) % 10000).padStart(4, '0') };
}
/** « AICHA-4821 » */
export function codeParrain(prenom: string, numeroMembre: string): string {
  const base = prenom.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '') || 'AMI';
  return `${base}-${numeroMembre.replace(/\D/g, '')}`;
}
/** « 10 / 2029 » : la carte est valable trois ans. */
export function validiteCarte(now: number): string {
  const d = new Date(now);
  return `${String(d.getMonth() + 1).padStart(2, '0')} / ${d.getFullYear() + 3}`;
}

// ------------------------------------------------------------------ appareils et durées
export function nomAppareil(ua: string): { nom: string; systeme: string } {
  if (/iPhone/.test(ua)) return { nom: 'iPhone', systeme: `iOS ${(/OS (\d+)[_\d]*/.exec(ua)?.[1]) ?? ''}`.trim() };
  if (/iPad/.test(ua)) return { nom: 'iPad', systeme: 'iPadOS' };
  const android = /Android ([\d.]+)(?:; ([^;)]+))?/.exec(ua);
  if (android) {
    const modele = android[2]?.trim();
    const nom = !modele || modele === 'K' || /^(Linux|U)$/.test(modele) ? 'Téléphone Android' : modele;
    return { nom, systeme: `Android ${android[1].split('.')[0]}` };
  }
  if (/Windows/.test(ua)) return { nom: 'Ordinateur Windows', systeme: 'Windows' };
  if (/Macintosh/.test(ua)) return { nom: 'Mac', systeme: 'macOS' };
  if (/Linux/.test(ua)) return { nom: 'Ordinateur Linux', systeme: 'Linux' };
  return { nom: 'Cet appareil', systeme: 'Système inconnu' };
}
/** « Cet iPhone », « Ce téléphone Android », « Cet ordinateur Linux » : le nom de l'appareil courant dans une liste. */
export function cetAppareil(nom: string): string {
  if (nom === 'Mac') return 'Ce Mac';
  if (nom.startsWith('Téléphone')) return `Ce téléphone${nom.slice('Téléphone'.length)}`;
  if (nom.startsWith('Ordinateur')) return `Cet ordinateur${nom.slice('Ordinateur'.length)}`;
  if (nom === 'Cet appareil') return nom;
  return `Cet ${nom}`;
}
/** « il y a 2 h », « il y a 6 jours » */
export function ilYa(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return "à l'instant";
  const min = Math.floor(s / 60); if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24); if (j < 30) return `il y a ${j} jour${j > 1 ? 's' : ''}`;
  const mo = Math.floor(j / 30); return `il y a ${mo} mois`;
}
/** « 14:52 » */
export const minutesSecondes = (secondes: number) => `${String(Math.floor(secondes / 60)).padStart(2, '0')}:${String(secondes % 60).padStart(2, '0')}`;
/** « 1 MIN 52 S » */
export function dureeCourte(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)} MIN ${String(s % 60).padStart(2, '0')} S`;
}

/** Au-dessus de ce montant, un paiement demande le code (si le réglage est actif). */
export const SEUIL_CODE_PAIEMENT = 50_000;
export const codePaiementRequis = (montant: number, actif: boolean) => actif && montant > SEUIL_CODE_PAIEMENT;
