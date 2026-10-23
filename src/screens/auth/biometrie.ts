// Biométrie best-effort par WebAuthn (clé de plateforme). Sans authentificateur, sans HTTPS ou refus : repli propre sur le code.
import { optionsAuthentification, optionsCreation, versBase64url } from '../../core/webauthn.ts';

export type ResultatBio = { ok: true; id: string } | { ok: false; raison: 'indisponible' | 'annule' | 'echec' };

function defi(): Uint8Array<ArrayBuffer> { const a = new Uint8Array(new ArrayBuffer(32)); crypto.getRandomValues(a); return a; }

export async function biometrieDisponible(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.isSecureContext || !('PublicKeyCredential' in window) || !navigator.credentials) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}
const raisonErreur = (e: unknown): 'annule' | 'echec' => (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError') ? 'annule' : 'echec');

/** Enregistre une clé sur cet appareil ; renvoie l'identifiant de la clé (base64url). */
export async function enregistrerBiometrie(utilisateur: { id: string; nom: string }): Promise<ResultatBio> {
  if (!(await biometrieDisponible())) return { ok: false, raison: 'indisponible' };
  try {
    const cred = await navigator.credentials.create({
      publicKey: optionsCreation({ defi: defi(), idUtilisateur: new TextEncoder().encode(utilisateur.id) as Uint8Array<ArrayBuffer>, nom: utilisateur.id, affichage: utilisateur.nom })
    }) as PublicKeyCredential | null;
    return cred ? { ok: true, id: versBase64url(cred.rawId) } : { ok: false, raison: 'annule' };
  } catch (e) { return { ok: false, raison: raisonErreur(e) }; }
}
/** Demande au système de reconnaître le visage ou l'empreinte avec la clé enregistrée. */
export async function verifierBiometrie(idCredential: string): Promise<ResultatBio> {
  if (!(await biometrieDisponible())) return { ok: false, raison: 'indisponible' };
  try {
    const cred = await navigator.credentials.get({ publicKey: optionsAuthentification(defi(), idCredential) }) as PublicKeyCredential | null;
    return cred && versBase64url(cred.rawId) === idCredential ? { ok: true, id: idCredential } : { ok: false, raison: 'echec' };
  } catch (e) { return { ok: false, raison: raisonErreur(e) }; }
}
