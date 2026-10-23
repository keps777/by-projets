// Biométrie (WebAuthn) : fabrication des options et conversions binaires. Fonctions pures ; les appels navigateur sont dans screens/auth/biometrie.ts.
export function versBase64url(octets: ArrayBuffer | Uint8Array): string {
  const a = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let s = '';
  for (const o of a) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function depuisBase64url(texte: string): Uint8Array<ArrayBuffer> {
  const b = texte.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const a = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
export interface ParamsCreation { defi: Uint8Array<ArrayBuffer>; idUtilisateur: Uint8Array<ArrayBuffer>; nom: string; affichage: string }
/** Clé liée à l'appareil (authentificateur de plateforme), vérification de l'utilisateur obligatoire. */
export function optionsCreation(p: ParamsCreation): PublicKeyCredentialCreationOptions {
  return {
    challenge: p.defi,
    rp: { name: 'AssureMe' },
    user: { id: p.idUtilisateur, name: p.nom, displayName: p.affichage },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60_000,
    attestation: 'none'
  };
}
export function optionsAuthentification(defi: Uint8Array<ArrayBuffer>, idCredential: string): PublicKeyCredentialRequestOptions {
  return { challenge: defi, allowCredentials: [{ type: 'public-key', id: depuisBase64url(idCredential) }], userVerification: 'required', timeout: 60_000 };
}
