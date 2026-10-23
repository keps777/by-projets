// Actions du parcours d'accès : inscription, connexion, verrouillage, appareils, démo. La logique pure est dans core/auth.ts et core/inscription.ts.
import { app, maintenant, nouvelId, notifier, reinitialiser } from '../../data/store.svelte.ts';
import { CODE_DEMO, CODE_SMS_DEMO } from '../../data/constantes.ts';
import type { Appareil } from '../../data/types.ts';
import {
  apresEchec, apresSucces, chiffresTel, codeTropSimple, creerOtp, estVerrouille, hacher, selAleatoire, verifierHash, verifierOtp, type ResultatOtp
} from '../../core/auth.ts';
import { jourDe, prochainePaie } from '../../core/dates.ts';
import { numerosMembre, planDe, scoreDepart, separerNom, trouverEmployeur } from '../../core/inscription.ts';
import type { Pass } from '../../core/credit.ts';
import type { Facturation } from '../../core/inscription.ts';
import { etatAuth, type PermissionNotif, type Proche } from './etat.ts';
import { afficherSms, masquerSms, temp } from './memoire.svelte.ts';
import { descriptionAppareil, idAppareil } from './appareil.ts';
import { enregistrerBiometrie, verifierBiometrie } from './biometrie.ts';

// ------------------------------------------------------------------ code SMS (simulé)
/** Génère un code SMS (toujours 123456 en démonstration), le garde haché et l'affiche dans le bandeau. */
export async function envoyerOtp(tel: string) {
  app.auth.telephoneEnCours = chiffresTel(tel);
  app.auth.otp = await creerOtp(CODE_SMS_DEMO, maintenant());
  afficherSms(CODE_SMS_DEMO);
}
export async function controlerOtp(code: string): Promise<ResultatOtp> {
  const r = await verifierOtp(app.auth.otp ? { ...app.auth.otp } : null, code, maintenant());
  app.auth.otp = r.otp;
  if (r.resultat === 'ok') masquerSms();
  return r.resultat;
}

// ------------------------------------------------------------------ appareils
export function appareilCourant(): Appareil {
  const d = descriptionAppareil();
  return { id: idAppareil(), nom: d.nom, lieu: 'Cameroun', quand: maintenant(), actuel: true, biometrie: app.auth.biometrie };
}
/** Un appareil est « nouveau » quand le compte a déjà des appareils de confiance et que celui-ci n'en fait pas partie. */
export const estNouvelAppareil = () => app.auth.appareils.length > 0 && !app.auth.appareils.some((a) => a.id === idAppareil());
export const estBloque = () => etatAuth().bloques.includes(idAppareil());
function enregistrerCetAppareil() {
  const id = idAppareil();
  const existant = app.auth.appareils.find((a) => a.id === id);
  if (existant) { existant.quand = maintenant(); existant.actuel = true; }
  else app.auth.appareils.unshift(appareilCourant());
}
export function approuverAppareil() {
  ouvrirSession();
  temp.codeVerifie = false; temp.smsVerifie = false;
}
/** « Ce n'est pas moi » : cet appareil est bloqué, les autres sessions sont fermées, le code doit être changé. */
export function securiserCompte() {
  const e = etatAuth();
  if (!e.bloques.includes(idAppareil())) e.bloques.push(idAppareil());
  app.auth.appareils = [];
  app.auth.connecte = false; app.auth.derniereActivite = 0;
  temp.codeVerifie = false; temp.smsVerifie = false;
}
export function retirerAppareil(id: string): Appareil | null {
  if (id === idAppareil()) return null;
  const a = app.auth.appareils.find((x) => x.id === id) ?? null;
  if (a) app.auth.appareils = app.auth.appareils.filter((x) => x.id !== id);
  return a;
}

// ------------------------------------------------------------------ session
export function ouvrirSession() {
  app.auth.verrou = apresSucces();
  enregistrerCetAppareil();
  app.auth.connecte = true;
  app.auth.derniereActivite = maintenant();
}
/** Le verrou de 15 minutes est passé : on repart avec trois essais neufs. */
export function purgerVerrou() {
  const v = app.auth.verrou;
  if (v.verrouJusqua != null && !estVerrouille(v, maintenant())) app.auth.verrou = apresSucces();
}
export type ResultatCode = 'ok' | 'nouvel_appareil' | 'faux' | 'verrouille' | 'bloque' | 'aucun_compte';
/** Teste le code de l'app : compte les échecs, verrouille 15 minutes au troisième. */
export async function tenterCode(code: string): Promise<ResultatCode> {
  if (!app.auth.hash || !app.auth.sel) return 'aucun_compte';
  purgerVerrou();
  if (estVerrouille(app.auth.verrou, maintenant())) return 'verrouille';
  if (estBloque()) return 'bloque';
  const bon = await verifierHash(code, app.auth.sel, app.auth.hash);
  if (!bon) {
    app.auth.verrou = apresEchec(app.auth.verrou, maintenant());
    return estVerrouille(app.auth.verrou, maintenant()) ? 'verrouille' : 'faux';
  }
  if (estNouvelAppareil()) { temp.codeVerifie = true; temp.smsVerifie = false; return 'nouvel_appareil'; }
  ouvrirSession();
  return 'ok';
}
/** Vérifie le code sans toucher aux compteurs (changement de code, démo). */
export async function codeCompteValide(code: string): Promise<boolean> {
  return !!app.auth.hash && !!app.auth.sel && (await verifierHash(code, app.auth.sel, app.auth.hash));
}
/** Contrôle le code d'un utilisateur déjà connecté (changement de code, paiement protégé) : les échecs comptent pour le verrouillage. */
export async function verifierCode(code: string): Promise<'ok' | 'faux' | 'verrouille'> {
  purgerVerrou();
  if (estVerrouille(app.auth.verrou, maintenant())) return 'verrouille';
  if (await codeCompteValide(code)) { app.auth.verrou = apresSucces(); return 'ok'; }
  app.auth.verrou = apresEchec(app.auth.verrou, maintenant());
  return estVerrouille(app.auth.verrou, maintenant()) ? 'verrouille' : 'faux';
}
export function deconnecter(portee: 'ici' | 'tous') {
  app.auth.connecte = false; app.auth.derniereActivite = 0;
  if (portee === 'tous') app.auth.appareils = app.auth.appareils.filter((a) => a.id === idAppareil());
}

// ------------------------------------------------------------------ changement et oubli du code
export type ResultatChangement = 'ok' | 'ancien_faux' | 'identique' | 'simple';
export async function changerCode(ancien: string, nouveau: string): Promise<ResultatChangement> {
  if (!(await codeCompteValide(ancien))) return 'ancien_faux';
  if (codeTropSimple(nouveau)) return 'simple';
  if (nouveau === ancien) return 'identique';
  await poserCode(nouveau);
  return 'ok';
}
async function poserCode(code: string) {
  const sel = selAleatoire();
  app.auth.hash = await hacher(code, sel);
  app.auth.sel = sel;
  app.auth.verrou = apresSucces();
  etatAuth().codeModifieLe = maintenant();
}
/** Code oublié, après vérification du SMS : nouveau code, autres appareils déconnectés, blocages levés. */
export async function reinitialiserCode(nouveau: string): Promise<'ok' | 'simple' | 'identique'> {
  if (codeTropSimple(nouveau)) return 'simple';
  if (await codeCompteValide(nouveau)) return 'identique';
  await poserCode(nouveau);
  app.auth.appareils = [];
  etatAuth().bloques = [];
  app.auth.connecte = false; app.auth.derniereActivite = 0;
  temp.smsVerifie = false;
  return 'ok';
}

// ------------------------------------------------------------------ inscription
/** Crée le compte à partir du brouillon et du code confirmé. Le code n'est gardé que haché (PBKDF2 + sel). */
export async function creerCompte(code: string) {
  const b = { ...etatAuth().brouillon };
  const now = maintenant();
  const employeur = trouverEmployeur(b.employeur);
  const { nom, prenom } = separerNom(b.nomComplet);
  const sel = selAleatoire();
  const hash = await hacher(code, sel);
  reinitialiser('vierge');
  const tel = chiffresTel(b.tel);
  const aujourdhui = jourDe(new Date(now));
  app.compte = {
    id: nouvelId('u'), prenom, nom, telephone: tel, ville: '', quartier: '', employeur: employeur?.nomCompte ?? '', salaireNet: 0, jourPaie: 28,
    anciennete: '', pass: b.pass, numeroMembre: numerosMembre(tel).membre, cree: now
  };
  app.score.valeur = scoreDepart(employeur);
  app.dernierePaie = aujourdhui;
  Object.assign(app.auth, { hash, sel, connecte: true, derniereActivite: now, telephoneEnCours: null, otp: null });
  app.auth.appareils = [appareilCourant()];
  const e = etatAuth();
  e.employeurCode = employeur?.code ?? '';
  e.facturation = b.facturation;
  e.operateur = b.operateur;
  e.passEcheance = prochainePaie(aujourdhui, 28);
  notifier({ titre: 'Bienvenue chez AssureMe', sous: `Votre Pass ${planDe(b.pass).nom} est actif.` });
  temp.premierCode = '';
}

// ------------------------------------------------------------------ compte démo / vierge
export async function activerDemo() {
  const sel = selAleatoire();
  const hash = await hacher(CODE_DEMO, sel);
  reinitialiser('demo');
  const now = maintenant();
  const cet = appareilCourant();
  Object.assign(app.auth, { hash, sel, connecte: true, derniereActivite: now, biometrie: true });
  app.auth.appareils = [
    { ...cet, lieu: 'Douala', biometrie: true },
    { id: 'd-pixel', nom: 'Google Pixel 7', lieu: 'Douala', quand: now - 2 * 3600_000, actuel: false },
    { id: 'd-tablette', nom: 'Tablette Samsung', lieu: 'Yaoundé', quand: now - 6 * 86_400_000, actuel: false }
  ];
}
export function quitterDemo() { reinitialiser('vierge'); }

// ------------------------------------------------------------------ biométrie
export type ResultatBiometrie = 'ok' | 'indisponible' | 'annule' | 'echec';
export async function activerBiometrie(): Promise<ResultatBiometrie> {
  const c = app.compte; if (!c) return 'echec';
  const r = await enregistrerBiometrie({ id: c.id, nom: `${c.prenom} ${c.nom}`.trim() });
  if (!r.ok) return r.raison;
  app.auth.biometrie = true; app.auth.idBiometrie = r.id;
  const a = app.auth.appareils.find((x) => x.id === idAppareil()); if (a) a.biometrie = true;
  return 'ok';
}
export function desactiverBiometrie() {
  app.auth.biometrie = false; app.auth.idBiometrie = null;
  app.auth.appareils.forEach((a) => { if (a.id === idAppareil()) a.biometrie = false; });
}
/** Reconnexion par visage ou empreinte (clé WebAuthn de cet appareil). Le verrou par code reste prioritaire. */
export async function connecterParBiometrie(): Promise<ResultatBiometrie | 'verrouille' | 'bloque'> {
  purgerVerrou();
  if (estVerrouille(app.auth.verrou, maintenant())) return 'verrouille';
  if (estBloque()) return 'bloque';
  if (!app.auth.idBiometrie) return 'indisponible';
  const r = await verifierBiometrie(app.auth.idBiometrie);
  if (!r.ok) return r.raison;
  ouvrirSession();
  return 'ok';
}
/** Démonstration seulement : le compte de démo n'a pas de vraie clé biométrique, on simule la reconnaissance. */
export const biometrieSimulee = () => app.mode === 'demo' && !app.auth.idBiometrie;
export function connecterBiometrieSimulee(): boolean {
  purgerVerrou();
  if (!biometrieSimulee() || estVerrouille(app.auth.verrou, maintenant()) || estBloque()) return false;
  ouvrirSession();
  return true;
}

// ------------------------------------------------------------------ notifications
export function lirePermissionNotif(): PermissionNotif {
  if (typeof Notification === 'undefined') return 'indisponible';
  return Notification.permission === 'granted' ? 'accordee' : Notification.permission === 'denied' ? 'refusee' : 'inconnue';
}
/** Demande l'autorisation d'afficher des notifications (best-effort : pas d'envoi push réel sans serveur). */
export async function demanderPermissionNotif(): Promise<PermissionNotif> {
  let p = lirePermissionNotif();
  if (p === 'inconnue') {
    try { const r = await Notification.requestPermission(); p = r === 'granted' ? 'accordee' : r === 'denied' ? 'refusee' : 'inconnue'; } catch { p = 'indisponible'; }
  }
  etatAuth().permissionNotif = p;
  return p;
}

// ------------------------------------------------------------------ profil
export function changerPass(pass: Pass, facturation: Facturation) {
  const c = app.compte; if (!c) return;
  const e = etatAuth();
  if (c.pass !== pass || e.facturation !== facturation) notifier({ titre: `Pass ${planDe(pass).nom} activé`, sous: facturation === 'annuel' ? 'Facturation annuelle, 10 % de remise.' : 'Facturation mensuelle sur salaire.' });
  c.pass = pass; e.facturation = facturation;
  const max = pass === 'essentiel' ? 0 : 5;
  if (e.proches.length > max) e.proches.splice(max);
}
export interface InfosPaie { employeur: string; codeEmployeur: string; salaireNet: number; jourPaie: number }
export function mettreAJourInfos(i: InfosPaie): string | null {
  const c = app.compte; if (!c) return 'Aucun compte.';
  if (!Number.isInteger(i.salaireNet) || i.salaireNet < 0 || i.salaireNet > 100_000_000) return 'Salaire net : montant entier entre 0 et 100 000 000 FCFA.';
  if (!Number.isInteger(i.jourPaie) || i.jourPaie < 1 || i.jourPaie > 31) return 'Jour de paie : entre 1 et 31.';
  const code = i.codeEmployeur.trim();
  const emp = code ? trouverEmployeur(code) : null;
  if (code && !emp) return 'Code employeur inconnu. Vérifiez avec les RH ou laissez vide.';
  c.salaireNet = i.salaireNet; c.jourPaie = i.jourPaie;
  c.employeur = emp ? emp.nomCompte : i.employeur.trim();
  etatAuth().employeurCode = emp?.code ?? '';
  etatAuth().passEcheance = prochainePaie(jourDe(new Date(maintenant())), i.jourPaie);
  return null;
}
export function ajouterProche(nom: string, lien: Proche['lien']): string | null {
  const e = etatAuth(); const c = app.compte;
  const n = nom.trim();
  if (n.length < 2) return 'Indiquez un prénom.';
  const max = c?.pass === 'essentiel' ? 0 : 5;
  if (e.proches.length >= max) return max === 0 ? 'Le Pass Essentiel couvre une seule personne.' : 'La carte famille compte 6 personnes au maximum.';
  if (e.proches.some((p) => p.nom.toLowerCase() === n.toLowerCase())) return 'Ce proche est déjà ajouté.';
  e.proches.push({ id: nouvelId('p'), nom: n, lien });
  e.cartesDemandees = false;
  return null;
}
export function retirerProche(id: string) { const e = etatAuth(); e.proches = e.proches.filter((p) => p.id !== id); e.cartesDemandees = false; }
